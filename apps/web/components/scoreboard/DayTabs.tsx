'use client';

import { useEffect, useState, type ReactNode } from 'react';

export type DayTab = {
  key: string;          // ISO date string (YYYY-MM-DD)
  label: string;        // "Fri 6/19"
  dayNumber: number;    // 1-indexed trip day
  isToday: boolean;
  content: ReactNode;
};

/**
 * Horizontally-scrollable day-tab strip + slot for the active day's
 * match cards. Default tab = today if it's in the list, else the first
 * day. Tabs are buttons (instant switch, no animation) so the bar stays
 * snappy on iPhone.
 *
 * Server renders all days' content; we just show/hide via CSS so there's
 * no flash when switching tabs.
 */
export default function DayTabs({ days }: { days: DayTab[] }) {
  const initial = days.find((d) => d.isToday)?.key ?? days[0]?.key ?? '';
  const [active, setActive] = useState(initial);

  // If the input set of days changes (admin adds a round) keep the
  // active key in sync. Falls back to today / first day.
  useEffect(() => {
    if (!days.some((d) => d.key === active)) {
      setActive(days.find((d) => d.isToday)?.key ?? days[0]?.key ?? '');
    }
  }, [days, active]);

  if (days.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="-mx-4 flex overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="inline-flex gap-1 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-black p-0.5">
          {days.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => setActive(d.key)}
              aria-pressed={d.key === active}
              className={`relative rounded-sm px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest ${
                d.key === active
                  ? 'bg-yellow-500 text-black'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              D{d.dayNumber}
              <span className="ml-1.5 text-[9px] opacity-75">{d.label}</span>
              {d.isToday && d.key !== active && (
                <span className="absolute right-1 top-1 h-1 w-1 rounded-full bg-yellow-500" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {days.map((d) => (
          <div key={d.key} className={d.key === active ? '' : 'hidden'}>
            {d.content}
          </div>
        ))}
      </div>
    </div>
  );
}
