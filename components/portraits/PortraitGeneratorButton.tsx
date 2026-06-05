'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles, X } from 'lucide-react';
import {
  clearArcadePortraitForPlayer,
  clearMyArcadePortrait,
  generateArcadePortraitForPlayer,
  generateMyArcadePortrait,
} from '@/lib/actions/portraits';

export default function PortraitGeneratorButton({
  sourceUrl,
  hasPortrait,
  redirectTo,
  // When set, this button targets ANOTHER player's portrait (admin-side).
  // Otherwise it targets the current user's own portrait.
  targetTripMemberId,
  targetLabel = 'your',
}: {
  sourceUrl: string | null;
  hasPortrait: boolean;
  redirectTo?: string;
  targetTripMemberId?: string;
  targetLabel?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isAdminMode = !!targetTripMemberId;

  function onGenerate() {
    if (!sourceUrl) return;
    if (
      hasPortrait &&
      !window.confirm(
        `Regenerate? ${targetLabel} current arcade portrait will be replaced.`,
      )
    ) {
      return;
    }
    const fd = new FormData();
    fd.set('sourceUrl', sourceUrl);
    if (redirectTo) fd.set('redirectTo', redirectTo);
    if (isAdminMode) fd.set('tripMemberId', targetTripMemberId!);
    startTransition(async () => {
      try {
        if (isAdminMode) {
          await generateArcadePortraitForPlayer(fd);
        } else {
          await generateMyArcadePortrait(fd);
        }
        router.refresh();
      } catch (err) {
        console.error('[portrait] generation failed', err);
        alert(
          err instanceof Error
            ? err.message
            : 'Portrait generation failed. Try again.',
        );
      }
    });
  }

  function onClear() {
    if (!window.confirm(`Remove ${targetLabel} arcade portrait?`)) return;
    startTransition(async () => {
      try {
        if (isAdminMode) {
          const fd = new FormData();
          fd.set('tripMemberId', targetTripMemberId!);
          if (redirectTo) fd.set('redirectTo', redirectTo);
          await clearArcadePortraitForPlayer(fd);
        } else {
          await clearMyArcadePortrait();
        }
        router.refresh();
      } catch (err) {
        console.error('[portrait] clear failed', err);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onGenerate}
        disabled={isPending || !sourceUrl}
        className="flex flex-1 items-center justify-center gap-2 rounded-sm border border-yellow-500/50 bg-yellow-500/10 px-4 py-3 font-mono text-xs font-bold uppercase tracking-widest text-yellow-300 hover:bg-yellow-500/20 disabled:opacity-60"
      >
        {isPending ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Generating… (15–45s)
          </>
        ) : (
          <>
            <Sparkles size={14} />
            {hasPortrait ? 'Regenerate portrait' : 'Generate portrait'}
          </>
        )}
      </button>
      {hasPortrait && !isPending && (
        <button
          type="button"
          onClick={onClear}
          className="rounded-sm border border-zinc-800 p-2.5 text-zinc-400 hover:border-red-700/40 hover:text-red-400"
          aria-label="Remove arcade portrait"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
