'use server';

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { clerkClient } from '@clerk/nextjs/server';
import { Resend } from 'resend';
import { db } from '@/db/client';
import { tripMembers, trips } from '@/db/schema';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import {
  AuthorizationError,
  isPlatformAdmin,
  isTripAdminOf,
} from '@/lib/auth/permissions';

/**
 * Player invite — single email, single click.
 *
 * Flow:
 *   1. Resolve the player + trip and check trip-admin auth.
 *   2. Ask Clerk for a one-click magic link for the player's email:
 *      - If the email already has a Clerk account → a sign-in token URL
 *        (lands them straight in, signed in).
 *      - If not → a Clerk Invitation with notify=false (Clerk creates the
 *        account on click, redirects to the trip).
 *      Either way, ONE URL that handles both new and returning users.
 *   3. Embed that URL as the "Claim your spot" button in our branded Resend
 *      email. We do not let Clerk send its own invite email.
 *
 * Edge cases:
 *   - Pending Clerk invitation already exists (admin re-invites): reuse the
 *     existing invitation URL instead of creating a duplicate.
 *
 * No DB writes for invites — Resend's dashboard is the audit log. If we need
 * delivery tracking later we'll add an invites table.
 */
export async function sendPlayerInvite(formData: FormData): Promise<void> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const tripMemberId = String(formData.get('tripMemberId') ?? '').trim();
  if (!tripMemberId) throw new Error('tripMemberId required');

  const [row] = await db
    .select({ member: tripMembers, trip: trips })
    .from(tripMembers)
    .innerJoin(trips, eq(tripMembers.tripId, trips.id))
    .where(eq(tripMembers.id, tripMemberId))
    .limit(1);
  if (!row) throw new Error('Player not found');

  if (!isPlatformAdmin(ctx) && !isTripAdminOf(ctx, row.member.tripId)) {
    throw new AuthorizationError('Trip admin required');
  }

  if (!row.member.email) {
    throw new Error(
      "This player has no email yet — set one before sending an invite.",
    );
  }
  const recipientEmail = row.member.email.toLowerCase();

  // Env wiring. Each is its own assertion so the admin sees exactly what's
  // missing if they forgot to set one in Vercel.
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) throw new Error('RESEND_API_KEY is not configured.');
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!fromEmail) throw new Error('RESEND_FROM_EMAIL is not configured.');
  const fromName = process.env.RESEND_FROM_NAME ?? 'BuddyCup';

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  // Where Clerk sends them after the magic link is processed. Schedule is
  // the natural first view of an event — they see rounds, course, matchups.
  const tripPath = `/trips/${row.trip.slug}/schedule`;
  const redirectUrl = `${origin}${tripPath}`;

  const inviteUrl = await getOrCreateMagicLink({
    email: recipientEmail,
    redirectUrl,
    tripMemberId,
    tripId: row.member.tripId,
    origin,
  });

  // Inviter name — prefer real name, fall back to email local part.
  const inviterName =
    ctx.user.fullName?.trim() ||
    ctx.user.displayName?.trim() ||
    ctx.user.email.split('@')[0];

  const dateLine = buildDateLine(row.trip.startDate, row.trip.endDate);

  const html = await renderInviteHtml({
    inviteeName: row.member.nickname,
    inviterName,
    eventName: row.trip.name,
    eventKind: row.trip.kind,
    dateLine,
    signInUrl: inviteUrl,
  });

  const resend = new Resend(resendKey);
  const { error } = await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to: recipientEmail,
    subject: `${inviterName} added you to ${row.trip.name}`,
    html,
  });

  if (error) {
    throw new Error(`Email failed: ${error.message}`);
  }

  revalidatePath(`/trips/${row.trip.slug}/admin/players`);
}

/**
 * Ask Clerk for a one-click URL that will sign the recipient in (existing
 * user) or sign them up (new user). Returns the URL we put in the email.
 *
 * Existing users: sign-in token → URL goes through our /sign-in page which
 * activates Clerk's ticket and bounces to redirect_url.
 *
 * New users: invitation with notify=false → Clerk returns a hosted URL that
 * creates the account on click and redirects.
 *
 * If a pending invitation already exists for this email (admin re-invites),
 * reuse its URL — Clerk rejects duplicate-create otherwise.
 */
async function getOrCreateMagicLink({
  email,
  redirectUrl,
  tripMemberId,
  tripId,
  origin,
}: {
  email: string;
  redirectUrl: string;
  tripMemberId: string;
  tripId: string;
  origin: string;
}): Promise<string> {
  const client = await clerkClient();

  // 1) Existing Clerk user with this email?
  const userList = await client.users.getUserList({ emailAddress: [email] });
  if (userList.data.length > 0) {
    const user = userList.data[0];
    const signInToken = await client.signInTokens.createSignInToken({
      userId: user.id,
      expiresInSeconds: 60 * 60 * 24 * 7, // 7 days
    });
    // Wire through our own /sign-in so the redirect_url honors our routing.
    const params = new URLSearchParams({
      __clerk_ticket: signInToken.token,
      redirect_url: redirectUrl,
    });
    return `${origin}/sign-in?${params.toString()}`;
  }

  // 2) No existing user — issue an Invitation.
  try {
    const invitation = await client.invitations.createInvitation({
      emailAddress: email,
      redirectUrl,
      notify: false,
      publicMetadata: { tripMemberId, tripId },
    });
    return invitation.url ?? `${origin}/sign-up`;
  } catch (err) {
    // Duplicate-record error → there's already a pending invitation. Reuse it.
    if (isClerkDuplicate(err)) {
      const list = await client.invitations.getInvitationList({
        status: 'pending',
      });
      const existing = list.data.find(
        (inv) => inv.emailAddress.toLowerCase() === email,
      );
      if (existing) return existing.url ?? `${origin}/sign-up`;
    }
    throw err;
  }
}

function isClerkDuplicate(err: unknown): boolean {
  // Clerk SDK errors carry an `errors` array with `code` fields. Duplicate
  // invitations typically use "duplicate_record" or HTTP 422.
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { status?: number; errors?: { code?: string }[] };
  if (e.status === 422) return true;
  return Boolean(e.errors?.some((x) => x.code === 'duplicate_record'));
}

/**
 * Load the HTML invite template from disk and substitute tokens.
 *
 * Why file-based: the template is hand-authored externally (designed in a
 * separate tool, includes Kinetic-style interactive tabs + an MSO fallback).
 * Re-rendering it as JSX would be lossy. Loading once per send and doing
 * simple {{token}} substitution keeps the design pristine.
 *
 * All caller-supplied values are HTML-escaped so a player nickname like
 * "Gerry <script>" can't break out of an attribute or inject markup.
 * signInUrl is the lone exception — Clerk's URL is trusted, and escaping
 * it would mangle the query params.
 */
async function renderInviteHtml(vars: {
  inviteeName: string;
  inviterName: string;
  eventName: string;
  eventKind: 'trip' | 'outing' | 'match';
  dateLine: string | null;
  signInUrl: string;
}): Promise<string> {
  const templatePath = path.join(
    process.cwd(),
    'lib',
    'email',
    'invite.html',
  );
  const template = await fs.readFile(templatePath, 'utf-8');

  const eventKindNoun =
    vars.eventKind === 'trip'
      ? 'trip'
      : vars.eventKind === 'outing'
        ? 'outing'
        : 'match';

  const subs: Record<string, string> = {
    inviteeName: escapeHtml(vars.inviteeName),
    inviterName: escapeHtml(vars.inviterName),
    eventName: escapeHtml(vars.eventName),
    eventKind: vars.eventKind,
    eventKindNoun,
    dateLine: vars.dateLine ? escapeHtml(vars.dateLine) : '',
    // URLs aren't escaped — Clerk's ticket URLs include query params that
    // HTML-escape would garble. They come straight from Clerk's SDK.
    signInUrl: vars.signInUrl,
  };

  return template.replace(/\{\{([a-zA-Z_]+)\}\}/g, (_match, name: string) => {
    return Object.prototype.hasOwnProperty.call(subs, name) ? subs[name] : '';
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildDateLine(start: Date | null, end: Date | null): string | null {
  if (!start) return null;
  const dateFmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
  const yearFmt = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    timeZone: 'America/New_York',
  });
  const startStr = dateFmt.format(start);
  if (!end || end.getTime() === start.getTime()) {
    return `${startStr}, ${yearFmt.format(start)}`;
  }
  return `${startStr} – ${dateFmt.format(end)}, ${yearFmt.format(end)}`;
}
