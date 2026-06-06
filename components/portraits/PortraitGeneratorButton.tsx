'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2, Sparkles, X } from 'lucide-react';
import {
  clearArcadePortraitForPlayer,
  clearMyArcadePortrait,
  generateArcadePortraitForPlayer,
  generateMyArcadePortrait,
} from '@/lib/actions/portraits';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

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
  const [error, setError] = useState<string | null>(null);
  const [confirmKind, setConfirmKind] = useState<'regenerate' | 'clear' | null>(
    null,
  );
  const isAdminMode = !!targetTripMemberId;

  function requestGenerate() {
    if (!sourceUrl) return;
    setError(null);
    if (hasPortrait) {
      setConfirmKind('regenerate');
      return;
    }
    runGenerate();
  }

  function runGenerate() {
    if (!sourceUrl) return;
    setConfirmKind(null);
    const fd = new FormData();
    fd.set('sourceUrl', sourceUrl);
    if (redirectTo) fd.set('redirectTo', redirectTo);
    if (isAdminMode) fd.set('tripMemberId', targetTripMemberId!);
    startTransition(async () => {
      try {
        const result = isAdminMode
          ? await generateArcadePortraitForPlayer(fd)
          : await generateMyArcadePortrait(fd);
        if (!result.ok) {
          console.error('[portrait] generation failed:', result.error);
          setError(result.error);
          return;
        }
        router.refresh();
      } catch (err) {
        console.error('[portrait] generation threw', err);
        setError(
          err instanceof Error
            ? err.message
            : 'Portrait generation failed. Try again.',
        );
      }
    });
  }

  function requestClear() {
    setError(null);
    setConfirmKind('clear');
  }

  function runClear() {
    setConfirmKind(null);
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
        setError(
          err instanceof Error ? err.message : 'Clear failed. Try again.',
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={requestGenerate}
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
            onClick={requestClear}
            className="rounded-sm border border-zinc-800 p-2.5 text-zinc-400 hover:border-red-700/40 hover:text-red-400"
            aria-label="Remove arcade portrait"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-sm border border-red-700/40 bg-red-950/30 px-3 py-2">
          <AlertCircle size={13} className="mt-0.5 shrink-0 text-red-400" strokeWidth={2.5} />
          <p className="flex-1 text-[12px] leading-snug text-red-300">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="font-mono text-[10px] font-semibold uppercase tracking-widest text-red-500 hover:text-red-300"
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmKind === 'regenerate'}
        title="Regenerate portrait?"
        message={`${targetLabel === 'your' ? 'Your' : `${targetLabel} `}current arcade portrait will be replaced with a fresh generation.`}
        confirmLabel="Regenerate"
        cancelLabel="Keep current"
        onConfirm={runGenerate}
        onCancel={() => setConfirmKind(null)}
      />

      <ConfirmDialog
        open={confirmKind === 'clear'}
        tone="danger"
        title="Remove portrait?"
        message={`${targetLabel === 'your' ? 'Your' : `${targetLabel} `}arcade portrait will be removed. You can always regenerate it.`}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={runClear}
        onCancel={() => setConfirmKind(null)}
      />
    </div>
  );
}
