'use client';

import { useClerk } from '@clerk/nextjs';
import { useState } from 'react';
import { LogOut } from 'lucide-react';

export default function SignOutLink() {
  const { signOut } = useClerk();
  const [isPending, setIsPending] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        setIsPending(true);
        await signOut();
        // Hard navigation forces the App Router to re-fetch server components
        // with the cleared Clerk session. signOut({ redirectUrl }) alone leaves
        // the page stuck on stale server-rendered HTML.
        window.location.href = '/';
      }}
      disabled={isPending}
      className="flex items-center gap-2 rounded-sm border border-zinc-400 dark:border-zinc-700 px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-zinc-700 dark:text-zinc-300 hover:border-red-700/40 hover:text-red-400 disabled:opacity-50"
    >
      <LogOut size={12} />
      {isPending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
