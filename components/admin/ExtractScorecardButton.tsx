'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';
import { reextractScorecard } from '@/lib/actions/courses';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

export default function ExtractScorecardButton({
  courseId,
  alreadyExtracted,
  tripId,
}: {
  courseId: string;
  alreadyExtracted: boolean;
  tripId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function request() {
    if (alreadyExtracted) {
      setOpen(true);
      return;
    }
    run();
  }

  function run() {
    setOpen(false);
    const fd = new FormData();
    fd.set('id', courseId);
    fd.set('tripId', tripId);
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
    <>
      <button
        type="button"
        onClick={request}
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

      <ConfirmDialog
        open={open}
        title="Re-run extraction?"
        message="Existing par, yardage, and stroke-index values for this course will be overwritten with whatever the model returns this time."
        confirmLabel="Re-extract"
        cancelLabel="Keep current"
        onConfirm={run}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
