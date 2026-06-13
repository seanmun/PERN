import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import Footer from '@/components/marketing/Footer';

export const metadata: Metadata = {
  title: 'About · BuddyCup',
  description:
    'How to set up an event on BuddyCup and what every round format actually means in plain English.',
};

const SETUP_STEPS: { num: string; title: string; body: string }[] = [
  {
    num: '01',
    title: 'Start something new',
    body:
      'From Home, hit Trip, Outing, or Match (see Event types below for which to pick). You become the trip admin automatically — you can add other admins later.',
  },
  {
    num: '02',
    title: 'Fill in the basics',
    body:
      'Name, date (multi-day for a Trip, single-day for an Outing or Match), and the two team names + colors. Defaults are fine if you want to rename later.',
  },
  {
    num: '03',
    title: 'Add the players',
    body:
      'Admin → Players → Add player. You can add by email (the player gets a one-click invite) or as a "shell" player without an email — useful when someone hasn\'t confirmed yet.',
  },
  {
    num: '04',
    title: 'Add the course',
    body:
      'Admin → Courses → New course. Either upload a scorecard photo (the AI extracts par, yardage, and stroke index for all 18 holes) or fill them in by hand.',
  },
  {
    num: '05',
    title: 'Create a round',
    body:
      'Admin → Rounds → New round. Pick the course, the tee, the date, and a default match format. A Trip can have many rounds (one per day); an Outing has one; a Match has one.',
  },
  {
    num: '06',
    title: 'Add tee times (groups)',
    body:
      'Inside the round, add a tee time for each foursome. Each tee time is a physical group playing together — one tee time per group, even if you have multiple matches stacked within it.',
  },
  {
    num: '07',
    title: 'Create the matchups',
    body:
      'Inside each tee time, hit Add matchup. Pick the format and the players. To stack a Singles side bet on top of a 2v2 Best Ball, just hit Add another matchup in the same group with different players.',
  },
  {
    num: '08',
    title: 'Send invites',
    body:
      'Back on Admin → Players, hit Invite next to each player. They get a single email with a one-click sign-in. New users get an account created on click; returning users go straight in.',
  },
  {
    num: '09',
    title: 'On the day, score',
    body:
      'From Schedule, every group has a yellow Enter Scores button. Tap it (visible to participants and admins). Enter hole-by-hole with +/− or the Par button. Status updates live everywhere.',
  },
  {
    num: '10',
    title: 'Watch the Cup tab',
    body:
      'Each match win = 1 point, halve = 0.5 each. Trip standings accumulate across rounds; Outing standings show the live field. A muted team-color gradient leans toward whichever side is up — the more they\'re winning by, the further it leans.',
  },
];

const EVENT_KINDS: { name: string; oneLine: string; body: string }[] = [
  {
    name: 'Trip',
    oneLine: 'Multi-day, multi-round, team Cup format. The Pinehurst.',
    body:
      'Use when you and your buddies are away for 2+ days and playing more than one round. Cup standings accumulate across every round you mark "Counts toward Cup." Friendly rounds are tracked but don\'t affect points.',
  },
  {
    name: 'Outing',
    oneLine: 'Single day, multiple groups, one course.',
    body:
      'Charity scramble, league event, anything with multiple foursomes playing the same day on the same course. The Cup tab shows a live board with every foursome\'s status, gradients and all.',
  },
  {
    name: 'Match',
    oneLine: 'One foursome, one round, fastest setup.',
    body:
      'You and three buddies just want to keep score on a Sunday. No Cup standings — the Cup tab goes straight to the match. Minimal setup.',
  },
];

const FORMATS: {
  name: string;
  oneLine: string;
  who: string;
  scoring: string;
  handicap: string;
  whenToUse: string;
}[] = [
  {
    name: 'Best Ball (Four-Ball)',
    oneLine: 'Each player plays their own ball; team takes the lower net per hole.',
    who: '2 vs 2',
    scoring:
      'Match play. Each player plays out the hole as normal. The team\'s score on a hole is whichever partner had the lower net. Compare team-to-team hole-by-hole.',
    handicap:
      'Each player gets strokes based on their own handicap relative to the lowest handicap in the match. The "scratch" floats with the field.',
    whenToUse:
      'The default for casual 2v2 match play. Easy on weaker partners — one good hole carries the team.',
  },
  {
    name: 'Two-Man Aggregate',
    oneLine: 'Each player plays their own ball; team SUMS both nets.',
    who: '2 vs 2',
    scoring:
      'Match play. Both partners must score on a hole or it doesn\'t count yet. Team\'s hole score = sum of both partners\' net scores. Compare team-to-team hole-by-hole.',
    handicap:
      'Same as Best Ball — each player\'s own strokes vs the match low.',
    whenToUse:
      'When you want both players to actually contribute. One bad hole from a partner is real now — no hiding.',
  },
  {
    name: 'Singles',
    oneLine: 'One vs one.',
    who: '1 vs 1',
    scoring:
      'Match play. Each player plays their own ball, lower net wins each hole.',
    handicap: 'The higher-handicap player gets strokes vs the lower.',
    whenToUse:
      'Side bets, head-to-head bragging rights. Often stacked on top of a 2v2 in the same foursome.',
  },
  {
    name: 'Scramble',
    oneLine: 'One team ball. Everyone hits, take the best shot, all play from there.',
    who: '2 or 4 per team',
    scoring:
      'Match play. Team enters one gross per hole (the team\'s best ball). Compare team-to-team. Each foursome only enters their own team\'s line in the score-entry UI.',
    handicap:
      '2-person: 35% of low + 15% of high. 4-person: 25/20/15/10% sorted low to high. The team gets a single handicap allocated across the hardest holes.',
    whenToUse:
      'Charity outings, mixed-skill groups, fast play. Everyone gets to swing, weaker players don\'t feel exposed.',
  },
  {
    name: 'Alternate Shot (Foursomes)',
    oneLine: 'One team ball. Players alternate strokes.',
    who: '2 per team (only)',
    scoring:
      'Match play. One player tees off odd holes, the other tees off even. After the tee shot, they alternate strokes until the hole is done. Team enters one gross per hole.',
    handicap: '50% of the combined handicaps.',
    whenToUse:
      'Ryder Cup classic. Most punishing format on a mismatched pair — your bad shot becomes your partner\'s problem.',
  },
];

export default function AboutPage() {
  return (
    <>
      <article className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
        <Link
          href="/"
          className="group inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500 transition-colors hover:text-yellow-400"
        >
          <ArrowLeft
            size={12}
            strokeWidth={2.5}
            className="transition-transform group-hover:-translate-x-0.5"
            aria-hidden="true"
          />
          Back to home
        </Link>

        <header className="mt-8">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.35em] text-yellow-800 dark:text-yellow-500">
            About
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-5xl">
            How BuddyCup works.
          </h1>
          <p className="mt-5 text-zinc-600 dark:text-zinc-400">
            Setup, formats, and the rules of the road — in plain English. If
            you&rsquo;re not a tournament-grade golfer, start at the top.
          </p>
        </header>

        {/* ───────────────── Setup ───────────────── */}
        <section className="mt-16">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.35em] text-yellow-800 dark:text-yellow-500">
            Set up an event
          </h2>
          <p className="mt-3 text-zinc-600 dark:text-zinc-400">
            Ten steps from logged-in to live scoring. You can do it in under
            ten minutes once you know the path.
          </p>

          <ol className="mt-8 space-y-5">
            {SETUP_STEPS.map((step) => (
              <li
                key={step.num}
                className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-4 sm:p-5"
              >
                <div className="flex items-start gap-4">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-yellow-800 dark:text-yellow-500">
                    {step.num}
                  </p>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">{step.title}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                      {step.body}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ───────────────── Event types ───────────────── */}
        <section className="mt-16">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.35em] text-yellow-800 dark:text-yellow-500">
            Event types
          </h2>
          <p className="mt-3 text-zinc-600 dark:text-zinc-400">
            Pick the right one at the start — it sets the defaults and shapes
            the Cup tab.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {EVENT_KINDS.map((k) => (
              <div
                key={k.name}
                className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-4"
              >
                <p
                  className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-yellow-800 dark:text-yellow-500"
                >
                  {k.name}
                </p>
                <p className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {k.oneLine}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {k.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ───────────────── Round formats ───────────────── */}
        <section className="mt-16">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.35em] text-yellow-800 dark:text-yellow-500">
            Round &amp; match formats
          </h2>
          <p className="mt-3 text-zinc-600 dark:text-zinc-400">
            Every match in a round has a format. Most foursomes pick one. Some
            stack two or three at once (see Side matches below).
          </p>

          <div className="mt-8 space-y-5">
            {FORMATS.map((f) => (
              <div
                key={f.name}
                className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-4 sm:p-5"
              >
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-yellow-800 dark:text-yellow-500">
                  {f.name}
                </p>
                <p className="mt-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {f.oneLine}
                </p>

                <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[120px_1fr]">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
                    Who plays
                  </dt>
                  <dd className="text-zinc-800 dark:text-zinc-200">{f.who}</dd>

                  <dt className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
                    Scoring
                  </dt>
                  <dd className="leading-relaxed text-zinc-700 dark:text-zinc-300">{f.scoring}</dd>

                  <dt className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
                    Handicap
                  </dt>
                  <dd className="leading-relaxed text-zinc-700 dark:text-zinc-300">{f.handicap}</dd>

                  <dt className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
                    Best for
                  </dt>
                  <dd className="leading-relaxed text-zinc-700 dark:text-zinc-300">
                    {f.whenToUse}
                  </dd>
                </dl>
              </div>
            ))}
          </div>
        </section>

        {/* ───────────────── Stacked matches ───────────────── */}
        <section className="mt-16">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.35em] text-yellow-800 dark:text-yellow-500">
            Side matches (stacking)
          </h2>
          <p className="mt-3 text-zinc-600 dark:text-zinc-400">
            One foursome can be scoring against more than one match at the
            same time. The classic move: a 2v2 Best Ball as the main game,
            with a 1v1 Singles side bet between two of the players.
          </p>

          <div className="mt-6 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-4 sm:p-5">
            <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              All players in the foursome only play one physical ball each.
              When you enter a score for any one player, BuddyCup fans it out
              to every match that player is in for that group — the side bet
              updates the same instant the main match does. You only have to
              enter the score once.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              To add a side match: open the round, hit Add another matchup on
              the same tee time, pick the side-bet players and format.
            </p>
          </div>
        </section>

        {/* ───────────────── How scoring is shown ───────────────── */}
        <section className="mt-16">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.35em] text-yellow-800 dark:text-yellow-500">
            How scoring shows up
          </h2>
          <p className="mt-3 text-zinc-600 dark:text-zinc-400">
            Two surfaces: team standings (Cup points) and the individual
            leaderboard.
          </p>

          <div className="mt-6 space-y-3">
            <div className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-4 sm:p-5">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-yellow-800 dark:text-yellow-500">
                Team Cup points
              </p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                Every completed match awards <strong>1 point</strong> to the
                winning team. A halved match (tied through 18) awards
                <strong> 0.5 to each team</strong>. Only matches in rounds
                marked &ldquo;Counts toward Cup&rdquo; contribute. Friendly
                rounds are tracked but don&rsquo;t affect the score.
              </p>
            </div>

            <div className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-4 sm:p-5">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-yellow-800 dark:text-yellow-500">
                Individual leaderboard
              </p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                <strong>Net vs par</strong> using the strokes you actually
                receive in your match (not your absolute handicap allocation
                against the course). If you&rsquo;re the lowest handicap in
                your match, you play scratch and get zero strokes — even on
                the hardest holes. If your match&rsquo;s low is much better
                than you, you get strokes accordingly.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                The right column shows <strong>+N strokes</strong> — how
                many strokes you&rsquo;ve actually received across the holes
                you&rsquo;ve played. Once scoring starts that replaces the
                hcp label.
              </p>
            </div>

            <div className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-4 sm:p-5">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-yellow-800 dark:text-yellow-500">
                Live status (the leaning gradient)
              </p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                On the Cup tab during play, every match row gets a muted
                team-color gradient behind it. Even at the start; leans
                further as one side pulls ahead; fully one color when a side
                is 10 holes UP (essentially closed out). It&rsquo;s the at-a-
                glance read of who&rsquo;s winning what across the whole
                field.
              </p>
            </div>
          </div>
        </section>

        <p className="mt-16 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-600">
          That&rsquo;s the whole app.
        </p>
      </article>

      <Footer />
    </>
  );
}
