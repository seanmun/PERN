'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { tripMembers, teams, matchParticipants, matches, rounds, users } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/current-user';
import {
  AuthorizationError,
  isPlatformAdmin,
  isTripAdminOf,
} from '@/lib/auth/permissions';
import { getTripSlugById } from '@/lib/auth/trip-context';

function trimOrNull(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function parseHandicap(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  if (Number.isNaN(n)) throw new Error('Handicap must be a number');
  if (n < -10 || n > 54) throw new Error('Handicap must be between -10 and 54');
  return n.toFixed(1);
}

export async function createPlayer(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const tripId = String(formData.get('tripId') ?? '').trim();
  if (!tripId) throw new Error('tripId is required');

  if (!isPlatformAdmin(ctx) && !isTripAdminOf(ctx, tripId)) {
    throw new AuthorizationError('Trip admin required');
  }

  const nickname = String(formData.get('nickname') ?? '').trim();
  if (!nickname) throw new Error('Nickname is required');

  // Email is optional. Blank → "shell" tripMember that won't lazy-claim
  // until an admin (or the user, via a future claim flow) fills the email in.
  const rawEmail = String(formData.get('email') ?? '').trim().toLowerCase();
  const email = rawEmail || null;
  if (email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Email looks invalid');
    }
    const [duplicate] = await db
      .select({ id: tripMembers.id })
      .from(tripMembers)
      .where(
        and(
          eq(tripMembers.tripId, tripId),
          sql`lower(${tripMembers.email}) = ${email}`,
        ),
      )
      .limit(1);
    if (duplicate) {
      throw new Error(`${email} is already on this trip.`);
    }
  }

  // Linking an existing platform user directly (from the search picker on
  // the admin's new-player form). When set, we attach the userId immediately
  // and inherit the user's avatar/handicap so the row looks claimed from
  // the moment it's created.
  const linkedUserId = trimOrNull(formData.get('linkedUserId'));
  let avatarUrl: string | null = null;
  let tripHandicap = parseHandicap(formData.get('tripHandicap'));
  if (linkedUserId) {
    const [linkedUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, linkedUserId))
      .limit(1);
    if (!linkedUser) throw new Error('Selected user not found');
    avatarUrl = linkedUser.avatarUrl;
    if (tripHandicap == null && linkedUser.handicap) {
      tripHandicap = linkedUser.handicap;
    }
  }

  const teamId = trimOrNull(formData.get('teamId'));
  if (teamId) {
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);
    if (!team || team.tripId !== tripId) {
      throw new Error('Invalid team');
    }
  }

  await db.insert(tripMembers).values({
    tripId,
    email,
    userId: linkedUserId,
    nickname,
    avatarUrl,
    teamId: teamId ?? null,
    role: 'player',
    isCaptain: false,
    tripHandicap,
  });

  const tripSlug = await getTripSlugById(tripId);
  revalidatePath(`/trips/${tripSlug}/admin/players`);
  revalidatePath(`/trips/${tripSlug}/schedule`);
  revalidatePath(`/trips/${tripSlug}/scoreboard`);
  redirect(`/trips/${tripSlug}/admin/players`);
}

export async function updatePlayer(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const id = String(formData.get('id') ?? '').trim();
  if (!id) throw new Error('id required');

  const [existing] = await db
    .select()
    .from(tripMembers)
    .where(eq(tripMembers.id, id))
    .limit(1);
  if (!existing) throw new Error('Player not found');

  if (!isPlatformAdmin(ctx) && !isTripAdminOf(ctx, existing.tripId)) {
    throw new AuthorizationError('Trip admin required');
  }

  const nickname = String(formData.get('nickname') ?? '').trim();
  if (!nickname) throw new Error('Nickname is required');

  // Email is now optional — blank means shell player. If set, basic format check.
  const rawEmail = String(formData.get('email') ?? '').trim().toLowerCase();
  const email: string | null = rawEmail || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Email looks invalid');
  }

  const teamId = trimOrNull(formData.get('teamId'));
  // Validate teamId belongs to this trip if set
  if (teamId) {
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);
    if (!team || team.tripId !== existing.tripId) {
      throw new Error('Invalid team');
    }
  }

  const roleRaw = String(formData.get('role') ?? 'player');
  const role: 'player' | 'trip_admin' =
    roleRaw === 'trip_admin' ? 'trip_admin' : 'player';

  const isCaptain = formData.get('isCaptain') === 'on';

  await db
    .update(tripMembers)
    .set({
      nickname,
      email,
      teamId,
      role,
      isCaptain,
      tripHandicap: parseHandicap(formData.get('tripHandicap')),
      avatarUrl: trimOrNull(formData.get('avatarUrl')),
      scoutingReport: trimOrNull(formData.get('scoutingReport')),
    })
    .where(eq(tripMembers.id, id));

  // Re-sync the team assignment onto every uncompleted match this player is
  // in for this trip. Completed matches keep their original snapshot so
  // historical results aren't rewritten. Runs on every save (no diff check),
  // which also lets admins re-save a player to backfill matchups that drifted.
  if (teamId) {
    const inFlightMatches = await db
      .select({ id: matches.id })
      .from(matches)
      .innerJoin(rounds, eq(matches.roundId, rounds.id))
      .where(
        and(
          eq(rounds.tripId, existing.tripId),
          sql`${matches.status} <> 'completed'`,
        ),
      );
    const matchIds = inFlightMatches.map((m) => m.id);
    if (matchIds.length > 0) {
      await db
        .update(matchParticipants)
        .set({ teamId })
        .where(
          and(
            eq(matchParticipants.tripMemberId, id),
            inArray(matchParticipants.matchId, matchIds),
          ),
        );
    }
  }

  const tripSlug = await getTripSlugById(existing.tripId);
  // Clear every cached page under this trip — the team change cascades into
  // match-detail, team-roster, profile, schedule, scoreboard, and feed.
  revalidatePath(`/trips/${tripSlug}`, 'layout');
  redirect(`/trips/${tripSlug}/admin/players`);
}
