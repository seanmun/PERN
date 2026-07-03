'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendPlayerInvite } from '@/lib/actions/invites';

export default function ReviewStepClient({
  tripSlug,
  membersWithEmail,
}: {
  tripSlug: string;
  membersWithEmail: { id: string; nickname: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  function sendAll() {
    startTransition(async () => {
      let ok = 0;
      const bad: string[] = [];
      for (const m of membersWithEmail) {
        try {
          const fd = new FormData();
          fd.set('tripMemberId', m.id);
          await sendPlayerInvite(fd);
          ok += 1;
          setSent(ok);
        } catch {
          bad.push(m.nickname);
        }
      }
      setFailed(bad);
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="mt-6 rounded-sm border border-green-600/30 bg-green-500/5 p-4">
        <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-green-800 dark:text-green-400">
          Event is live
        </p>
        <p className="mt-1.5 text-sm text-zinc-700 dark:text-zinc-300">
          Sent {sent} of {membersWithEmail.length} invites.
          {failed.length > 0 && ` Failed: ${failed.join(', ')} — resend from the admin players page.`}
        </p>
        <a
          href={`/trips/${tripSlug}/admin/players`}
          className="mt-3 inline-flex rounded-sm bg-yellow-500 px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-yellow-400"
        >
          Go to trip admin →
        </a>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      <button
        type="button"
        disabled={pending}
        onClick={sendAll}
        className="flex w-full items-center justify-center gap-2 rounded-sm bg-yellow-500 px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.4)] hover:bg-yellow-400 disabled:opacity-50"
      >
        {pending
          ? `Sending… ${sent}/${membersWithEmail.length}`
          : `Create event & send ${membersWithEmail.length} invite${membersWithEmail.length === 1 ? '' : 's'}`}
      </button>
      <button
        type="button"
        onClick={() => router.push(`/trips/${tripSlug}/admin/players`)}
        className="flex w-full items-center justify-center rounded-sm border border-zinc-300 dark:border-zinc-700 px-6 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
      >
        Skip invites for now
      </button>
    </div>
  );
}
