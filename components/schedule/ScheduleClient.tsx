'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin,
  Trophy,
  UtensilsCrossed,
  Plane,
  Bus,
  Hotel,
  Sparkles,
  Calendar,
  CalendarRange,
  ChevronRight,
  Plus,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type ClientParticipant = {
  tripMemberId: string;
  nickname: string;
  tripHandicap: string | null;
  teamId: string;
  teamName: string;
  teamColor: string | null;
};

export type ClientMatch = {
  id: string;
  resultText: string | null;
  participants: ClientParticipant[];
};

export type ClientGolfItem = {
  kind: 'golf';
  startTimeISO: string;
  teeTimeId: string;
  groupNumber: number;
  roundOrder: number;
  roundLabel: string | null;
  roundFormat: 'best_ball' | 'singles' | 'scramble' | 'stroke' | 'two_man_aggregate';
  courseName: string;
  courseLocation: string | null;
  matches: ClientMatch[];
};

export type ClientEventItem = {
  kind: 'event';
  startTimeISO: string;
  eventId: string;
  type: string;
  title: string;
  description: string | null;
  location: string | null;
  address: string | null;
};

export type ClientEmptyRoundItem = {
  kind: 'empty_round';
  startTimeISO: string;
  roundId: string;
  roundOrder: number;
  roundLabel: string | null;
  roundFormat: 'best_ball' | 'singles' | 'scramble' | 'stroke' | 'two_man_aggregate';
  courseName: string;
  courseLocation: string | null;
};

export type ClientItem = ClientGolfItem | ClientEventItem | ClientEmptyRoundItem;

export type ClientScheduleDay = {
  date: string;
  dayLabel: string;
  monthDay: string;
  items: ClientItem[];
};

const EVENT_ICONS: Record<string, LucideIcon> = {
  flight: Plane,
  shuttle: Bus,
  meal: UtensilsCrossed,
  social: Sparkles,
  hotel_checkin: Hotel,
  hotel_checkout: Hotel,
  other: Calendar,
};

const VIEW_KEY = 'cup_schedule_view';
const DAY_KEY = 'cup_schedule_day';

export default function ScheduleClient({
  days,
  canEdit = false,
  tripSlug,
}: {
  days: ClientScheduleDay[];
  canEdit?: boolean;
  tripSlug: string;
}) {
  const [view, setView] = useState<'list' | 'day'>('list');
  const [activeDay, setActiveDay] = useState(days[0]?.date ?? '');
  const [restored, setRestored] = useState(false);

  // Restore last-used view + day on mount so back-from-detail lands you where you left off.
  useEffect(() => {
    const storedView = localStorage.getItem(VIEW_KEY);
    if (storedView === 'day' || storedView === 'list') setView(storedView);
    const storedDay = localStorage.getItem(DAY_KEY);
    if (storedDay && days.some((d) => d.date === storedDay)) {
      setActiveDay(storedDay);
    }
    setRestored(true);
  }, [days]);

  useEffect(() => {
    if (restored) localStorage.setItem(VIEW_KEY, view);
  }, [view, restored]);

  useEffect(() => {
    if (restored && activeDay) localStorage.setItem(DAY_KEY, activeDay);
  }, [activeDay, restored]);

  if (days.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 pt-16 pb-24">
        <div className="rounded-sm border border-yellow-600/20 bg-black/50 p-8 text-center">
          <p className="text-zinc-400">No schedule yet.</p>
          {canEdit ? (
            <>
              <p className="mt-1 text-xs text-zinc-600">
                Add the first round or event to get started.
              </p>
              <div className="mt-6 flex flex-col items-stretch gap-2 sm:flex-row sm:justify-center">
                <Link
                  href={`/trips/${tripSlug}/admin/rounds/new`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-sm border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-yellow-300 hover:bg-yellow-500/20"
                >
                  <Plus size={12} strokeWidth={2.5} />
                  New round
                </Link>
                <Link
                  href={`/trips/${tripSlug}/events/new`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-sm border border-zinc-700 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-300 hover:bg-zinc-900"
                >
                  <Plus size={12} strokeWidth={2.5} />
                  New event
                </Link>
              </div>
            </>
          ) : (
            <p className="mt-1 text-xs text-zinc-600">
              Check back when the trip admin posts the lineup.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 pb-24">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-500">
            Itinerary
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Schedule</h1>
        </div>
        <ViewToggle view={view} onChange={setView} />
      </div>

      {canEdit && (
        <div className="mb-6 flex justify-end gap-2">
          <Link
            href={`/trips/${tripSlug}/admin/rounds/new`}
            className="flex items-center gap-1.5 rounded-sm border border-yellow-500/40 bg-yellow-500/10 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-yellow-300 hover:bg-yellow-500/20"
          >
            <Plus size={12} strokeWidth={2.5} />
            New round
          </Link>
          <Link
            href={`/trips/${tripSlug}/events/new`}
            className="flex items-center gap-1.5 rounded-sm border border-zinc-700 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-300 hover:bg-zinc-900"
          >
            <Plus size={12} strokeWidth={2.5} />
            New event
          </Link>
        </div>
      )}

      <AnimatePresence mode="wait">
        {view === 'list' ? (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <ListView days={days} canEdit={canEdit} tripSlug={tripSlug} />
          </motion.div>
        ) : (
          <motion.div
            key="day"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <DayCarouselView
              days={days}
              activeDay={activeDay || days[0].date}
              onChange={setActiveDay}
              canEdit={canEdit}
              tripSlug={tripSlug}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: 'list' | 'day';
  onChange: (v: 'list' | 'day') => void;
}) {
  return (
    <div className="flex rounded-sm border border-zinc-800 bg-black p-0.5">
      <button
        onClick={() => onChange('list')}
        className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest transition-colors ${
          view === 'list' ? 'bg-yellow-500 text-black' : 'text-zinc-500 hover:text-zinc-200'
        }`}
        aria-pressed={view === 'list'}
      >
        <CalendarRange size={14} strokeWidth={2.5} />
        Overview
      </button>
      <button
        onClick={() => onChange('day')}
        className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest transition-colors ${
          view === 'day' ? 'bg-yellow-500 text-black' : 'text-zinc-500 hover:text-zinc-200'
        }`}
        aria-pressed={view === 'day'}
      >
        <Calendar size={14} strokeWidth={2.5} />
        Day
      </button>
    </div>
  );
}

function ListView({
  days,
  canEdit,
  tripSlug,
}: {
  days: ClientScheduleDay[];
  canEdit?: boolean;
  tripSlug: string;
}) {
  return (
    <div className="space-y-8">
      {days.map((day) => (
        <section key={day.date}>
          <DayHeader day={day} />
          <div className="mt-3 space-y-2">
            {day.items.map((item, i) => (
              <ItemRow key={i} item={item} compact canEdit={canEdit} tripSlug={tripSlug} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function DayCarouselView({
  days,
  activeDay,
  onChange,
  canEdit,
  tripSlug,
}: {
  days: ClientScheduleDay[];
  activeDay: string;
  onChange: (d: string) => void;
  canEdit?: boolean;
  tripSlug: string;
}) {
  const current = useMemo(
    () => days.find((d) => d.date === activeDay) ?? days[0],
    [days, activeDay]
  );

  return (
    <div>
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {days.map((d) => {
          const isActive = d.date === current.date;
          return (
            <button
              key={d.date}
              onClick={() => onChange(d.date)}
              className={`shrink-0 rounded-sm border px-4 py-2 text-left transition-colors ${
                isActive
                  ? 'border-yellow-500/60 bg-yellow-500/10'
                  : 'border-zinc-800 bg-black hover:border-zinc-700'
              }`}
            >
              <p
                className={`font-mono text-[10px] font-semibold uppercase tracking-widest ${
                  isActive ? 'text-yellow-400' : 'text-zinc-500'
                }`}
              >
                {d.dayLabel.slice(0, 3)}
              </p>
              <p className={`text-sm font-semibold ${isActive ? 'text-zinc-100' : 'text-zinc-400'}`}>
                {d.monthDay}
              </p>
            </button>
          );
        })}
      </div>

      <motion.div
        key={current.date}
        initial={{ opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.18 }}
        className="space-y-3"
      >
        {current.items.map((item, i) => (
          <ItemRow key={i} item={item} canEdit={canEdit} tripSlug={tripSlug} />
        ))}
      </motion.div>
    </div>
  );
}

function DayHeader({ day }: { day: ClientScheduleDay }) {
  return (
    <div className="flex items-baseline justify-between border-b border-zinc-800 pb-2">
      <h2 className="text-lg font-bold tracking-tight">{day.dayLabel}</h2>
      <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-yellow-500">
        {day.monthDay}
      </p>
    </div>
  );
}

function ItemRow({
  item,
  compact,
  canEdit,
  tripSlug,
}: {
  item: ClientItem;
  compact?: boolean;
  canEdit?: boolean;
  tripSlug: string;
}) {
  if (item.kind === 'golf') return <GolfRow item={item} compact={compact} canEdit={canEdit} tripSlug={tripSlug} />;
  if (item.kind === 'empty_round') return <EmptyRoundRow item={item} tripSlug={tripSlug} canEdit={canEdit} />;
  return <EventRow item={item} compact={compact} tripSlug={tripSlug} />;
}

function EmptyRoundRow({
  item,
  tripSlug,
  canEdit,
}: {
  item: ClientEmptyRoundItem;
  tripSlug: string;
  canEdit?: boolean;
}) {
  const editHref = `/trips/${tripSlug}/admin/rounds/${item.roundId}/edit`;
  const formatLabel = (fmt: ClientEmptyRoundItem['roundFormat']): string => {
    switch (fmt) {
      case 'best_ball': return 'Best Ball';
      case 'singles': return 'Singles';
      case 'scramble': return 'Scramble';
      case 'stroke': return 'Stroke';
      case 'two_man_aggregate': return 'Aggregate';
    }
  };
  return (
    <div className="rounded-sm border border-dashed border-yellow-500/40 bg-zinc-950/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-yellow-500">
            Round {item.roundOrder} · {formatLabel(item.roundFormat)} · No tee times yet
          </p>
          <p className="mt-1.5 truncate font-semibold text-zinc-100">
            {item.roundLabel ?? item.courseName}
          </p>
          <p className="truncate text-xs text-zinc-500">
            {item.courseName}
            {item.courseLocation ? ` · ${item.courseLocation}` : ''}
          </p>
        </div>
        {canEdit && (
          <Link
            href={editHref}
            className="shrink-0 rounded-sm border border-yellow-500/50 bg-yellow-500/10 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-yellow-300 hover:bg-yellow-500/20"
          >
            Add tee times
          </Link>
        )}
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  }).format(d);
}

function mapsUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function formatLabel(fmt: ClientGolfItem['roundFormat']): string {
  switch (fmt) {
    case 'best_ball':         return 'Best Ball · 2v2';
    case 'singles':           return 'Singles · 1v1';
    case 'scramble':          return 'Scramble';
    case 'stroke':            return 'Stroke Play';
    case 'two_man_aggregate': return 'Two-Man Aggregate';
  }
}

function GolfRow({
  item,
  compact,
  canEdit,
  tripSlug,
}: {
  item: ClientGolfItem;
  compact?: boolean;
  canEdit?: boolean;
  tripSlug: string;
}) {
  const time = formatTime(item.startTimeISO);

  // No matches yet — render placeholder card (e.g., R5 captain-pick, R6 scramble)
  if (item.matches.length === 0) {
    return (
      <div className="rounded-sm border border-zinc-800 bg-zinc-950/40 p-3">
        <div className="flex items-start gap-3">
          <div className="w-16 shrink-0">
            <p className="font-mono text-xs font-bold tabular-nums text-yellow-400">{time}</p>
            <p className="font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
              Group {item.groupNumber}
            </p>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Trophy size={14} className="text-yellow-500" />
              <p className="truncate font-semibold">{item.courseName}</p>
            </div>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              R{item.roundOrder} · {formatLabel(item.roundFormat)}
            </p>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
              Matchups TBD
            </p>
            {canEdit && (
              <Link
                href={`/trips/${tripSlug}/matches/new?teeTimeId=${item.teeTimeId}`}
                className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-yellow-400 hover:text-yellow-300"
              >
                <Plus size={11} /> Add matchup
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  // One clickable card per match. Layout shifts between compact (list) and expanded (day).
  return (
    <div className="space-y-2">
      {item.matches.map((m) => (
        <Link
          key={m.id}
          href={`/trips/${tripSlug}/matches/${m.id}`}
          className="block rounded-sm border border-zinc-800 bg-zinc-950/40 p-3 hover:border-yellow-500/40 hover:bg-zinc-900/40"
        >
          <div className="flex items-start gap-3">
            <div className="w-16 shrink-0">
              <p className="font-mono text-xs font-bold tabular-nums text-yellow-400">
                {time}
              </p>
              <p className="font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
                Group {item.groupNumber}
              </p>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Trophy size={14} className="text-yellow-500" />
                <p className="truncate font-semibold">{item.courseName}</p>
              </div>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                R{item.roundOrder} · {formatLabel(item.roundFormat)}
              </p>

              <div className="mt-3">
                {compact ? <MatchupLine match={m} /> : <MatchupStacked match={m} />}
              </div>
            </div>

            <ChevronRight size={14} className="mt-1 shrink-0 text-zinc-700" />
          </div>
        </Link>
      ))}
    </div>
  );
}

function MatchupStacked({ match }: { match: ClientMatch }) {
  const byTeam = new Map<string, ClientParticipant[]>();
  for (const p of match.participants) {
    const list = byTeam.get(p.teamId) ?? [];
    list.push(p);
    byTeam.set(p.teamId, list);
  }
  const teamGroups = Array.from(byTeam.values());

  if (teamGroups.length !== 2) return null;
  const [a, b] = teamGroups;

  return (
    <div className="space-y-2">
      <TeamBlock players={a} />
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-zinc-800" />
        <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
          vs
        </span>
        <div className="h-px flex-1 bg-zinc-800" />
      </div>
      <TeamBlock players={b} />
    </div>
  );
}

function TeamBlock({ players }: { players: ClientParticipant[] }) {
  const color = players[0]?.teamColor ?? '#71717a';
  const teamName = players[0]?.teamName ?? '';

  return (
    <div
      className="rounded-sm border p-2.5"
      style={{ borderColor: `${color}55`, background: `${color}0a` }}
    >
      <p
        className="font-mono text-[9px] font-semibold uppercase tracking-widest"
        style={{ color }}
      >
        {teamName}
      </p>
      <div className="mt-1.5 space-y-0.5">
        {players.map((p) => (
          <div
            key={p.tripMemberId}
            className="flex items-baseline justify-between gap-2"
          >
            <p className="text-sm font-semibold">{p.nickname}</p>
            {p.tripHandicap && (
              <p className="font-mono text-xs tabular-nums text-zinc-500">
                {p.tripHandicap}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchupLine({ match }: { match: ClientMatch }) {
  const byTeam = new Map<string, ClientParticipant[]>();
  for (const p of match.participants) {
    const list = byTeam.get(p.teamId) ?? [];
    list.push(p);
    byTeam.set(p.teamId, list);
  }
  const teamGroups = Array.from(byTeam.values());

  if (teamGroups.length !== 2) return null;
  const [a, b] = teamGroups;

  return (
    <div className="flex items-center gap-2 text-xs">
      <TeamSide players={a} />
      <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
        vs
      </span>
      <TeamSide players={b} align="right" />
    </div>
  );
}

function TeamSide({ players, align = 'left' }: { players: ClientParticipant[]; align?: 'left' | 'right' }) {
  const color = players[0]?.teamColor ?? '#71717a';
  return (
    <span
      className={`min-w-0 flex-1 truncate text-${align === 'right' ? 'right' : 'left'}`}
      style={{ color }}
    >
      {players.map((p, i) => (
        <span key={p.tripMemberId}>
          {i > 0 && ' & '}
          {p.nickname}
          {p.tripHandicap && (
            <span className="ml-1 font-mono text-[10px] tabular-nums opacity-60">
              {p.tripHandicap}
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

function EventRow({ item, compact, tripSlug }: { item: ClientEventItem; compact?: boolean; tripSlug: string }) {
  const time = formatTime(item.startTimeISO);
  const Icon = EVENT_ICONS[item.type] ?? Calendar;

  return (
    <Link
      href={`/trips/${tripSlug}/events/${item.eventId}`}
      className="block rounded-sm border border-zinc-800 bg-zinc-950/40 p-3 hover:border-yellow-500/40 hover:bg-zinc-900/40"
    >
      <div className="flex items-start gap-3">
        <div className="w-16 shrink-0">
          <p className="font-mono text-xs font-bold tabular-nums text-zinc-300">{time}</p>
          <p className="font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
            {item.type.replace('_', ' ')}
          </p>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon size={14} className="text-zinc-400" />
            <p className="truncate font-semibold">{item.title}</p>
          </div>

          {item.location && (
            <p className="mt-0.5 text-xs text-zinc-500">{item.location}</p>
          )}

          {!compact && item.description && (
            <p className="mt-1.5 text-xs text-zinc-400">{item.description}</p>
          )}
        </div>

        <ChevronRight size={14} className="mt-1 shrink-0 text-zinc-700" />
      </div>
    </Link>
  );
}
