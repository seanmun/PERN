'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';
import { reextractScorecard } from '@/lib/actions/courses';

export default function ExtractScorecardButton({
  courseId,
  alreadyExtracted,
}: {
  courseId: string;
  alreadyExtracted: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onClick() {
    if (
      alreadyExtracted &&
      !window.confirm(
        'Re-run extraction? Existing par/yardage/stroke-index values will be overwritten with whatever the model returns.'
      )
    ) {
      return;
    }
    const fd = new FormData();
    fd.set('id', courseId);
    startTransition(async () => {
      try {
        await reextractScorecard(fd);
        router.refresh();
      } catch (err) {
        console.error('Extraction failed', err);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      className="flex w-full items-center justify-center gap-2 rounded-sm border border-yellow-500/50 bg-yellow-500/10 px-4 py-3 font-mono text-xs font-bold uppercase tracking-widest text-yellow-300 hover:bg-yellow-500/20 disabled:opacity-60"
    >
      {isPending ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          Reading scorecard…
        </>
      ) : (
        <>
          <Sparkles size={14} />
          {alreadyExtracted ? 'Re-extract from scorecard' : 'Run AI extraction'}
        </>
      )}
    </button>
  );
}
