'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, CheckCircle2, Loader2 } from 'lucide-react';
import { sendPlayerInvite } from '@/lib/actions/invites';
import { rethrowIfControlFlow } from '@/lib/control-flow-error';

type Invitee = { id: string; nickname: string };
type SendState = 'unsent' | 'sending' | 'sent' | 'failed';

/**
 * Invite sender. The event already exists — it was created back on the
 * Details step — so the button says what this actually does. (It used to
 * say "Create event & send invites".)
 *
 * Invites go out concurrently instead of one-at-a-time-in-a-loop, you
 * pick who gets one, and a failure keeps its checkbox so retry is one
 * tap — the old version listed failures by name and told you to go do
 * them by hand on another page.
 */
export default function ReviewStepClient({
  tripSlug,
  membersWithEmail,
}: {
  tripSlug: string;
  membersWithEmail: Invitee[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(membersWithEmail.map((m) => m.id)),
  );
  const [state, setState] = useState<Record<string, SendState>>({});

  const sentCount = membersWithEmail.filter(
    (m) => state[m.id] === 'sent',
  ).length;
  const failedCount = membersWithEmail.filter(
    (m) => state[m.id] === 'failed',
  ).length;
  // Only members still selected AND not already sent go out on a click —
  // this is also what makes "retry" just work.
  const toSend = membersWithEmail.filter(
    (m) => selected.has(m.id) && state[m.id] !== 'sent',
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function send() {
    if (!toSend.length) return;
    startTransition(async () => {
      setState((prev) => {
        const next = { ...prev };
        for (const m of toSend) next[m.id] = 'sending';
        return next;
      });
      await Promise.all(
        toSend.map(async (m) => {
          try {
            const fd = new FormData();
            fd.set('tripMemberId', m.id);
            await sendPlayerInvite(fd);
            setState((prev) => ({ ...prev, [m.id]: 'sent' }));
          } catch (err) {
            rethrowIfControlFlow(err);
            console.error(`Invite failed for ${m.nickname}`, err);
            setState((prev) => ({ ...prev, [m.id]: 'failed' }));
          }
        }),
      );
    });
  }

  if (membersWithEmail.length === 0) {
    return (
      <div className="mt-6 space-y-3">
        <p className="rounded-sm border border-zinc-200 dark:border-zinc-900 p-4 text-sm text-zinc-600 dark:text-zinc-400">
          No one on the roster has an email yet, so there&apos;s nobody to
          invite. Add emails from the Players step whenever you like.
        </p>
        <a
          href={`/trips/${tripSlug}/schedule`}
          className="inline-flex rounded-sm bg-yellow-500 px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-yellow-400"
        >
          Done — go to the event →
        </a>
      </div>
    );
  }

  const allDone = sentCount === membersWithEmail.length;

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950/60">
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-900 px-4 py-2.5">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            Who gets an invite
          </p>
          {sentCount > 0 && (
            <span className="font-mono text-[11px] tabular-nums text-emerald-500">
              {sentCount}/{membersWithEmail.length} sent
            </span>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          {membersWithEmail.map((m) => {
            const s = state[m.id] ?? 'unsent';
            return (
              <label
                key={m.id}
                className={`flex items-center gap-3 rounded-sm px-2 py-2 ${
                  s === 'sent'
                    ? 'opacity-70'
                    : 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/40'
                }`}
              >
                <input
                  type="checkbox"
                  checked={s === 'sent' || selected.has(m.id)}
                  disabled={s === 'sent' || pending}
                  onChange={() => toggle(m.id)}
                  className="h-4 w-4 accent-yellow-500"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {m.nickname}
                </span>
                {s === 'sending' && (
                  <Loader2 size={13} className="animate-spin text-zinc-500" />
                )}
                {s === 'sent' && <Check size={13} className="text-emerald-500" />}
                {s === 'failed' && (
                  <span className="flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-red-500">
                    <AlertTriangle size={12} /> failed
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </div>

      {allDone ? (
        <div className="rounded-sm border border-green-600/30 bg-green-500/5 p-4">
          <p className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-widest text-green-800 dark:text-green-400">
            <CheckCircle2 size={14} /> All invites sent
          </p>
          <a
            href={`/trips/${tripSlug}/schedule`}
            className="mt-3 inline-flex rounded-sm bg-yellow-500 px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-yellow-400"
          >
            Go to the event →
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          <button
            type="button"
            disabled={pending || toSend.length === 0}
            onClick={send}
            className="flex w-full items-center justify-center gap-2 rounded-sm bg-yellow-500 px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.4)] hover:bg-yellow-400 disabled:opacity-50"
          >
            {pending
              ? 'Sending…'
              : failedCount > 0
                ? `Retry ${toSend.length} invite${toSend.length === 1 ? '' : 's'}`
                : `Send ${toSend.length} invite${toSend.length === 1 ? '' : 's'}`}
          </button>
          <button
            type="button"
            onClick={() => router.push(`/trips/${tripSlug}/schedule`)}
            className="flex w-full items-center justify-center rounded-sm border border-zinc-300 dark:border-zinc-700 px-6 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            Skip invites for now
          </button>
        </div>
      )}
    </div>
  );
}
