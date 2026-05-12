'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tripMembers, teams } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/current-user';
import {
  AuthorizationError,
  isPlatformAdmin,
  isTripAdminOf,
} from '@/lib/auth/permissions';

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

  const email = String(formData.get('email') ?? '').trim();
  if (!email) throw new Error('Email is required');

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

  revalidatePath('/admin/players');
  revalidatePath('/schedule');
  revalidatePath('/scoreboard');
  redirect('/admin/players');
}
