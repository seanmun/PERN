export const REACTION_EMOJIS = ['🔥', '😂', '🏌️', '👏', '💀', '🍺'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];
export const REACTION_TARGET_KINDS = ['score', 'media', 'text'] as const;
export type ReactionTargetKind = (typeof REACTION_TARGET_KINDS)[number];
