'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { unflagMediaPost } from '@/lib/actions/feed';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

export default function UnflagMediaButton({ mediaId }: { mediaId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function run() {
    setOpen(false);
    const fd = new FormData();
    fd.set('id', mediaId);
    startTransition(async () => {
      await unflagMediaPost(fd);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={isPending}
        className="flex items-center gap-1 rounded-sm border border-emerald-700/40 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-emerald-400 hover:bg-emerald-900/20 disabled:opacity-50"
      >
        <ShieldCheck size={11} />
        {isPending ? 'Approving…' : 'Approve'}
      </button>

      <ConfirmDialog
        open={open}
        title="Approve this post?"
        message="The original image will be revealed in the feed for everyone on the trip."
        confirmLabel="Approve"
        cancelLabel="Cancel"
        onConfirm={run}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
