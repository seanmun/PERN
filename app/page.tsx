import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Calendar,
  ChevronDown,
  Flag,
  Flame,
  Mail,
  MapPin,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import HomeBgVideo from '@/components/HomeBgVideo';
import Footer from '@/components/marketing/Footer';
import Reveal from '@/components/marketing/Reveal';

const GOLD = '#eab308';
const GREEN = '#16a34a';

const HOW_IT_WORKS = [
  {
    num: '01',
    icon: Flag,
    title: 'Create your trip',
    body: 'Name it. Pick the dates. Set your two team colors. Done in 30 seconds — you’re the trip admin.',
  },
  {
    num: '02',
    icon: Mail,
    title: 'Invite your buddies',
    body: 'Drop in emails or share a join link. Players claim their slot the first time they log in. The app stays usable even if half of them never sign in.',
  },
  {
    num: '03',
    icon: MapPin,
    title: 'Add your courses',
    body: 'Snap a photo of the scorecard, AI reads the par, yardage, and stroke index for all 18 holes. Edit anything that doesn’t look right.',
  },
  {
    num: '04',
    icon: Calendar,
    title: 'Schedule your cup',
    body: 'Five rounds, six rounds, whatever you want. Pair tee times, assign matchups, mark the format (2v2, singles, scramble).',
  },
  {
    num: '05',
    icon: Sparkles,
    title: 'Plan the surrounding chaos',
    body: 'Flights, shuttles, group dinners, the post-round bar stop. Everything lands on one shared schedule next to the golf.',
  },
] as const;

const LEADERBOARD = [
  { name: 'Ian', team: 'gold', score: '-5' },
  { name: 'Kyle', team: 'green', score: '-2' },
  { name: 'Dan', team: 'green', score: 'E' },
  { name: 'Sean', team: 'gold', score: '+3' },
] as const;

type FeedPost =
  | {
      kind: 'text';
      name: string;
      team: string;
      color: string;
      body: string;
      reactions: { emoji: string; count: number }[];
    }
  | {
      kind: 'score';
      name: string;
      team: string;
      color: string;
      course: string;
      round: string;
      front: number;
      back: number;
      total: number;
      vsPar: string;
      reactions: { emoji: string; count: number }[];
    };

const FEED_POSTS: FeedPost[] = [
  {
    kind: 'score',
    name: 'Ian',
    team: 'Chunkers',
    color: GOLD,
    course: 'Pinehurst No. 2',
    round: 'Round 2',
    front: 38,
    back: 39,
    total: 77,
    vsPar: '+5',
    reactions: [
      { emoji: '🔥', count: 9 },
      { emoji: '👀', count: 4 },
    ],
  },
  {
    kind: 'text',
    name: 'Ian',
    team: 'Chunkers',
    color: GOLD,
    body: 'Birdied 12 from the bunker. Adjust your scouting reports accordingly. 🐐',
    reactions: [
      { emoji: '🔥', count: 7 },
      { emoji: '🤡', count: 3 },
    ],
  },
  {
    kind: 'text',
    name: 'Dan',
    team: 'Hacks',
    color: GREEN,
    body: 'Photo of the day: Kyle’s tee shot finding a tree it had no business being near.',
    reactions: [{ emoji: '😂', count: 11 }],
  },
  {
    kind: 'text',
    name: 'Sean',
    team: 'Chunkers',
    color: GOLD,
    body: 'HACKS DORMIE 3 — but we’re not done yet.',
    reactions: [
      { emoji: '🍿', count: 5 },
      { emoji: '💀', count: 4 },
    ],
  },
];

type SchedulePlayer = { name: string; hcp?: string };
type ScheduleItem =
  | {
      kind: 'event';
      time: string;
      badge: string;
      title: string;
      place: string;
    }
  | {
      kind: 'match';
      time: string;
      badge: string;
      course: string;
      meta: string;
      home: { color: string; players: SchedulePlayer[] };
      away: { color: string; players: SchedulePlayer[] };
    };

const SCHEDULE_DAYS = ['Wed', 'Thu', 'Fri', 'Sat'] as const;

const SCHEDULE: ScheduleItem[] = [
  {
    kind: 'event',
    time: '11:00 AM',
    badge: 'Hotel check-in',
    title: 'Hotel check-in',
    place: 'Pine Needles Resort',
  },
  {
    kind: 'match',
    time: '2:30 PM',
    badge: 'Group 1',
    course: 'Pine Needles',
    meta: 'R1 · 2v2 · Match Play',
    home: {
      color: GREEN,
      players: [
        { name: 'Andy', hcp: '16.0' },
        { name: 'Carty', hcp: '13.2' },
      ],
    },
    away: {
      color: GOLD,
      players: [
        { name: 'Mallon', hcp: '25.1' },
        { name: 'Musket', hcp: '22.1' },
      ],
    },
  },
  {
    kind: 'match',
    time: '2:40 PM',
    badge: 'Group 2',
    course: 'Pine Needles',
    meta: 'R1 · 2v2 · Match Play',
    home: {
      color: GREEN,
      players: [
        { name: 'Truant', hcp: '16.9' },
        { name: 'Fran' },
      ],
    },
    away: {
      color: GOLD,
      players: [
        { name: 'Marino', hcp: '11.8' },
        { name: 'Dan', hcp: '11.2' },
      ],
    },
  },
  {
    kind: 'match',
    time: '2:50 PM',
    badge: 'Group 3',
    course: 'Pine Needles',
    meta: 'R1 · 2v2 · Match Play',
    home: {
      color: GREEN,
      players: [
        { name: 'Ian', hcp: '10.4' },
        { name: 'Munley', hcp: '24.5' },
      ],
    },
    away: {
      color: GOLD,
      players: [
        { name: 'Lusty', hcp: '16.2' },
        { name: 'Kyle', hcp: '15.5' },
      ],
    },
  },
  {
    kind: 'event',
    time: '7:00 PM',
    badge: 'Social',
    title: 'Welcome dinner',
    place: 'Pinehurst Resort',
  },
];

const PORTRAITS = [
  { name: 'DAN', team: 'Hacks', color: GREEN, src: '/homepage/dan.png' },
  { name: 'IAN', team: 'Chunkers', color: GOLD, src: '/homepage/ian.png' },
  { name: 'SEAN', team: 'Chunkers', color: GOLD, src: '/homepage/sean.png' },
  { name: 'KYLE', team: 'Hacks', color: GREEN, src: '/homepage/kyle.png' },
] as const;

type ShowcasePlayer = {
  nickname: string;
  teamName: string;
  teamColor: string;
  handicap: string | null;
  src: string;
};

/**
 * Hand-picked Pinehurst-style mock for the marketing showcase. Kept static
 * (no DB) so the home page renders fast for signed-out visitors. The four
 * images live in /public/homepage/arcade-*.png — drop `arcade-sean.png` or
 * `arcade-munley.png` in to swap Munley over.
 */
const SHOWCASE_PLAYERS: ShowcasePlayer[] = [
  { nickname: 'Ian',    teamName: 'Hacks',    teamColor: GREEN, handicap: '11', src: '/homepage/arcade-ian.png' },
  { nickname: 'Kyle',   teamName: 'Chunkers', teamColor: GOLD,  handicap: '15', src: '/homepage/arcade-kyle.png' },
  { nickname: 'Dan',    teamName: 'Chunkers', teamColor: GOLD,  handicap: '11', src: '/homepage/arcade-dan.png' },
  { nickname: 'Sean',   teamName: 'Hacks',    teamColor: GREEN, handicap: '25', src: '/homepage/arcade-sean.png' },
];

/** Same tier mapping used on the live matchup card. */
function handicapToRating(handicap: string | null): number {
  if (handicap == null) return 0;
  const h = parseFloat(handicap);
  if (!Number.isFinite(h)) return 0;
  if (h < 5) return 100;
  if (h < 10) return 90;
  if (h < 15) return 80;
  if (h < 20) return 70;
  if (h < 25) return 60;
  if (h < 30) return 50;
  return 20;
}

export default async function Home() {
  const ctx = await getGlobalAuthContext();
  if (ctx) redirect('/home');

  return (
    <div className="bg-[#0a0a0a] text-zinc-100">
      {/* ───────── Hero ───────── */}
      <section
        aria-label="BuddyCup"
        className="relative isolate overflow-hidden md:max-h-[760px]"
      >
        <HomeBgVideo src="/golfball-test.mp4" loopAt={11} />

        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(10,10,10,0.55) 0%, rgba(10,10,10,0.75) 60%, #0a0a0a 100%)',
          }}
          aria-hidden="true"
        />

        <div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 pb-28 pt-20 text-center sm:pb-32 sm:pt-28">
          <Reveal>
            <h1 className="mt-6 text-6xl font-bold leading-[0.95] tracking-tight drop-shadow-[0_2px_16px_rgba(0,0,0,0.8)] sm:text-7xl">
              <span className="block text-zinc-100">BUDDY</span>
              <span className="block bg-gradient-to-b from-yellow-300 via-yellow-500 to-yellow-700 bg-clip-text text-transparent">
                CUP
              </span>
            </h1>
          </Reveal>

          <Reveal delay={0.2}>
            <p className="mt-8 font-mono text-xs font-semibold uppercase tracking-[0.35em] text-yellow-500/90">
              Run your trip. Crown your champion.
            </p>
          </Reveal>

          <Reveal delay={0.3}>
            <p className="mx-auto mt-5 max-w-md text-zinc-300 drop-shadow-[0_1px_8px_rgba(0,0,0,0.8)]">
              Ryder-Cup-style match play for your buddy trip — scoring, schedule, trash talk,
              and the surrounding chaos, all on one shared scoreboard.
            </p>
          </Reveal>

          <Reveal delay={0.4}>
            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
              <Link
                href="/sign-in"
                className="rounded-sm bg-yellow-500 px-7 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.4)] transition-colors hover:bg-yellow-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              >
                Sign in
              </Link>
              <Link
                href="#how-it-works"
                className="group inline-flex items-center gap-2 rounded-sm border border-zinc-700/80 bg-black/40 px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-zinc-200 backdrop-blur transition-colors hover:border-yellow-500/60 hover:text-yellow-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              >
                How it works
                <ChevronDown
                  size={14}
                  strokeWidth={2.5}
                  className="transition-transform group-hover:translate-y-0.5"
                  aria-hidden="true"
                />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────── How it works ───────── */}
      <section
        id="how-it-works"
        aria-labelledby="how-it-works-heading"
        className="border-t border-zinc-900 py-20 sm:py-28"
      >
        <div className="mx-auto max-w-3xl px-4">
          <Reveal>
            <SectionKicker>How it works</SectionKicker>
            <h2
              id="how-it-works-heading"
              className="mt-4 text-balance text-3xl font-bold tracking-tight text-zinc-100 sm:text-4xl"
            >
              From signed-up to first tee shot in an afternoon.
            </h2>
            <p className="mt-4 text-zinc-400">
              No setup nightmares. No spreadsheets. Five short steps, and your trip is live.
            </p>
          </Reveal>

          <ol className="mt-12 flex flex-col gap-4">
            {HOW_IT_WORKS.map((step, i) => {
              const Icon = step.icon;
              return (
                <Reveal key={step.num} delay={i * 0.06}>
                  <li className="flex gap-5 rounded-sm border border-zinc-800 bg-zinc-950/40 p-5 transition-colors hover:border-zinc-700">
                    <div className="flex flex-col items-center gap-3">
                      <span className="font-mono text-sm font-bold tracking-widest text-yellow-500">
                        {step.num}
                      </span>
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-sm bg-zinc-900 text-zinc-300"
                        aria-hidden="true"
                      >
                        <Icon size={18} strokeWidth={2} />
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold text-zinc-100">{step.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{step.body}</p>
                    </div>
                  </li>
                </Reveal>
              );
            })}
          </ol>
        </div>
      </section>

      {/* ───────── Feature · Schedule ───────── */}
      <FeatureSection labelledBy="feature-schedule">
        <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
          <Reveal className="order-1">
            <FeatureCopy
              kicker="Feature · Schedule"
              headingId="feature-schedule"
              heading="The whole trip on one day-by-day timeline."
              body="Tee times, matchups, the welcome dinner, the post-round bar stop — stitched together so nobody has to ask “what time are we doing what.”"
              bullets={[
                'Tee times with matchups, pairings, and handicaps',
                'Flights, dinners, and shuttles live on the same timeline',
                'Day tabs to jump straight to today',
              ]}
              icon={Calendar}
            />
          </Reveal>

          <Reveal delay={0.15} className="order-2">
            <ScheduleMock />
          </Reveal>
        </div>
      </FeatureSection>

      {/* ───────── Feature · Scoreboard ───────── */}
      <FeatureSection labelledBy="feature-scoreboard">
        <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
          <Reveal className="order-1">
            <FeatureCopy
              kicker="Feature · Live scoring"
              headingId="feature-scoreboard"
              heading="The leaderboard that fits in your back pocket."
              body="Real match-play math. DORMIE, AS, 3&2, all of it. Handicap strokes auto-allocated to the hardest holes. Cup score on top, individual leaderboard below."
              bullets={[
                'Team total updates the second a hole is entered',
                'Net match-play scoring, even for 2v2 best ball',
                'Closeouts (3&2, 4&3) computed automatically',
              ]}
              icon={Trophy}
            />
          </Reveal>

          <Reveal delay={0.15} className="order-2">
            <ScoreboardMock />
          </Reveal>
        </div>
      </FeatureSection>

      {/* ───────── Feature · Feed ───────── */}
      <FeatureSection labelledBy="feature-feed">
        <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
          {/* Copy first on mobile, second on desktop */}
          <Reveal className="order-1 md:order-2">
            <FeatureCopy
              kicker="Feature · The feed"
              headingId="feature-feed"
              heading="Trash talk, photos, and receipts."
              body="A team chat built for the trip — not for productivity. Post brags, drop photos, react with whatever you want. Auto-moderated for the obvious stuff so admins don’t have to babysit."
              bullets={[
                'Hole-tagged photos and videos',
                'Emoji reactions on every post',
                'Becomes the source material for your post-trip recap',
              ]}
              icon={Flame}
            />
          </Reveal>

          <Reveal delay={0.15} className="order-2 md:order-1">
            <FeedMock />
          </Reveal>
        </div>
      </FeatureSection>

      {/* ───────── Feature · NBA Jam portraits ───────── */}
      <FeatureSection labelledBy="feature-portraits">
        <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
          <Reveal className="order-1">
            <FeatureCopy
              kicker="Feature · Arcade portraits"
              headingId="feature-portraits"
              heading="NBA Jam-style player portraits."
              body="Upload your photo. The AI hands back a 1994-NBA-Jam-digitizer version of you — pixelated, transparent background, ready to drop on a team-color matchup card. Used on every face-to-face matchup screen."
              bullets={[
                'Faithful to the source — same face, same hair, same hat',
                'Transparent PNG — composites cleanly over any team color',
                'Gold-frame roster cards with rating bars per player',
              ]}
              icon={Users}
            />
          </Reveal>

          <Reveal delay={0.15} className="order-2">
            <PortraitGridMock players={SHOWCASE_PLAYERS} />
          </Reveal>
        </div>
      </FeatureSection>

      {/* ───────── Closing CTA ───────── */}
      <section
        aria-labelledby="closing-cta"
        className="border-t border-zinc-900 py-24 sm:py-32"
      >
        <div className="mx-auto max-w-2xl px-4 text-center">
          <Reveal>
            <SectionKicker center>Ready to run yours?</SectionKicker>
            <h2
              id="closing-cta"
              className="mt-4 text-balance text-3xl font-bold tracking-tight text-zinc-100 sm:text-4xl"
            >
              Sign in and create your cup.
            </h2>
            <p className="mt-4 text-zinc-400">
              Built for buddy trips. Free while we figure it out.
            </p>
            <div className="mt-10 flex justify-center">
              <Link
                href="/sign-in"
                className="rounded-sm bg-yellow-500 px-7 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.4)] transition-colors hover:bg-yellow-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              >
                Sign in
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <Footer />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── */
/* Subcomponents (server, presentational)                            */
/* ──────────────────────────────────────────────────────────────── */

function SectionKicker({
  children,
  center,
}: {
  children: React.ReactNode;
  center?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 ${center ? 'justify-center' : ''}`}>
      <span className="h-px w-8 bg-yellow-600/60" aria-hidden="true" />
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.35em] text-yellow-500">
        {children}
      </p>
      <span className="h-px w-8 bg-yellow-600/60" aria-hidden="true" />
    </div>
  );
}

function FeatureSection({
  children,
  labelledBy,
}: {
  children: React.ReactNode;
  labelledBy: string;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className="border-t border-zinc-900 py-20 sm:py-28"
    >
      <div className="mx-auto max-w-5xl px-4">{children}</div>
    </section>
  );
}

type FeatureCopyProps = {
  kicker: string;
  headingId: string;
  heading: string;
  body: string;
  bullets: readonly string[];
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
};

function FeatureCopy({ kicker, headingId, heading, body, bullets, icon: Icon }: FeatureCopyProps) {
  return (
    <div>
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.35em] text-yellow-500">
        {kicker}
      </p>
      <h2
        id={headingId}
        className="mt-4 text-balance text-3xl font-bold tracking-tight text-zinc-100 sm:text-4xl"
      >
        {heading}
      </h2>
      <p className="mt-5 text-zinc-400">{body}</p>
      <ul className="mt-7 flex flex-col gap-3">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-3 text-sm text-zinc-300">
            <span
              className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-sm bg-zinc-900 text-yellow-500"
              aria-hidden="true"
            >
              <Icon size={13} strokeWidth={2.5} />
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScheduleMock() {
  return (
    <div
      role="img"
      aria-label="Schedule preview for Wednesday Aug 19: hotel check-in, three Round 1 matches at Pine Needles, and a welcome dinner"
      className="rounded-sm border border-zinc-800 bg-zinc-950/60 p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]"
    >
      <div className="flex items-center gap-3">
        <span className="h-px w-6 bg-yellow-600/60" aria-hidden="true" />
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-yellow-500">
          Itinerary
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {SCHEDULE_DAYS.map((d, i) => {
          const active = i === 0;
          return (
            <span
              key={d}
              className={`rounded-sm border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest ${
                active
                  ? 'border-yellow-500/60 bg-yellow-500/10 text-yellow-400'
                  : 'border-zinc-800 bg-zinc-900/60 text-zinc-500'
              }`}
            >
              {d}
            </span>
          );
        })}
      </div>

      <div className="mt-4 flex items-baseline gap-3">
        <p className="text-sm font-semibold text-zinc-100">Wednesday</p>
        <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Aug 19</p>
      </div>

      <ol className="mt-4 flex flex-col gap-3">
        {SCHEDULE.map((item, i) => (
          <li key={i} className="flex gap-3">
            <div className="w-16 flex-none pt-1">
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-300">
                {item.time}
              </p>
            </div>
            <div className="min-w-0 flex-1 rounded-sm border border-zinc-900 bg-black/40 p-3">
              {item.kind === 'event' ? (
                <ScheduleEventRow item={item} />
              ) : (
                <ScheduleMatchRow item={item} />
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ScheduleEventRow({
  item,
}: {
  item: Extract<ScheduleItem, { kind: 'event' }>;
}) {
  return (
    <div>
      <span className="inline-block rounded-sm border border-zinc-800 bg-zinc-900/80 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.25em] text-zinc-400">
        {item.badge}
      </span>
      <p className="mt-1.5 text-sm font-semibold text-zinc-100">{item.title}</p>
      <p className="text-xs text-zinc-500">{item.place}</p>
    </div>
  );
}

function ScheduleMatchRow({
  item,
}: {
  item: Extract<ScheduleItem, { kind: 'match' }>;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span
          className="inline-block rounded-sm border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.25em] text-yellow-400"
        >
          {item.badge}
        </span>
        <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          {item.course}
        </p>
      </div>
      <p className="mt-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
        {item.meta}
      </p>
      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <MatchSide side={item.home} align="right" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">vs</span>
        <MatchSide side={item.away} align="left" />
      </div>
    </div>
  );
}

function MatchSide({
  side,
  align,
}: {
  side: { color: string; players: SchedulePlayer[] };
  align: 'left' | 'right';
}) {
  return (
    <div className={align === 'right' ? 'text-right' : 'text-left'}>
      {side.players.map((p, i) => (
        <p key={p.name} className="leading-tight">
          <span className="text-sm font-semibold text-zinc-100">{p.name}</span>
          {p.hcp && (
            <span
              className="ml-1 font-mono text-[10px] tabular-nums"
              style={{ color: side.color }}
            >
              {p.hcp}
            </span>
          )}
          {i < side.players.length - 1 && (
            <span className="ml-1 text-zinc-600">&</span>
          )}
        </p>
      ))}
    </div>
  );
}

function ScoreboardMock() {
  return (
    <div
      role="img"
      aria-label="Cup standings preview: Hacks 8½, Chunkers 6½, with the top of the individual leaderboard"
      className="rounded-sm border border-zinc-800 bg-zinc-950/60 p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]"
    >
      <div className="flex items-center gap-3">
        <span className="h-px w-6 bg-yellow-600/60" aria-hidden="true" />
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-yellow-500">
          Cup standings
        </p>
      </div>
      <p className="mt-2 text-sm font-semibold text-zinc-200">Round 3 · Live</p>

      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
        <TeamBox name="Hacks" pts="8½" color={GREEN} align="right" />
        <div className="flex items-center justify-center px-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          vs
        </div>
        <TeamBox name="Chunkers" pts="6½" color={GOLD} align="left" />
      </div>

      <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        9 of 15 matches in the books · 6 pts left
      </p>

      <div className="mt-5 overflow-hidden rounded-sm border border-zinc-900">
        {LEADERBOARD.map((row, i) => (
          <div
            key={row.name}
            className={`flex items-center gap-3 px-3 py-2.5 ${
              i !== LEADERBOARD.length - 1 ? 'border-b border-zinc-900' : ''
            }`}
          >
            <span
              className="h-6 w-0.5 rounded-full"
              style={{ background: row.team === 'green' ? GREEN : GOLD }}
              aria-hidden="true"
            />
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              0{i + 1}
            </span>
            <span className="flex-1 text-sm text-zinc-200">{row.name}</span>
            <span
              className={`font-mono text-sm font-bold tabular-nums ${
                row.score.startsWith('-')
                  ? 'text-red-400'
                  : row.score.startsWith('+')
                    ? 'text-zinc-400'
                    : 'text-zinc-100'
              }`}
            >
              {row.score}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TeamBox({
  name,
  pts,
  color,
  align,
}: {
  name: string;
  pts: string;
  color: string;
  align: 'left' | 'right';
}) {
  return (
    <div
      className={`rounded-sm border border-zinc-900 bg-black/40 p-3 ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
      style={{
        boxShadow: `inset 0 0 0 1px ${color}22`,
      }}
    >
      <p
        className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em]"
        style={{ color }}
      >
        {name}
      </p>
      <p className="mt-1 font-mono text-3xl font-bold text-zinc-100">{pts}</p>
    </div>
  );
}

function FeedMock() {
  return (
    <div
      role="img"
      aria-label="Sample posts from the trip feed: a posted round score, plus three text posts with team-color stripes and emoji reactions"
      className="flex flex-col gap-3"
    >
      {FEED_POSTS.map((post, i) => (
        <div
          key={i}
          className="relative overflow-hidden rounded-sm border border-zinc-800 bg-zinc-950/60 p-4 pl-5"
        >
          <span
            className="absolute inset-y-0 left-0 w-1"
            style={{ background: post.color }}
            aria-hidden="true"
          />
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold text-zinc-100">
              {post.name}
              <span
                className="ml-2 font-mono text-[10px] uppercase tracking-widest"
                style={{ color: post.color }}
              >
                {post.team}
              </span>
            </p>
            <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
              {post.kind === 'score' ? 'posted a round' : 'just now'}
            </p>
          </div>

          {post.kind === 'text' ? (
            <p className="mt-2 text-sm leading-relaxed text-zinc-300">{post.body}</p>
          ) : (
            <div className="mt-3 rounded-sm border border-zinc-800 bg-black/40 p-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold text-zinc-200">{post.course}</p>
                <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                  {post.round}
                </p>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <ScoreSplit label="Front" value={post.front} />
                <ScoreSplit label="Back" value={post.back} />
                <ScoreSplit
                  label="Total"
                  value={post.total}
                  accent={post.vsPar}
                  accentColor={post.color}
                  emphasized
                />
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {post.reactions.map((r) => (
              <span
                key={r.emoji}
                className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900/80 px-2.5 py-1 text-xs text-zinc-300"
              >
                <span aria-hidden="true">{r.emoji}</span>
                <span className="font-mono text-[10px] tabular-nums text-zinc-400">{r.count}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScoreSplit({
  label,
  value,
  accent,
  accentColor,
  emphasized,
}: {
  label: string;
  value: number;
  accent?: string;
  accentColor?: string;
  emphasized?: boolean;
}) {
  return (
    <div className="rounded-sm border border-zinc-900 bg-zinc-950/60 px-2 py-2 text-center">
      <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-zinc-500">{label}</p>
      <p
        className={`mt-1 font-mono font-bold tabular-nums ${
          emphasized ? 'text-2xl text-zinc-100' : 'text-xl text-zinc-200'
        }`}
      >
        {value}
      </p>
      {accent && (
        <p
          className="font-mono text-[10px] font-bold tabular-nums"
          style={{ color: accentColor }}
        >
          {accent}
        </p>
      )}
    </div>
  );
}

function PortraitGridMock({ players }: { players: ShowcasePlayer[] }) {
  // Group the 4 players into two sides by team color. Two greens become the
  // left team, two golds become the right team. Keeps the showcase honest
  // even if a player swaps teams later — we just walk the live data.
  const byTeam = new Map<string, ShowcasePlayer[]>();
  for (const p of players) {
    const list = byTeam.get(p.teamColor) ?? [];
    list.push(p);
    byTeam.set(p.teamColor, list);
  }
  const sides = Array.from(byTeam.values()).slice(0, 2);
  if (sides.length < 2) return null;
  const [left, right] = sides;

  return (
    <div
      role="img"
      aria-label="NBA-Jam-style matchup card with both teams from the live Pinehurst trip"
    >
      <MatchupCardMock left={left} right={right} />
    </div>
  );
}

/**
 * Single matchup card showcase — mirrors the live MatchupShowdown from
 * /trips/[slug]/matches/[id]. Both teams in one gold-framed container,
 * portraits on top sharing a VS chip, names and handicap-rating bars in
 * the wood stat panel below.
 */
function MatchupCardMock({
  left,
  right,
}: {
  left: ShowcasePlayer[];
  right: ShowcasePlayer[];
}) {
  const leftColor = left[0]?.teamColor ?? GREEN;
  const rightColor = right[0]?.teamColor ?? GOLD;
  const leftTeam = left[0]?.teamName ?? 'Hacks';
  const rightTeam = right[0]?.teamName ?? 'Chunkers';

  return (
    <div
      className="overflow-hidden rounded-sm"
      style={{
        boxShadow:
          '0 0 0 3px #eab308, 0 0 0 5px #18181b, 0 0 24px rgba(202,138,4,0.25)',
      }}
    >
      {/* Team-name strip */}
      <div
        className="grid grid-cols-[1fr_auto_1fr] gap-2 px-3 py-1.5"
        style={{
          background:
            'linear-gradient(180deg, #1e1b4b 0%, #0f172a 100%)',
        }}
      >
        <p
          className="truncate text-center font-mono text-[10px] font-bold uppercase tracking-[0.25em]"
          style={{ color: leftColor, textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}
        >
          {leftTeam}
        </p>
        <span aria-hidden className="w-12" />
        <p
          className="truncate text-center font-mono text-[10px] font-bold uppercase tracking-[0.25em]"
          style={{ color: rightColor, textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}
        >
          {rightTeam}
        </p>
      </div>

      {/* TOP — portraits + center banner */}
      <div
        className="grid grid-cols-[1fr_auto_1fr] items-stretch border-t border-white/5"
        style={{
          background:
            'linear-gradient(180deg, #1e1b4b 0%, #0f172a 100%)',
        }}
      >
        <ShowcaseSide players={left} color={leftColor} align="left" />
        <div className="flex items-center justify-center px-2">
          <div
            className="flex h-12 w-14 items-center justify-center rounded-sm border-2 border-yellow-600"
            style={{
              background: 'linear-gradient(180deg, #ca8a04 0%, #a16207 100%)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.3), 0 0 8px rgba(0,0,0,0.6)',
            }}
          >
            <span
              className="font-mono text-base font-extrabold text-black"
              style={{ textShadow: '0 1px 0 rgba(255,255,255,0.3)' }}
            >
              VS
            </span>
          </div>
        </div>
        <ShowcaseSide players={right} color={rightColor} align="right" />
      </div>

      {/* BOTTOM — wood stat panel with names + rating bars */}
      <div
        className="grid grid-cols-[1fr_auto_1fr] gap-3 border-t-2 border-yellow-600 px-3 py-3"
        style={{
          background:
            'linear-gradient(180deg, #44322a 0%, #2a1f1a 60%, #1a120e 100%)',
        }}
      >
        <ShowcaseStats players={left} color={leftColor} align="left" />
        <div className="flex items-center px-1">
          <p
            className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-yellow-400"
            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
          >
            Rating
          </p>
        </div>
        <ShowcaseStats players={right} color={rightColor} align="right" />
      </div>
    </div>
  );
}

function ShowcaseSide({
  players,
  color,
  align,
}: {
  players: ShowcasePlayer[];
  color: string;
  align: 'left' | 'right';
}) {
  return (
    <div
      className="grid items-stretch gap-1 px-2 pt-3 pb-2"
      style={{
        gridTemplateColumns: `repeat(${players.length}, minmax(0, 1fr))`,
        background: `linear-gradient(${align === 'left' ? '90deg' : '270deg'}, ${color}55 0%, transparent 100%)`,
      }}
    >
      {players.map((p) => (
        <ShowcasePortrait key={p.nickname} player={p} color={color} />
      ))}
    </div>
  );
}

function ShowcasePortrait({
  player,
  color,
}: {
  player: ShowcasePlayer;
  color: string;
}) {
  // Every slot is the EXACT same square box (aspect-square w-full).
  // For arcade transparent PNGs, use object-cover with bottom anchoring so
  // each subject fills its box and stands on the same baseline — looks even
  // even when the AI generates one subject taller-in-frame than another.
  // Legacy opaque sean.png also uses cover so all four match.
  return (
    <div className="relative aspect-square w-full min-w-0 overflow-hidden">
      <Image
        src={player.src}
        alt={`${player.nickname} arcade portrait`}
        fill
        sizes="(min-width: 768px) 120px, 40vw"
        className="object-cover object-bottom"
        style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}
      />
      {/* CRT scanlines */}
      <div
        className="pointer-events-none absolute inset-0 opacity-25 mix-blend-overlay"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(0,0,0,0.55) 0px, rgba(0,0,0,0.55) 1px, transparent 1px, transparent 3px)',
        }}
        aria-hidden="true"
      />
    </div>
  );
}

function ShowcaseStats({
  players,
  color,
  align,
}: {
  players: ShowcasePlayer[];
  color: string;
  align: 'left' | 'right';
}) {
  return (
    <div
      className={`flex flex-col gap-2 ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      {players.map((p) => (
        <ShowcaseStatRow key={p.nickname} player={p} color={color} align={align} />
      ))}
    </div>
  );
}

function ShowcaseStatRow({
  player,
  color,
  align,
}: {
  player: ShowcasePlayer;
  color: string;
  align: 'left' | 'right';
}) {
  const pct = handicapToRating(player.handicap);
  return (
    <div>
      <p
        className="truncate font-mono text-[11px] font-bold uppercase tracking-widest text-yellow-300"
        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
      >
        {player.nickname.toUpperCase()}
        {player.handicap && (
          <span className="ml-1.5 font-mono text-[9px] tabular-nums text-yellow-300/60">
            {player.handicap}
          </span>
        )}
      </p>
      <div
        className="mt-1 h-2.5 overflow-hidden rounded-[1px] bg-black/60"
        style={{
          direction: align === 'right' ? 'rtl' : 'ltr',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.8)',
        }}
      >
        <div
          className="h-full"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color} 0%, ${color}cc 100%)`,
            boxShadow: `0 0 6px ${color}88`,
          }}
        />
      </div>
    </div>
  );
}

