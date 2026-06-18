'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { Buddy } from '@/lib/data/buddies';

const PAGE_SIZE = 20;

/**
 * Two-tab shell on the /me page: Profile (server-rendered form passed
 * in as children) and Buddies (filterable + paginated list of users
 * the current user has played with).
 *
 * Tabs are sticky-ish in URL via querystring (?tab=buddies) so a
 * shared link drops into the right pane.
 */
export default function MeTabs({
  profileSlot,
  buddies,
  initialTab,
}: {
  profileSlot: React.ReactNode;
  buddies: Buddy[];
  initialTab?: 'profile' | 'buddies';
}) {
  const [tab, setTab] = useState<'profile' | 'buddies'>(initialTab ?? 'profile');

  return (
    <div className="mt-6">
      <div className="flex gap-1 border-b border-zinc-300 dark:border-zinc-800">
        <TabButton active={tab === 'profile'} onClick={() => setTab('profile')}>
          Profile
        </TabButton>
        <TabButton active={tab === 'buddies'} onClick={() => setTab('buddies')}>
          Buddies
          <span className="ml-1.5 rounded-sm bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 font-mono text-[9px] tabular-nums text-zinc-600 dark:text-zinc-400">
            {buddies.length}
          </span>
        </TabButton>
      </div>

      {tab === 'profile' ? (
        <div className="pt-6">{profileSlot}</div>
      ) : (
        <BuddiesPane buddies={buddies} />
      )}
    </div>
  );
}

function TabButton({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px flex items-center gap-1 border-b-2 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-widest transition-colors ${
        active
          ? 'border-yellow-500 text-yellow-800 dark:text-yellow-400'
          : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
      }`}
    >
      {children}
    </button>
  );
}

function BuddiesPane({ buddies }: { buddies: Buddy[] }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return buddies;
    return buddies.filter((b) => {
      const hay = [
        b.recentNickname,
        b.displayName,
        b.fullName,
        b.email,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [buddies, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  return (
    <div className="pt-6">
      {/* Search */}
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder="Search buddies…"
          className="block w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2.5 pl-9 text-base text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-600 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
        />
      </div>

      {buddies.length === 0 ? (
        <div className="mt-8 rounded-sm border border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-6 text-center">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No buddies yet.</p>
          <p className="mt-1 text-xs text-zinc-500">
            Play your first match — anyone in your foursome shows up here next time you build a trip.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-center text-sm text-zinc-500">No match.</p>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-900 overflow-hidden rounded-sm border border-zinc-300 dark:border-zinc-800">
            {visible.map((b) => (
              <BuddyRow key={b.userId} buddy={b} />
            ))}
          </ul>

          {pageCount > 1 && (
            <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="flex items-center gap-1 rounded-sm border border-zinc-300 dark:border-zinc-700 px-2.5 py-1.5 font-semibold disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                <ChevronLeft size={12} /> Prev
              </button>
              <span>
                Page {safePage + 1} of {pageCount} · {filtered.length} total
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={safePage === pageCount - 1}
                className="flex items-center gap-1 rounded-sm border border-zinc-300 dark:border-zinc-700 px-2.5 py-1.5 font-semibold disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                Next <ChevronRight size={12} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BuddyRow({ buddy }: { buddy: Buddy }) {
  const initial = buddy.recentNickname.charAt(0).toUpperCase();
  const photoUrl = buddy.arcadePortraitUrl ?? buddy.avatarUrl;
  return (
    <li className="flex items-center gap-3 bg-zinc-50 dark:bg-zinc-950/40 px-3 py-2.5">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-300 dark:border-zinc-700 bg-zinc-200 dark:bg-zinc-800 font-mono text-sm font-bold uppercase"
        style={
          photoUrl
            ? {
                backgroundImage: `url(${photoUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                color: 'transparent',
              }
            : undefined
        }
      >
        {!photoUrl && initial}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {buddy.recentNickname}
        </p>
        <p className="truncate font-mono text-[10px] text-zinc-500">
          {buddy.fullName ?? buddy.email}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-sm font-bold tabular-nums text-yellow-800 dark:text-yellow-400">
          {buddy.matchesPlayedTogether}
        </p>
        <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
          matches
        </p>
      </div>
    </li>
  );
}
