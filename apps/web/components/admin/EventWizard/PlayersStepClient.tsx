'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, UserPlus, X } from 'lucide-react';
import { addBuddyToTrip, createPlayer, deletePlayer } from '@/lib/actions/players';
import { searchWizardPlayers } from '@/lib/actions/event-wizard';
import type { Buddy } from '@/lib/data/buddies';

type Member = {
  id: string;
  userId: string | null;
  nickname: string;
  email: string | null;
  avatarUrl: string | null;
  tripHandicap: string | null;
  teamName: string | null;
  teamColor: string | null;
};

export default function PlayersStepClient({
  tripId,
  tripSlug,
  initialMembers,
  initialBuddies,
}: {
  tripId: string;
  tripSlug: string;
  initialMembers: Member[];
  initialBuddies: Buddy[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // userIds we've fired an add-request for — hide immediately from
  // buddy chips / search results without waiting on a server refetch.
  const [addingUserIds, setAddingUserIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Buddy[]>([]);
  const [searching, setSearching] = useState(false);
  const [showNewPlayerForm, setShowNewPlayerForm] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const found = await searchWizardPlayers(tripId, q);
      setResults(found);
      setSearching(false);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, tripId]);

  const visibleBuddies = useMemo(
    () => initialBuddies.filter((b) => !addingUserIds.has(b.userId)),
    [initialBuddies, addingUserIds],
  );
  const visibleResults = useMemo(
    () => results.filter((r) => !addingUserIds.has(r.userId)),
    [results, addingUserIds],
  );

  function addBuddy(buddy: Buddy) {
    setAddingUserIds((prev) => new Set(prev).add(buddy.userId));
    startTransition(async () => {
      const fd = new FormData();
      fd.set('tripId', tripId);
      fd.set('userId', buddy.userId);
      fd.set('nickname', buddy.recentNickname);
      if (buddy.recentHandicap) fd.set('handicap', buddy.recentHandicap);
      await addBuddyToTrip(fd);
      router.refresh();
    });
  }

  function removeMember(member: Member) {
    setRemoveError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set('id', member.id);
        fd.set('redirectTo', 'none');
        await deletePlayer(fd);
        // Undo the "hide from buddy/search lists" side effect of having
        // added them, so a removed buddy is immediately re-addable.
        if (member.userId) {
          setAddingUserIds((prev) => {
            const next = new Set(prev);
            next.delete(member.userId!);
            return next;
          });
        }
        router.refresh();
      } catch (err) {
        setRemoveError(err instanceof Error ? err.message : 'Could not remove player');
      }
    });
  }

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950/60">
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-900 px-4 py-2.5">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            Playing
          </p>
          <span className="rounded-full bg-zinc-100 dark:bg-zinc-900 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
            {initialMembers.length} added
          </span>
        </div>
        <div className="max-h-64 overflow-y-auto p-2">
          {initialMembers.length === 0 ? (
            <p className="p-4 text-center text-[13px] text-zinc-500">
              No one yet — search below to add players.
            </p>
          ) : (
            initialMembers.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-sm px-2 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
                <a
                  href={`/trips/${tripSlug}/admin/players/${m.id}/edit`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <PlayerAvatar name={m.nickname} avatarUrl={m.avatarUrl} color={m.teamColor} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{m.nickname}</p>
                    {m.teamName && (
                      <p className="font-mono text-[9px] uppercase tracking-widest" style={{ color: m.teamColor ?? undefined }}>
                        {m.teamName}
                      </p>
                    )}
                  </div>
                </a>
                {m.tripHandicap && (
                  <span className="font-mono text-xs tabular-nums text-zinc-500">{m.tripHandicap}</span>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => removeMember(m)}
                  className="flex h-7 w-7 flex-none items-center justify-center rounded-sm text-zinc-500 hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
                  aria-label={`Remove ${m.nickname}`}
                >
                  <X size={14} />
                </button>
              </div>
            ))
          )}
        </div>
        {removeError && (
          <p className="border-t border-zinc-200 dark:border-zinc-900 px-4 py-2 text-[12px] text-red-500">
            {removeError}
          </p>
        )}
      </section>

      {visibleBuddies.length > 0 && (
        <section>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            Buddies · people you&apos;ve played with
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {visibleBuddies.map((b) => (
              <button
                key={b.userId}
                type="button"
                disabled={pending}
                onClick={() => addBuddy(b)}
                className="flex items-center gap-2 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-[13px] font-semibold hover:border-yellow-500/50 disabled:opacity-50"
              >
                <PlayerAvatar name={b.recentNickname} avatarUrl={b.avatarUrl} size={22} />
                {b.recentNickname}
                <Plus size={12} className="text-yellow-800 dark:text-yellow-500" />
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950/60">
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-900 px-4 py-2.5">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            Search players
          </p>
        </div>
        <div className="relative p-3">
          <Search size={15} className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 py-2.5 pl-9 pr-3 text-sm focus:border-yellow-500/60 focus:outline-none focus:ring-1 focus:ring-yellow-500/40"
          />
        </div>
        <div className="max-h-64 overflow-y-auto px-2 pb-2">
          {searching && <p className="p-4 text-center text-[13px] text-zinc-500">Searching…</p>}
          {!searching && query.trim() && visibleResults.length === 0 && (
            <p className="p-4 text-center text-[13px] text-zinc-500">
              No players match &ldquo;{query.trim()}&rdquo;.
            </p>
          )}
          {!searching &&
            visibleResults.map((r) => (
              <div key={r.userId} className="flex items-center gap-3 rounded-sm px-2 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                <PlayerAvatar name={r.recentNickname} avatarUrl={r.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{r.recentNickname}</p>
                  <p className="truncate text-[11px] text-zinc-500">{r.email}</p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => addBuddy(r)}
                  className="flex h-8 w-8 items-center justify-center rounded-sm bg-yellow-500 text-black hover:bg-yellow-400 disabled:opacity-50"
                  aria-label={`Add ${r.recentNickname}`}
                >
                  <Plus size={16} strokeWidth={2.5} />
                </button>
              </div>
            ))}
        </div>
      </section>

      <section>
        {!showNewPlayerForm ? (
          <button
            type="button"
            onClick={() => setShowNewPlayerForm(true)}
            className="flex w-full items-center justify-center gap-2 rounded-sm border border-dashed border-zinc-300 dark:border-zinc-700 py-3 font-mono text-[11px] font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400 hover:border-yellow-500/40 hover:text-yellow-800 dark:hover:text-yellow-400"
          >
            <UserPlus size={14} /> Not on BuddyCup yet — add by name
          </button>
        ) : (
          <NewPlayerForm tripId={tripId} tripSlug={tripSlug} onDone={() => setShowNewPlayerForm(false)} />
        )}
      </section>
    </div>
  );
}

function NewPlayerForm({
  tripId,
  tripSlug,
  onDone,
}: {
  tripId: string;
  tripSlug: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!nickname.trim()) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set('tripId', tripId);
      fd.set('nickname', nickname.trim());
      if (email.trim()) fd.set('email', email.trim());
      fd.set('redirectTo', 'none');
      await createPlayer(fd);
      setNickname('');
      setEmail('');
      router.refresh();
      onDone();
    });
  }

  void tripSlug;
  return (
    <form onSubmit={submit} className="space-y-3 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-3">
      <input
        type="text"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        placeholder="Nickname"
        required
        className="w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:border-yellow-500/60 focus:outline-none"
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email (optional — needed to send an invite later)"
        className="w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:border-yellow-500/60 focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-sm bg-yellow-500 px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-black hover:bg-yellow-400 disabled:opacity-50"
        >
          Add player
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-sm border border-zinc-300 dark:border-zinc-700 px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function PlayerAvatar({
  name,
  avatarUrl,
  color,
  size = 32,
}: {
  name: string;
  avatarUrl?: string | null;
  color?: string | null;
  size?: number;
}) {
  const c = color ?? '#71717a';
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size, boxShadow: `0 0 0 1px ${c}` }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex flex-none items-center justify-center rounded-full font-bold uppercase"
      style={{
        width: size,
        height: size,
        background: `${c}33`,
        color: c,
        fontSize: size * 0.4,
        boxShadow: `0 0 0 1px ${c}`,
      }}
    >
      {name.charAt(0)}
    </span>
  );
}
