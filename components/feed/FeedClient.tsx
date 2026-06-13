'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Flame,
  ImageIcon,
  MessageSquare,
  Plus,
  Trophy,
  Video,
  User as UserIcon,
} from 'lucide-react';
import FeedComposer, { type ComposerMatchOption } from './FeedComposer';
import ReactionsBar from './ReactionsBar';
import UnflagMediaButton from './UnflagMediaButton';
import DeleteFeedItemButton from './DeleteFeedItemButton';
import MemberAvatar from '@/components/avatar/MemberAvatar';
import type { FeedItem } from '@/lib/data/feed';

type ClientFeedItem =
  | (Omit<Extract<FeedItem, { kind: 'score' }>, 'at'> & { at: string })
  | (Omit<Extract<FeedItem, { kind: 'media' }>, 'at'> & { at: string })
  | (Omit<Extract<FeedItem, { kind: 'text' }>, 'at'> & { at: string });

export default function FeedClient({
  items,
  canPost,
  matchOptions,
  isAdmin = false,
  tripId,
  tripSlug,
}: {
  items: ClientFeedItem[];
  canPost: boolean;
  matchOptions: ComposerMatchOption[];
  isAdmin?: boolean;
  tripId: string;
  tripSlug: string;
}) {
  const router = useRouter();
  const [composerOpen, setComposerOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'score' | 'media' | 'text'>(
    'all'
  );

  // Auto-refresh every 25s for the "live" feel.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 25_000);
    return () => clearInterval(id);
  }, [router]);

  const filtered = items.filter((i) =>
    filter === 'all' ? true : i.kind === filter
  );

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 pb-28">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Flame size={16} className="text-yellow-500" />
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-500">
              Live feed
            </p>
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            Trip pulse
          </h1>
        </div>
        {canPost && (
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="flex items-center gap-1.5 rounded-sm border border-yellow-500/40 bg-yellow-500/10 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-yellow-300 hover:bg-yellow-500/20"
          >
            <Plus size={12} strokeWidth={2.5} /> Post
          </button>
        )}
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        <FilterChip
          active={filter === 'all'}
          onClick={() => setFilter('all')}
          label="All"
        />
        <FilterChip
          active={filter === 'score'}
          onClick={() => setFilter('score')}
          label="Scores"
          icon={<Trophy size={11} />}
        />
        <FilterChip
          active={filter === 'media'}
          onClick={() => setFilter('media')}
          label="Photos"
          icon={<ImageIcon size={11} />}
        />
        <FilterChip
          active={filter === 'text'}
          onClick={() => setFilter('text')}
          label="Talk"
          icon={<MessageSquare size={11} />}
        />
      </div>

      <div className="mt-6 space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-8 text-center">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Quiet
            </p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Nothing on the feed yet. Be the first.
            </p>
          </div>
        ) : (
          filtered.map((item) => (
            <FeedItemCard key={item.id} item={item} isAdmin={isAdmin} tripSlug={tripSlug} />
          ))
        )}
      </div>

      <FeedComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        matchOptions={matchOptions}
        tripId={tripId}
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-sm border px-3 py-1.5 ${
        active
          ? 'border-yellow-500/60 bg-yellow-500/10'
          : 'border-zinc-300 dark:border-zinc-800 bg-white dark:bg-black hover:border-zinc-700'
      }`}
    >
      <span
        className={`flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest ${
          active ? 'text-yellow-400' : 'text-zinc-600 dark:text-zinc-400'
        }`}
      >
        {icon}
        {label}
      </span>
    </button>
  );
}

function FeedItemCard({
  item,
  isAdmin,
  tripSlug,
}: {
  item: ClientFeedItem;
  isAdmin: boolean;
  tripSlug: string;
}) {
  switch (item.kind) {
    case 'score':
      return <ScoreCard item={item} tripSlug={tripSlug} />;
    case 'media':
      return <MediaCard item={item} isAdmin={isAdmin} />;
    case 'text':
      return <TextCard item={item} isAdmin={isAdmin} />;
  }
}

function ScoreCard({
  item,
  tripSlug,
}: {
  item: Extract<ClientFeedItem, { kind: 'score' }>;
  tripSlug: string;
}) {
  const color = item.author.teamColor ?? '#3f3f46';
  // Color is keyed off NET (gross - strokes) so a netted-down bogey reads as par.
  // Hole in ones override even when strokes > 0.
  const netDiff = item.gross === 1 ? -3 : item.net - item.par;
  const labelColor =
    netDiff <= -1
      ? 'text-emerald-400'
      : netDiff === 0
      ? 'text-zinc-800 dark:text-zinc-200'
      : netDiff === 1
      ? 'text-yellow-400'
      : 'text-red-400';

  return (
    <div
      className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <Link
        href={`/trips/${tripSlug}/matches/${item.match.matchId}`}
        className="block p-3 hover:bg-zinc-100 dark:hover:bg-zinc-900/40"
      >
        <div className="flex items-start gap-3">
          <Avatar author={item.author} color={color} />
          <div className="min-w-0 flex-1">
            <FeedHeader author={item.author} at={item.at} />
            <p className={`mt-1 font-mono text-sm font-bold uppercase tracking-widest ${labelColor}`}>
              {item.resultLabel} · {item.gross} on Hole {item.holeNumber}{' '}
              <span className="text-zinc-600">(par {item.par})</span>
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              R{item.match.roundOrder} · {item.match.courseName}
              {item.strokes > 0 && (
                <>
                  <span className="mx-1 text-zinc-700">·</span>
                  <span className="text-emerald-400">
                    +{item.strokes} stk · net {item.net}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
      </Link>
      <div className="border-t border-zinc-300 dark:border-zinc-800 px-3 py-2">
        <ReactionsBar
          targetKind="score"
          targetId={item.targetId}
          counts={item.reactions.counts}
          myEmojis={item.reactions.myEmojis}
        />
      </div>
    </div>
  );
}

function MediaCard({
  item,
  isAdmin,
}: {
  item: Extract<ClientFeedItem, { kind: 'media' }>;
  isAdmin: boolean;
}) {
  const color = item.author.teamColor ?? '#3f3f46';
  const isFlagged = item.moderationStatus === 'flagged';

  return (
    <div
      className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="p-3 pb-2">
        <div className="flex items-start gap-3">
          <Avatar author={item.author} color={color} />
          <div className="min-w-0 flex-1">
            <FeedHeader author={item.author} at={item.at} />
            {item.match && (
              <p className="mt-0.5 font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                R{item.match.roundOrder} · {item.match.courseName}
              </p>
            )}
          </div>
          <Video size={14} className="shrink-0 text-zinc-600" />
        </div>
      </div>

      <div className="flex items-center justify-center border-y border-zinc-300 dark:border-zinc-800 bg-white dark:bg-black">
        {isFlagged ? (
          <FlaggedMediaCard reason={item.moderationReason} nickname={item.author.nickname} />
        ) : item.mediaType === 'video' ? (
          <video
            src={item.mediaUrl}
            controls
            playsInline
            className="block max-h-[80vh] w-full bg-white dark:bg-black object-contain"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.mediaUrl}
            alt={item.caption ?? ''}
            className="block max-h-[80vh] w-full bg-white dark:bg-black object-contain"
          />
        )}
      </div>

      {item.caption && !isFlagged && (
        <p className="px-3 py-3 text-sm text-zinc-800 dark:text-zinc-200">{item.caption}</p>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-zinc-300 dark:border-zinc-800 px-3 py-2">
        <ReactionsBar
          targetKind="media"
          targetId={item.targetId}
          counts={item.reactions.counts}
          myEmojis={item.reactions.myEmojis}
        />
        <div className="flex shrink-0 items-center gap-1">
          {isFlagged && isAdmin && <UnflagMediaButton mediaId={item.targetId} />}
          {(item.isMine || isAdmin) && (
            <DeleteFeedItemButton kind="media" id={item.targetId} />
          )}
        </div>
      </div>
    </div>
  );
}

function FlaggedMediaCard({
  reason,
  nickname,
}: {
  reason: string | null;
  nickname: string;
}) {
  return (
    <div className="relative w-full bg-white dark:bg-black">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/SICKOS.webp"
        alt="Flagged content"
        className="block max-h-[80vh] w-full object-contain"
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent p-4">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-red-400">
          Flagged · {reason ?? 'content moderation'}
        </p>
        <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {nickname}, what were you thinking?
        </p>
      </div>
    </div>
  );
}

function TextCard({
  item,
  isAdmin,
}: {
  item: Extract<ClientFeedItem, { kind: 'text' }>;
  isAdmin: boolean;
}) {
  const color = item.author.teamColor ?? '#3f3f46';
  const canDelete = item.isMine || isAdmin;
  return (
    <div
      className={`rounded-sm border bg-zinc-50 dark:bg-zinc-950/40 ${
        item.pinned ? 'border-yellow-500/50' : 'border-zinc-300 dark:border-zinc-800'
      }`}
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="p-3">
        <div className="flex items-start gap-3">
          <Avatar author={item.author} color={color} />
          <div className="min-w-0 flex-1">
            <FeedHeader author={item.author} at={item.at} />
            {item.pinned && (
              <p className="mt-1 font-mono text-[9px] font-semibold uppercase tracking-widest text-yellow-400">
                Pinned
              </p>
            )}
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-900 dark:text-zinc-100">
              {item.body}
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-zinc-300 dark:border-zinc-800 px-3 py-2">
        <ReactionsBar
          targetKind="text"
          targetId={item.targetId}
          counts={item.reactions.counts}
          myEmojis={item.reactions.myEmojis}
        />
        {canDelete && (
          <div className="shrink-0">
            <DeleteFeedItemButton kind="text" id={item.targetId} />
          </div>
        )}
      </div>
    </div>
  );
}

function Avatar({
  author,
  color,
}: {
  author: ClientFeedItem['author'];
  color: string;
}) {
  return (
    <MemberAvatar
      nickname={author.nickname}
      arcadePortraitUrl={author.arcadePortraitUrl}
      avatarUrl={author.avatarUrl}
      teamColor={color}
      size={36}
    />
  );
}

function FeedHeader({
  author,
  at,
}: {
  author: ClientFeedItem['author'];
  at: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{author.nickname}</p>
        {author.teamName && (
          <p
            className="font-mono text-[9px] font-semibold uppercase tracking-widest"
            style={{ color: author.teamColor ?? undefined }}
          >
            {author.teamName}
          </p>
        )}
      </div>
      <span className="shrink-0 font-mono text-[9px] uppercase tracking-widest text-zinc-500">
        {formatRelative(new Date(at))}
      </span>
    </div>
  );
}

function formatRelative(d: Date): string {
  const now = Date.now();
  const diffMs = now - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  }).format(d);
}
