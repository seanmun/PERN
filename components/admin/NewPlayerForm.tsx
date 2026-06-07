'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Loader2, Search, User as UserIcon, X } from 'lucide-react';
import { createPlayer } from '@/lib/actions/players';
import { searchUsers, type UserSearchResult } from '@/lib/actions/users';

type Team = { id: string; name: string };

/**
 * Three ways an admin can add a player:
 *   1. Search for an existing platform user (pre-fills email + nickname,
 *      links the new tripMember.userId immediately).
 *   2. Type a new email + nickname (player will lazy-claim on sign-in).
 *   3. Leave the email blank — creates a "shell" tripMember that doesn't
 *      auto-claim. Useful for players who haven't been invited yet or
 *      refused to join but should appear in matchups.
 */
export default function NewPlayerForm({
  tripId,
  slug,
  teams,
}: {
  tripId: string;
  slug: string;
  teams: Team[];
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [linked, setLinked] = useState<UserSearchResult | null>(null);
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (linked) {
      // When a user is picked, suppress the live search.
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await searchUsers(q);
        setResults(r);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, linked]);

  function selectUser(u: UserSearchResult) {
    setLinked(u);
    setNickname(u.fullName?.split(' ')[0] ?? u.email.split('@')[0]);
    setEmail(u.email);
    setQuery('');
    setResults([]);
  }

  function clearLinked() {
    setLinked(null);
    setNickname('');
    setEmail('');
  }

  async function onSubmit(formData: FormData) {
    setError(null);
    // Server action throws on validation issues — surface inline.
    startSubmit(async () => {
      try {
        await createPlayer(formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Add player failed.');
      }
    });
  }

  return (
    <form action={onSubmit} className="mt-8 space-y-5">
      <input type="hidden" name="tripId" value={tripId} />
      {linked && (
        <input type="hidden" name="linkedUserId" value={linked.id} />
      )}

      {/* — Search picker — */}
      {!linked && (
        <div>
          <label className="block">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
              Search existing user
            </span>
            <div className="relative mt-2">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Email or name"
                className={`${inputCls} pl-9`}
                autoComplete="off"
              />
              {searching && (
                <Loader2
                  size={14}
                  className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-zinc-500"
                />
              )}
            </div>
          </label>
          <p className="mt-1.5 text-[11px] text-zinc-500">
            Pick someone already on the platform to link them instantly. Skip
            this and fill the fields below to add by email, or leave email
            blank for a shell player.
          </p>

          {results.length > 0 && (
            <ul className="mt-2 max-h-64 overflow-y-auto rounded-sm border border-zinc-800 bg-zinc-950/70">
              {results.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => selectUser(u)}
                    className="flex w-full items-center gap-3 border-b border-zinc-900 px-3 py-2 text-left last:border-b-0 hover:bg-zinc-900/80"
                  >
                    {u.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={u.arcadePortraitUrl ?? u.avatarUrl}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-sm object-cover"
                      />
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-zinc-900 text-zinc-500">
                        <UserIcon size={14} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {u.fullName ?? u.email}
                      </p>
                      <p className="truncate font-mono text-[10px] text-zinc-500">
                        {u.email}
                        {u.handicap && ` · ${u.handicap} hcp`}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* — Linked user chip — */}
      {linked && (
        <div className="flex items-center gap-3 rounded-sm border border-emerald-700/40 bg-emerald-950/30 p-3">
          {linked.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={linked.arcadePortraitUrl ?? linked.avatarUrl}
              alt=""
              className="h-10 w-10 shrink-0 rounded-sm object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-zinc-900 text-zinc-500">
              <UserIcon size={16} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              Linked: {linked.fullName ?? linked.email}
            </p>
            <p className="truncate font-mono text-[10px] uppercase tracking-widest text-emerald-400">
              Will inherit avatar
              {linked.handicap ? `, handicap ${linked.handicap}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={clearLinked}
            className="shrink-0 rounded-sm border border-zinc-700 p-2 text-zinc-400 hover:border-red-700/40 hover:text-red-400"
            aria-label="Unlink user"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* — Manual fields — */}
      <Field label="Nickname" required>
        <input
          type="text"
          name="nickname"
          required
          maxLength={40}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Dan"
          className={inputCls}
        />
      </Field>

      <Field
        label="Email"
        hint="Optional. Leave blank for a shell player — no auto-claim, no sign-in expected."
      >
        <input
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="dan@example.com"
          className={inputCls}
        />
      </Field>

      <Field label="Team">
        <select name="teamId" defaultValue="" className={inputCls}>
          <option value="">— None —</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Trip handicap"
        hint={
          linked?.handicap
            ? `Optional. Will default to ${linked.handicap} from ${linked.fullName ?? linked.email} if left blank.`
            : 'Optional. One decimal, e.g. 12.3.'
        }
      >
        <input
          type="text"
          name="tripHandicap"
          inputMode="decimal"
          placeholder="—"
          className={inputCls}
        />
      </Field>

      {error && (
        <p className="rounded-sm border border-red-700/40 bg-red-950/30 px-3 py-2 text-[12px] text-red-300">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 rounded-sm bg-yellow-500 px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.3)] hover:bg-yellow-400 disabled:opacity-60"
        >
          {isSubmitting ? 'Adding…' : 'Add player'}
        </button>
        <Link
          href={`/trips/${slug}/admin/players`}
          className="rounded-sm border border-zinc-700 px-6 py-3 font-mono text-xs font-semibold uppercase tracking-widest text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

const inputCls =
  'mt-2 block w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500';

function Field({
  label,
  children,
  hint,
  required,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
        {label}
        {required && <span className="ml-1 text-yellow-500">*</span>}
      </span>
      {children}
      {hint && <p className="mt-1.5 text-[11px] text-zinc-500">{hint}</p>}
    </label>
  );
}
