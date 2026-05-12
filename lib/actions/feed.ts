'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { trips, media, messages, matches } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/current-user';
import { AuthorizationError, requireAuth } from '@/lib/auth/permissions';

function trim(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

async function getTripId(): Promise<string> {
  const [trip] = await db.select().from(trips).limit(1);
  if (!trip) throw new Error('No trip configured');
  return trip.id;
}

async function validateMatchInTrip(
  matchId: string | null,
  tripId: string
): Promise<void> {
  if (!matchId) return;
  const [m] = await db
    .select({ id: matches.id })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!m) throw new Error('Match not found');
}

export async function createMediaPost(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  requireAuth(ctx);

  const url = trim(formData.get('url'));
  if (!url) throw new Error('Media URL required');

  const mediaTypeRaw = trim(formData.get('mediaType')) ?? 'image';
  const mediaType: 'image' | 'video' =
    mediaTypeRaw === 'video' ? 'video' : 'image';

  const caption = trim(formData.get('caption'));
  const matchId = trim(formData.get('matchId'));

  const tripId = await getTripId();
  await validateMatchInTrip(matchId, tripId);

  await db.insert(media).values({
    tripId,
    matchId: matchId,
    uploadedBy: ctx.user.id,
    url,
    mediaType,
    caption,
  });

  revalidatePath('/feed');
  if (matchId) revalidatePath(`/matches/${matchId}`);
}

export async function createTextPost(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  requireAuth(ctx);

  const body = trim(formData.get('body'));
  if (!body) throw new Error('Message body required');

  const tripId = await getTripId();

  await db.insert(messages).values({
    tripId,
    authorId: ctx.user.id,
    body,
  });

  revalidatePath('/feed');
}

export async function deleteFeedItem(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  requireAuth(ctx);

  const kind = trim(formData.get('kind'));
  const id = trim(formData.get('id'));
  if (!kind || !id) throw new Error('kind and id required');

  if (kind === 'media') {
    const [row] = await db
      .select()
      .from(media)
      .where(eq(media.id, id))
      .limit(1);
    if (!row) return;
    if (row.uploadedBy !== ctx.user.id && !ctx.isPlatformAdmin) {
      throw new AuthorizationError('Only the uploader or platform admin can delete');
    }
    await db.delete(media).where(eq(media.id, id));
  } else if (kind === 'text') {
    const [row] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, id))
      .limit(1);
    if (!row) return;
    if (row.authorId !== ctx.user.id && !ctx.isPlatformAdmin) {
      throw new AuthorizationError('Only the author or platform admin can delete');
    }
    await db.delete(messages).where(eq(messages.id, id));
  } else {
    throw new Error('Cannot delete this item kind');
  }

  revalidatePath('/feed');
}
