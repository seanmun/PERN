import Link from 'next/link';
import { Check } from 'lucide-react';

export type WizardStepKey =
  | 'type'
  | 'details'
  | 'players'
  | 'teams'
  | 'groups'
  | 'matches'
  | 'review';

const STEPS: { key: WizardStepKey; label: string }[] = [
  { key: 'type', label: 'Type' },
  { key: 'details', label: 'Details' },
  { key: 'players', label: 'Players' },
  { key: 'teams', label: 'Teams' },
  { key: 'groups', label: 'Groups' },
  { key: 'matches', label: 'Matches' },
  { key: 'review', label: 'Review' },
];

/**
 * Shared stepper header for the event-creation wizard. Each step lives
 * on its own route (Type/Details are pre-trip at /trips/new*, the rest
 * are post-trip at /trips/[slug]/setup/*) rather than one client-side
 * SPA — every reused server action in this codebase ends in a hard
 * redirect(), which would kick a single-page wizard off its own route.
 * A shared header + per-step pages keeps every action's existing
 * behavior intact (see lib/actions/wizard-redirect.ts) while still
 * reading as one continuous flow.
 *
 * Steps 1–2 (before the trip exists) render without a tripSlug and
 * their chips aren't clickable — there's nowhere to click TO yet.
 * Steps 3–7 are always clickable once the trip exists; no step
 * "locks" the next one since every step page fetches its own data
 * independently and tolerates an earlier step being empty.
 */
export default function WizardShell({
  active,
  tripSlug,
}: {
  active: WizardStepKey;
  tripSlug?: string;
}) {
  const activeIdx = STEPS.findIndex((s) => s.key === active);

  function hrefFor(key: WizardStepKey): string | null {
    if (key === 'type') return '/trips/new';
    if (key === 'details') return tripSlug ? null : '/trips/new/details';
    if (!tripSlug) return null;
    return `/trips/${tripSlug}/setup/${key}`;
  }

  return (
    <div className="border-b border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-black/40">
      <div className="mx-auto max-w-2xl px-4 pt-4">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-800 dark:text-yellow-500">
            New event
          </p>
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            Step {activeIdx + 1} / {STEPS.length}
          </span>
        </div>

        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-900">
          <div
            className="h-full bg-yellow-500 transition-all"
            style={{ width: `${((activeIdx + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {STEPS.map((s, i) => {
            const href = hrefFor(s.key);
            const isActive = s.key === active;
            const isDone = i < activeIdx;
            const chipCls = isActive
              ? 'bg-yellow-500 text-black'
              : isDone
                ? 'border border-yellow-600/40 text-yellow-800 dark:text-yellow-400'
                : href
                  ? 'border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-500'
                  : 'border border-zinc-200 dark:border-zinc-900 text-zinc-400 dark:text-zinc-700 cursor-not-allowed';
            const content = (
              <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-black/10 text-[9px] dark:bg-white/10">
                  {isDone ? <Check size={10} strokeWidth={3} /> : i + 1}
                </span>
                {s.label}
              </span>
            );
            return href ? (
              <Link key={s.key} href={href} className={chipCls}>
                {content}
              </Link>
            ) : (
              <span key={s.key} className={chipCls}>
                {content}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
