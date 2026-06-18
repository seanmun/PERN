'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  reactions,
  media,
  messages,
  holeScores,
  matches,
  rounds,
} from '@/db/schema';
import { AuthorizationError, requireAuth } from '@/lib/auth/permissions';
import { getTripAuthContext, getTripSlugById } from '@/lib/auth/trip-context';
import { REACTION_EMOJIS, REACTION_TARGET_KINDS } from '@/lib/feed/constants';

async function resolveTripIdForTarget(
  targetKind: 'score' | 'media' | 'text',
  targetId: string
): Promise<string | null> {
  if (targetKind === 'media') {
    const [row] = await db
      .select({ tripId: media.tripId })
      .from(media)
      .where(eq(media.id, targetId))
      .limit(1);
    return row?.tripId ?? null;
  }
  if (targetKind === 'text') {
    const [row] = await db
      .select({ tripId: messages.tripId })
      .from(messages)
      .where(eq(messages.id, targetId))
      .limit(1);
    return row?.tripId ?? null;
  }
  // score → hole_score → match → round → trip
  const [row] = await db
    .select({ tripId: rounds.tripId })
    .from(holeScores)
    .innerJoin(matches, eq(holeScores.matchId, matches.id))
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .where(eq(holeScores.id, targetId))
    .limit(1);
  return row?.tripId ?? null;
}

const VALID_EMOJIS = new Set<string>(REACTION_EMOJIS);
const VALID_KINDS = new Set<string>(REACTION_TARGET_KINDS);

export async function toggleReaction(formData: FormData): Promise<void> {
  const targetKindRaw = String(formData.get('targetKind') ?? '').trim();
  const targetId = String(formData.get('targetId') ?? '').trim();
  const emoji = String(formData.get('emoji') ?? '').trim();

  if (!VALID_KINDS.has(targetKindRaw)) throw new Error('Invalid target kind');
  if (!targetId) throw new Error('targetId required');
  if (!VALID_EMOJIS.has(emoji)) throw new Error('Invalid emoji');

  const targetKind = targetKindRaw as 'score' | 'media' | 'text';

  // Resolve the target's trip first so we can verify the caller is on it.
  // Any signed-in user used to be able to react to any trip's content.
  const tripId = await resolveTripIdForTarget(targetKind, targetId);
  if (!tripId) throw new Error('Target not found');

  const ctx = await getTripAuthContext(tripId);
  requireAuth(ctx);
  if (!ctx.tripMember && !ctx.isPlatformAdmin) {
    throw new AuthorizationError('You are not on this trip');
  }

  const [existing] = await db
    .select()
    .from(reactions)
    .where(
      and(
        eq(reactions.userId, ctx.user.id),
        eq(reactions.targetKind, targetKind),
        eq(reactions.targetId, targetId),
        eq(reactions.emoji, emoji)
      )
    )
    .limit(1);

  if (existing) {
    await db.delete(reactions).where(eq(reactions.id, existing.id));
  } else {
    await db.insert(reactions).values({
      userId: ctx.user.id,
      targetKind,
      targetId,
      emoji,
    });
  }

  const tripSlug = await getTripSlugById(tripId);
  revalidatePath(`/trips/${tripSlug}/feed`);
}
