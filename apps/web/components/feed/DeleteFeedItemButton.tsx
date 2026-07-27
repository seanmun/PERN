'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { deleteFeedItem } from '@/lib/actions/feed';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { rethrowIfControlFlow } from '@/lib/control-flow-error';

export default function DeleteFeedItemButton({
  kind,
  id,
}: {
  kind: 'media' | 'text';
  id: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = kind === 'media' ? 'post' : 'message';

  function run() {
    setOpen(false);
    const fd = new FormData();
    fd.set('kind', kind);
    fd.set('id', id);
    startTransition(async () => {
      try {
        await deleteFeedItem(fd);
        router.refresh();
      } catch (err) {
        rethrowIfControlFlow(err);
        console.error('Delete post failed', err);
        setError(err instanceof Error ? err.message : 'Delete failed');
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={isPending}
        aria-label="Delete"
        className="rounded-sm border border-zinc-300 dark:border-zinc-800 p-1.5 text-zinc-500 hover:border-red-700/40 hover:text-red-400 disabled:opacity-50"
      >
        <Trash2 size={12} />
      </button>

      {error && (
        <p className="mt-1.5 font-mono text-[10px] uppercase tracking-widest text-red-500">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={open}
        tone="danger"
        title={`Delete ${label}?`}
        message={`This ${label} will be removed from the feed. This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={run}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
