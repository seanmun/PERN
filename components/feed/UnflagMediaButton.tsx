'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { unflagMediaPost } from '@/lib/actions/feed';

export default function UnflagMediaButton({ mediaId }: { mediaId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onClick() {
    if (!window.confirm('Approve this post and reveal the original?')) return;
    const fd = new FormData();
    fd.set('id', mediaId);
    startTransition(async () => {
      await unflagMediaPost(fd);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      className="flex items-center gap-1 rounded-sm border border-emerald-700/40 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-emerald-400 hover:bg-emerald-900/20 disabled:opacity-50"
    >
      <ShieldCheck size={11} />
      {isPending ? 'Approving…' : 'Approve'}
    </button>
  );
}
