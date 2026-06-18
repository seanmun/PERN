'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { teams } from '@/db/schema';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import {
  AuthorizationError,
  isPlatformAdmin,
  isTripAdminOf,
} from '@/lib/auth/permissions';
import { getTripSlugById } from '@/lib/auth/trip-context';

function trim(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function readColor(v: FormDataEntryValue | null): string | null {
  const s = trim(v);
  if (!s) return null;
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) {
    throw new Error(`Invalid color "${s}". Use a #RRGGBB hex value.`);
  }
  return s.toLowerCase();
}

export async function updateTeam(formData: FormData): Promise<void> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const id = String(formData.get('id') ?? '').trim();
  if (!id) throw new Error('Team id required');

  const [existing] = await db
    .select()
    .from(teams)
    .where(eq(teams.id, id))
    .limit(1);
  if (!existing) throw new Error('Team not found');

  if (!isPlatformAdmin(ctx) && !isTripAdminOf(ctx, existing.tripId)) {
    throw new AuthorizationError('Trip admin required');
  }

  const name = trim(formData.get('name'));
  if (!name) throw new Error('Team name is required');
  if (name.length > 40) throw new Error('Team name is too long (40 char max)');

  const color = readColor(formData.get('color'));

  await db
    .update(teams)
    .set({ name, color })
    .where(eq(teams.id, id));

  const tripSlug = await getTripSlugById(existing.tripId);
  // Team name/color flows through schedule, scoreboard, match detail, feed
  // (every score post has the team color stripe), and player rows. Nuke the
  // whole trip's cache rather than chase every route.
  revalidatePath(`/trips/${tripSlug}`, 'layout');
}
