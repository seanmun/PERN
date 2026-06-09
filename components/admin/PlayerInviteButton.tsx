'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, Loader2, Mail } from 'lucide-react';
import { sendPlayerInvite } from '@/lib/actions/invites';

/**
 * Small button on each player row that fires the invite email. Stays local
 * to this row — admins can invite players one at a time. Disabled when the
 * row has no email (shell player). Shows a transient saved/error state next
 * to itself so the admin sees confirmation without a page reload.
 */
export default function PlayerInviteButton({
  tripMemberId,
  hasEmail,
}: {
  tripMemberId: string;
  hasEmail: boolean;
}) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle',
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function send() {
    if (!hasEmail) return;
    setState('sending');
    setMsg(null);
    const fd = new FormData();
    fd.set('tripMemberId', tripMemberId);
    startTransition(async () => {
      try {
        await sendPlayerInvite(fd);
        setState('sent');
        // Reset after a moment so the admin can re-send if they want.
        setTimeout(() => setState('idle'), 3500);
      } catch (e) {
        setState('error');
        setMsg(e instanceof Error ? e.message : 'Send failed');
      }
    });
  }

  if (!hasEmail) {
    return (
      <span
        title="Set an email on this player before inviting"
        className="flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-700"
      >
        <Mail size={11} /> No email
      </span>
    );
  }

  if (state === 'sending') {
    return (
      <span className="flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
        <Loader2 size={11} className="animate-spin" /> Sending
      </span>
    );
  }

  if (state === 'sent') {
    return (
      <span className="flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
        <CheckCircle2 size={11} /> Invite sent
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          send();
        }}
        className="flex items-center gap-1 rounded-sm border border-yellow-500/40 bg-yellow-500/10 px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-yellow-300 hover:bg-yellow-500/20"
      >
        <Mail size={11} /> Invite
      </button>
      {state === 'error' && msg && (
        <p className="mt-1 max-w-[180px] truncate text-right text-[10px] text-red-400" title={msg}>
          {msg}
        </p>
      )}
    </div>
  );
}
