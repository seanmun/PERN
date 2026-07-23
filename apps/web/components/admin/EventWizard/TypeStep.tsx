'use client';

import { useRouter } from 'next/navigation';
import { Flag, Layers, CalendarDays } from 'lucide-react';

type Kind = 'match' | 'outing' | 'trip';

const CARDS: {
  id: Kind;
  title: string;
  body: string;
  meta: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'match',
    title: 'Match',
    body: 'One foursome, one round. Just the games inside a single group.',
    meta: '1 group · single day',
    icon: <Flag size={28} strokeWidth={1.75} />,
  },
  {
    id: 'outing',
    title: 'Outing',
    body: 'Several foursomes out the same day, with matches layered across groups.',
    meta: 'Many groups · single day',
    icon: <Layers size={28} strokeWidth={1.75} />,
  },
  {
    id: 'trip',
    title: 'Trip',
    body: 'Multiple days, multiple foursomes. A running competition with a final cup.',
    meta: 'Many groups · many days',
    icon: <CalendarDays size={28} strokeWidth={1.75} />,
  },
];

export default function TypeStep() {
  const router = useRouter();

  return (
    <div className="mt-6 space-y-3">
      {CARDS.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() =>
            // Single-day events pick their course FIRST — it's the one
            // constant. Trips set courses up later in Groups.
            router.push(
              c.id === 'trip'
                ? `/trips/new/details?kind=${c.id}`
                : `/trips/new/course?kind=${c.id}`,
            )
          }
          className="flex w-full items-center gap-4 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 p-4 text-left transition-colors hover:border-yellow-500/50 hover:bg-yellow-500/5"
        >
          <span className="flex-none text-yellow-800 dark:text-yellow-500">
            {c.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold text-zinc-900 dark:text-zinc-100">
              {c.title}
            </span>
            <span className="mt-0.5 block text-[13px] leading-snug text-zinc-600 dark:text-zinc-400">
              {c.body}
            </span>
            <span className="mt-1.5 block font-mono text-[10px] font-semibold uppercase tracking-widest text-yellow-800 dark:text-yellow-500">
              {c.meta}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
