'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toggleReaction } from '@/lib/actions/reactions';
import { REACTION_EMOJIS } from '@/lib/feed/constants';

export default function ReactionsBar({
  targetKind,
  targetId,
  counts,
  myEmojis,
}: {
  targetKind: 'score' | 'media' | 'text';
  targetId: string;
  counts: Record<string, number>;
  myEmojis: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onTap(emoji: string) {
    const fd = new FormData();
    fd.set('targetKind', targetKind);
    fd.set('targetId', targetId);
    fd.set('emoji', emoji);
    startTransition(async () => {
      await toggleReaction(fd);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {REACTION_EMOJIS.map((e) => {
        const count = counts[e] ?? 0;
        const isActive = myEmojis.includes(e);
        return (
          <button
            key={e}
            type="button"
            onClick={() => onTap(e)}
            disabled={isPending}
            className={`flex items-center gap-1 rounded-full border px-2 py-1 text-sm transition-colors ${
              isActive
                ? 'border-yellow-500/60 bg-yellow-500/10'
                : 'border-zinc-800 bg-black hover:border-zinc-700'
            } ${isPending ? 'opacity-60' : ''}`}
            aria-pressed={isActive}
          >
            <span className="leading-none">{e}</span>
            {count > 0 && (
              <span className="font-mono text-[10px] tabular-nums text-zinc-400">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
