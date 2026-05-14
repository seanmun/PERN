'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { deleteFeedItem } from '@/lib/actions/feed';

export default function DeleteFeedItemButton({
  kind,
  id,
}: {
  kind: 'media' | 'text';
  id: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onClick() {
    const label = kind === 'media' ? 'post' : 'message';
    if (!window.confirm(`Delete this ${label}? This cannot be undone.`)) return;
    const fd = new FormData();
    fd.set('kind', kind);
    fd.set('id', id);
    startTransition(async () => {
      await deleteFeedItem(fd);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      aria-label="Delete"
      className="rounded-sm border border-zinc-800 p-1.5 text-zinc-500 hover:border-red-700/40 hover:text-red-400 disabled:opacity-50"
    >
      <Trash2 size={12} />
    </button>
  );
}
