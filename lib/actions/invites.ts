'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { Resend } from 'resend';
import { db } from '@/db/client';
import { tripMembers, trips } from '@/db/schema';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import {
  AuthorizationError,
  isPlatformAdmin,
  isTripAdminOf,
} from '@/lib/auth/permissions';
import InviteEmail from '@/lib/email/InviteEmail';

/**
 * Send a player-invite email. Trip-admin (or platform-admin) only. The
 * recipient row must have an email set — shell players can't be invited
 * until the admin assigns them an email first.
 *
 * Recipient flow: clicks the "Claim your spot" CTA → /sign-in with a
 * redirect to /trips/[slug] → Clerk magic-link → getGlobalAuthContext
 * runs the lazy-claim → tripMember.userId is stitched on first load.
 *
 * We don't mark anything in the DB on send — Resend's dashboard is the
 * audit log for who got what. If we ever need delivery tracking inside
 * the app we'll add an invites table; for MVP that's overkill.
 */
export async function sendPlayerInvite(formData: FormData): Promise<void> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const tripMemberId = String(formData.get('tripMemberId') ?? '').trim();
  if (!tripMemberId) throw new Error('tripMemberId required');

  // Pull the player + trip in one round-trip so we can validate, scope auth
  // and feed copy into the email all from one row.
  const [row] = await db
    .select({
      member: tripMembers,
      trip: trips,
    })
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

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      'RESEND_API_KEY is not configured. Set it in your environment.',
    );
  }
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const fromName = process.env.RESEND_FROM_NAME ?? 'BuddyCup';
  if (!fromEmail) {
    throw new Error(
      'RESEND_FROM_EMAIL is not configured. Set it in your environment.',
    );
  }

  // App origin for the invite link. NEXT_PUBLIC_APP_URL is the canonical
  // domain — fall back to the Vercel-assigned URL in non-prod so preview
  // deploys at least produce a working (preview) link.
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  const tripPath = `/trips/${row.trip.slug}`;
  const signInUrl = `${origin}/sign-in?redirect_url=${encodeURIComponent(tripPath)}`;

  // Inviter name: prefer the admin's full name, otherwise the email local
  // part. Avoids "undefined added you to ..." when the user hasn't filled
  // their profile yet.
  const inviterName =
    ctx.user.fullName?.trim() ||
    ctx.user.displayName?.trim() ||
    ctx.user.email.split('@')[0];

  // Date line — keep concise for the hero. Multi-day trips show a range;
  // single-day events show one day.
  const dateLine = buildDateLine(row.trip.startDate, row.trip.endDate);

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to: row.member.email,
    subject: `${inviterName} added you to ${row.trip.name}`,
    react: InviteEmail({
      inviteeName: row.member.nickname,
      inviterName,
      eventName: row.trip.name,
      eventKind: row.trip.kind,
      dateLine,
      signInUrl,
    }),
  });

  if (error) {
    // Resend surfaces a structured error — re-throw with the message so the
    // admin UI shows what went wrong (bad address, domain not verified, etc.).
    throw new Error(`Email failed: ${error.message}`);
  }

  revalidatePath(`/trips/${row.trip.slug}/admin/players`);
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
