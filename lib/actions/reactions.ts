'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { reactions } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/current-user';
import { requireAuth } from '@/lib/auth/permissions';

export const REACTION_EMOJIS = ['🔥', '😂', '🏌️', '👏', '💀', '🍺'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];
const VALID_EMOJIS = new Set<string>(REACTION_EMOJIS);
const VALID_KINDS = new Set<string>(['score', 'media', 'text']);

export async function toggleReaction(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  requireAuth(ctx);

  const targetKindRaw = String(formData.get('targetKind') ?? '').trim();
  const targetId = String(formData.get('targetId') ?? '').trim();
  const emoji = String(formData.get('emoji') ?? '').trim();

  if (!VALID_KINDS.has(targetKindRaw)) throw new Error('Invalid target kind');
  if (!targetId) throw new Error('targetId required');
  if (!VALID_EMOJIS.has(emoji)) throw new Error('Invalid emoji');

  const targetKind = targetKindRaw as 'score' | 'media' | 'text';

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

  revalidatePath('/feed');
}
