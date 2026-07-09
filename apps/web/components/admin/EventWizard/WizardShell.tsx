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

// Pre-creation wizard (no trip exists yet): two real steps. The rest of
// the flow only becomes reachable once the trip row exists, at which
// point the shell renders as settings TABS instead (below).
const CREATE_STEPS: { key: WizardStepKey; label: string }[] = [
  { key: 'type', label: 'Type' },
  { key: 'details', label: 'Details' },
];

// Post-creation: the same pages, framed as a persistent tabbed settings
// surface. Same order as the creation flow so the muscle memory carries.
const SETTINGS_TABS: { key: WizardStepKey; label: string }[] = [
  { key: 'details', label: 'Details' },
  { key: 'players', label: 'Players' },
  { key: 'teams', label: 'Teams' },
  { key: 'groups', label: 'Groups' },
  { key: 'matches', label: 'Matches' },
  { key: 'review', label: 'Review' },
];

/**
 * Shared header for the event-creation wizard AND the post-creation
 * settings surface — they're the same pages.
 *
 * No tripSlug (nothing created yet): "New event" stepper across
 * /trips/new → /trips/new/details.
 *
 * With tripSlug: "Event settings" tab bar across
 * /trips/[slug]/setup/{details,players,teams,groups,matches,review}.
 * No step numbers, no progress bar, nothing locked — every tab is
 * always reachable since each page loads its own data and tolerates
 * earlier sections being empty.
 */
export default function WizardShell({
  active,
  tripSlug,
}: {
  active: WizardStepKey;
  tripSlug?: string;
}) {
  if (tripSlug) {
    return (
      <div className="border-b border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-black/40">
        <div className="mx-auto max-w-2xl px-4 pt-4">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-800 dark:text-yellow-500">
            Event settings
          </p>
          <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {SETTINGS_TABS.map((t) => {
              const isActive = t.key === active;
              return (
                <Link
                  key={t.key}
                  href={`/trips/${tripSlug}/setup/${t.key}`}
                  className={
                    isActive
                      ? 'whitespace-nowrap rounded-full bg-yellow-500 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-black'
                      : 'whitespace-nowrap rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400 hover:border-zinc-500'
                  }
                >
                  {t.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const activeIdx = CREATE_STEPS.findIndex((s) => s.key === active);
  return (
    <div className="border-b border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-black/40">
      <div className="mx-auto max-w-2xl px-4 pt-4">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-800 dark:text-yellow-500">
            New event
          </p>
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            Step {activeIdx + 1} / {CREATE_STEPS.length}
          </span>
        </div>

        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-900">
          <div
            className="h-full bg-yellow-500 transition-all"
            style={{ width: `${((activeIdx + 1) / CREATE_STEPS.length) * 100}%` }}
          />
        </div>

        <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CREATE_STEPS.map((s, i) => {
            const isActive = s.key === active;
            const isDone = i < activeIdx;
            const href = s.key === 'type' ? '/trips/new' : null;
            const chipCls = isActive
              ? 'bg-yellow-500 text-black'
              : isDone && href
                ? 'border border-yellow-600/40 text-yellow-800 dark:text-yellow-400'
                : 'border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400';
            const content = (
              <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-black/10 text-[9px] dark:bg-white/10">
                  {isDone ? <Check size={10} strokeWidth={3} /> : i + 1}
                </span>
                {s.label}
              </span>
            );
            return href && !isActive ? (
              <Link key={s.key} href={href} className={chipCls}>
                {content}
              </Link>
            ) : (
              <span key={s.key} className={chipCls}>
                {content}
              </span>
            );
          })}
          {/* Post-creation sections, greyed as a preview of what's next. */}
          {['Players', 'Teams', 'Groups', 'Matches', 'Review'].map((label) => (
            <span
              key={label}
              className="whitespace-nowrap rounded-full border border-zinc-200 dark:border-zinc-900 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-700"
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
