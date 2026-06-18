import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trophy } from 'lucide-react';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { getPlayerProfile, type ProfileMatch } from '@/lib/data/player-profile';
import MemberAvatar from '@/components/avatar/MemberAvatar';
import {
  formatTripTime,
  formatTripDayLong,
  roundFormatLabel,
} from '@/lib/format';

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');

  const profile = await getPlayerProfile(id);
  if (!profile) notFound();

  const { member, team, matches, arcadePortraitUrl } = profile;
  const teamColor = team?.color ?? '#3f3f46';

  return (
    <div className="pb-24">
      <section
        className="-mt-px overflow-hidden border-b"
        style={{
          background: `linear-gradient(180deg, ${teamColor}33 0%, transparent 100%)`,
          borderBottomColor: `${teamColor}99`,
        }}
      >
        <div className="mx-auto max-w-md px-4 pb-8 pt-6">
          <Link
            href={`/trips/${slug}/scoreboard`}
            className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400 hover:text-yellow-400"
          >
            <ArrowLeft size={12} /> Scoreboard
          </Link>

          <div className="mt-6 flex items-start gap-4">
            <MemberAvatar
              nickname={member.nickname}
              arcadePortraitUrl={arcadePortraitUrl}
              avatarUrl={member.avatarUrl}
              teamColor={teamColor}
              size={96}
              hero
            />

            <div className="min-w-0 flex-1">
              {team && (
                <p
                  className="font-mono text-[10px] font-bold uppercase tracking-[0.3em]"
                  style={{ color: teamColor }}
                >
                  {team.name}
                </p>
              )}
              <h1 className="mt-1 text-4xl font-bold leading-none tracking-tight">
                {member.nickname}
              </h1>
              <div className="mt-3 flex gap-2">
                {member.isCaptain && (
                  <span
                    className="rounded-sm px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest"
                    style={{
                      backgroundColor: `${teamColor}33`,
                      color: teamColor,
                      border: `1px solid ${teamColor}66`,
                    }}
                  >
                    Captain
                  </span>
                )}
                {member.role === 'trip_admin' && (
                  <span className="rounded-sm border border-yellow-500/40 bg-yellow-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-yellow-800 dark:text-yellow-300">
                    Admin
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-md px-4 pt-6">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Trip handicap" value={member.tripHandicap ?? '—'} accent={teamColor} />
          <Stat label="Matches" value={matches.length} />
        </div>

        {member.scoutingReport && (
          <section className="mt-6 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-4">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Scouting report
            </p>
            <p className="mt-2 text-sm whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
              {member.scoutingReport}
            </p>
          </section>
        )}

        <section className="mt-8">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-zinc-500">
            Matches
          </p>
          <div className="mt-3 space-y-2">
            {matches.length === 0 ? (
              <p className="text-sm text-zinc-500">No matches yet.</p>
            ) : (
              matches.map((m) => (
                <MatchRow
                  key={m.match.id}
                  m={m}
                  selfTripMemberId={member.id}
                  slug={slug}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function MatchRow({
  m,
  selfTripMemberId,
  slug,
}: {
  m: ProfileMatch;
  selfTripMemberId: string;
  slug: string;
}) {
  const opponents = m.participants.filter(
    (p) => p.tripMemberId !== selfTripMemberId
  );
  const selfParticipant = m.participants.find(
    (p) => p.tripMemberId === selfTripMemberId
  );
  const selfTeamId = selfParticipant?.teamId;
  const partners = m.participants.filter(
    (p) => p.tripMemberId !== selfTripMemberId && p.teamId === selfTeamId
  );
  const opponentSide = opponents.filter((p) => p.teamId !== selfTeamId);
  const opponentColor = opponentSide[0]?.teamColor ?? '#71717a';

  const isCompleted = m.match.status === 'completed';
  const youWon =
    isCompleted &&
    !m.match.isHalved &&
    m.match.winningTeamId &&
    m.match.winningTeamId === selfTeamId;
  const youLost =
    isCompleted &&
    !m.match.isHalved &&
    m.match.winningTeamId &&
    m.match.winningTeamId !== selfTeamId;
  const halved = isCompleted && m.match.isHalved;

  return (
    <Link
      href={`/trips/${slug}/matches/${m.match.id}`}
      className="block rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-3 hover:border-yellow-500/40 hover:bg-zinc-100 dark:hover:bg-zinc-900/40"
    >
      <div className="flex items-start gap-3">
        <div className="w-12 shrink-0">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-yellow-800 dark:text-yellow-400">
            R{m.round.order}
          </p>
          {m.teeTime?.time && (
            <p className="mt-0.5 font-mono text-[10px] tabular-nums text-zinc-500">
              {formatTripTime(m.teeTime.time)}
            </p>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Trophy size={12} className="text-yellow-800 dark:text-yellow-500" />
            <p className="truncate text-sm font-semibold">{m.course.name}</p>
          </div>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            {roundFormatLabel(m.round.format)}
          </p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            {partners.length > 0 && (
              <>
                with{' '}
                <span className="text-zinc-800 dark:text-zinc-200">
                  {partners.map((p) => p.nickname).join(' & ')}
                </span>{' '}
              </>
            )}
            <span className="text-zinc-500">vs</span>{' '}
            <span style={{ color: opponentColor }}>
              {opponentSide.map((p) => p.nickname).join(' & ')}
            </span>
          </p>
        </div>

        <div className="shrink-0 text-right">
          {isCompleted ? (
            <>
              <p
                className={`font-mono text-xs font-bold uppercase tracking-widest ${
                  youWon
                    ? 'text-emerald-400'
                    : youLost
                    ? 'text-red-400'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                {youWon ? 'W' : youLost ? 'L' : halved ? 'AS' : ''}
              </p>
              {m.match.resultText && (
                <p className="mt-0.5 font-mono text-[10px] tabular-nums text-zinc-500">
                  {m.match.resultText}
                </p>
              )}
            </>
          ) : (
            <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
              {m.match.status.replace('_', ' ')}
            </p>
          )}
        </div>
      </div>

      {m.teeTime?.time && (
        <p className="mt-2 font-mono text-[9px] tabular-nums text-zinc-600">
          {formatTripDayLong(m.teeTime.time)}
        </p>
      )}
    </Link>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        {label}
      </p>
      <p
        className="mt-1 text-3xl font-semibold tabular-nums"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
    </div>
  );
}
