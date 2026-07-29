'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, ChevronDown } from 'lucide-react';
import { unarchiveTrip } from '@/lib/actions/trips';
import { rethrowIfControlFlow } from '@/lib/control-flow-error';

type ArchivedTrip = { tripId: string; tripName: string };

/** Collapsed list of archived events with one-tap restore. */
export default function ArchivedTripsList({
  trips,
}: {
  trips: ArchivedTrip[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (trips.length === 0) return null;

  function restore(tripId: string) {
    setError(null);
    setPendingId(tripId);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set('tripId', tripId);
        await unarchiveTrip(fd);
        router.refresh();
      } catch (err) {
        rethrowIfControlFlow(err);
        console.error('Restore failed', err);
        setError(err instanceof Error ? err.message : 'Restore failed');
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-zinc-500 hover:text-zinc-300"
        aria-expanded={open}
      >
        <Archive size={12} />
        Archived · {trips.length}
        <ChevronDown
          size={12}
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {error && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-red-500">
          {error}
        </p>
      )}

      {open && (
        <div className="mt-3 space-y-2">
          {trips.map((t) => (
            <div
              key={t.tripId}
              className="flex items-center justify-between gap-3 rounded-sm border border-zinc-200 dark:border-zinc-900 bg-zinc-50 dark:bg-zinc-950/40 px-4 py-3"
            >
              <p className="min-w-0 flex-1 truncate text-sm text-zinc-500">
                {t.tripName}
              </p>
              <button
                type="button"
                disabled={pendingId === t.tripId}
                onClick={() => restore(t.tripId)}
                className="flex shrink-0 items-center gap-1.5 rounded-sm border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400 hover:border-yellow-500/40 hover:text-yellow-800 dark:hover:text-yellow-400 disabled:opacity-50"
              >
                <ArchiveRestore size={11} />
                {pendingId === t.tripId ? 'Restoring…' : 'Restore'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
