'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { media, messages, matches, rounds } from '@/db/schema';
import {
  AuthorizationError,
  canEditTrip,
  requireAuth,
} from '@/lib/auth/permissions';
import { getTripAuthContext, getTripSlugById } from '@/lib/auth/trip-context';
import { moderateImage } from '@/lib/moderation/sightengine';

function trim(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function readTripId(formData: FormData): string {
  const tripId = String(formData.get('tripId') ?? '').trim();
  if (!tripId) throw new Error('tripId is required');
  return tripId;
}

async function validateMatchInTrip(
  matchId: string | null,
  tripId: string
): Promise<void> {
  if (!matchId) return;
  const [m] = await db
    .select({ id: matches.id, tripId: rounds.tripId })
    .from(matches)
    .innerJoin(rounds, eq(rounds.id, matches.roundId))
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!m) throw new Error('Match not found');
  if (m.tripId !== tripId) throw new Error('Match is not on this trip');
}

export async function createMediaPost(formData: FormData): Promise<void> {
  const tripId = readTripId(formData);
  const ctx = await getTripAuthContext(tripId);
  requireAuth(ctx);
  if (!ctx.tripMember && !ctx.isPlatformAdmin) {
    throw new AuthorizationError('You are not on this trip');
  }

  const url = trim(formData.get('url'));
  if (!url) throw new Error('Media URL required');

  const mediaTypeRaw = trim(formData.get('mediaType')) ?? 'image';
  const mediaType: 'image' | 'video' =
    mediaTypeRaw === 'video' ? 'video' : 'image';

  const caption = trim(formData.get('caption'));
  const matchId = trim(formData.get('matchId'));

  await validateMatchInTrip(matchId, tripId);

  // Moderation — image only for now. Videos pass through (would need frame
  // sampling for proper video moderation; deferred to later).
  let moderationStatus: 'approved' | 'flagged' = 'approved';
  let moderationReason: string | null = null;
  if (mediaType === 'image') {
    const result = await moderateImage(url);
    if (result.flagged) {
      moderationStatus = 'flagged';
      moderationReason = result.reason;
    }
  }

  await db.insert(media).values({
    tripId,
    matchId: matchId,
    uploadedBy: ctx.user.id,
    url,
    mediaType,
    caption,
    moderationStatus,
    moderationReason,
    moderationCheckedAt: new Date(),
  });

  const tripSlug = await getTripSlugById(tripId);
  revalidatePath(`/trips/${tripSlug}/feed`);
  if (matchId) revalidatePath(`/trips/${tripSlug}/matches/${matchId}`);
}

export async function unflagMediaPost(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '').trim();
  if (!id) throw new Error('id required');

  const [row] = await db
    .select({ tripId: media.tripId })
    .from(media)
    .where(eq(media.id, id))
    .limit(1);
  if (!row) throw new Error('Media not found');

  const ctx = await getTripAuthContext(row.tripId);
  requireAuth(ctx);
  if (!canEditTrip(ctx, row.tripId)) {
    throw new AuthorizationError('Trip admin required');
  }

  await db
    .update(media)
    .set({ moderationStatus: 'approved', moderationReason: null })
    .where(eq(media.id, id));

  const tripSlug = await getTripSlugById(row.tripId);
  revalidatePath(`/trips/${tripSlug}/feed`);
}

export async function createTextPost(formData: FormData): Promise<void> {
  const tripId = readTripId(formData);
  const ctx = await getTripAuthContext(tripId);
  requireAuth(ctx);
  if (!ctx.tripMember && !ctx.isPlatformAdmin) {
    throw new AuthorizationError('You are not on this trip');
  }

  const body = trim(formData.get('body'));
  if (!body) throw new Error('Message body required');

  await db.insert(messages).values({
    tripId,
    authorId: ctx.user.id,
    body,
  });

  const tripSlug = await getTripSlugById(tripId);
  revalidatePath(`/trips/${tripSlug}/feed`);
}

export async function deleteFeedItem(formData: FormData): Promise<void> {
  const kind = trim(formData.get('kind'));
  const id = trim(formData.get('id'));
  if (!kind || !id) throw new Error('kind and id required');

  // Fetch the row first so we know which trip's context to load. The auth
  // check has to be scoped to THIS post's trip — a Trip A admin must not be
  // able to delete Trip B's posts.
  let tripId: string;
  let ownerUserId: string;
  if (kind === 'media') {
    const [row] = await db
      .select()
      .from(media)
      .where(eq(media.id, id))
      .limit(1);
    if (!row) return;
    tripId = row.tripId;
    ownerUserId = row.uploadedBy;
  } else if (kind === 'text') {
    const [row] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, id))
      .limit(1);
    if (!row) return;
    tripId = row.tripId;
    ownerUserId = row.authorId;
  } else {
    throw new Error('Cannot delete this item kind');
  }

  const ctx = await getTripAuthContext(tripId);
  requireAuth(ctx);
  const isOwner = ownerUserId === ctx.user.id;
  const isAdmin = canEditTrip(ctx, tripId);
  if (!isOwner && !isAdmin) {
    throw new AuthorizationError('Only the author or an admin can delete');
  }

  if (kind === 'media') {
    await db.delete(media).where(eq(media.id, id));
  } else {
    await db.delete(messages).where(eq(messages.id, id));
  }

  const tripSlug = await getTripSlugById(tripId);
  revalidatePath(`/trips/${tripSlug}/feed`);
}
