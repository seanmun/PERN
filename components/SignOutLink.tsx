'use client';

import { useClerk } from '@clerk/nextjs';
import { useTransition } from 'react';
import { LogOut } from 'lucide-react';

export default function SignOutLink() {
  const { signOut } = useClerk();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() =>
        startTransition(async () => {
          await signOut({ redirectUrl: '/' });
        })
      }
      disabled={isPending}
      className="flex items-center gap-2 rounded-sm border border-zinc-700 px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-zinc-300 hover:border-red-700/40 hover:text-red-400 disabled:opacity-50"
    >
      <LogOut size={12} />
      {isPending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
