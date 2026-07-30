import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { courses, courseFavorites, rounds, tripMembers } from '@/db/schema';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import { getBuddies } from '@/lib/data/buddies';
import EventSetupForm from '@/components/setup/EventSetupForm';

export const metadata: Metadata = {
  title: 'Set up an event · BuddyCup',
};

/**
 * Single-page event setup for a one-course event (a matchup or an outing).
 *
 * Replaces the eight-screen wizard: course, players, game, lineup, all on
 * one page with one submit. Nothing is written until the button is
 * pressed, which is what makes the "queued save died on navigation" bug
 * class impossible here.
 *
 * Multi-round trips still use /trips/new — they genuinely need a
 * different shape (several rounds, several courses, several days).
 */
export default async function NewEventPage() {
  const ctx = await getGlobalAuthContext();
  if (!ctx) redirect('/sign-in?redirect_url=/trips/new/event');

  const [list, favorites, playedRows, buddies] = await Promise.all([
    db.select().from(courses).orderBy(asc(courses.name)),
    db
      .select({ courseId: courseFavorites.courseId })
      .from(courseFavorites)
      .where(eq(courseFavorites.userId, ctx.user.id)),
    db
      .selectDistinct({ courseId: rounds.courseId })
      .from(rounds)
      .innerJoin(tripMembers, eq(tripMembers.tripId, rounds.tripId))
      .where(eq(tripMembers.userId, ctx.user.id)),
    getBuddies(ctx.user.id),
  ]);

  const favoriteIds = new Set(favorites.map((f) => f.courseId));
  const playedIds = new Set(playedRows.map((p) => p.courseId));

  // Favourites first, then courses you've played, then the rest — the
  // course you want is nearly always one you've been to.
  const courseRows = list
    .map((c) => ({
      id: c.id,
      name: c.name,
      location: c.location,
      isFavorite: favoriteIds.has(c.id),
      played: playedIds.has(c.id),
    }))
    .sort((a, b) => {
      const rank = (r: typeof a) => (r.isFavorite ? 0 : r.played ? 1 : 2);
      const byRank = rank(a) - rank(b);
      return byRank !== 0 ? byRank : a.name.localeCompare(b.name);
    });

  const email = ctx.user.email.toLowerCase();

  return (
    <div className="pb-24">
      <div className="mx-auto max-w-2xl px-4 pt-6">
        <h1 className="text-2xl font-bold tracking-tight">Set up an event</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          One course, one day. Pick the course, the players and the game —
          teams and groups fill themselves in.
        </p>

        <EventSetupForm
          courses={courseRows}
          buddies={buddies.map((b) => ({
            userId: b.userId,
            email: b.email,
            nickname: b.recentNickname || b.displayName || b.email.split('@')[0],
            handicap: b.recentHandicap,
            playedTogether: b.matchesPlayedTogether,
          }))}
          me={{
            userId: ctx.user.id,
            email,
            nickname:
              ctx.user.displayName ?? ctx.user.fullName ?? email.split('@')[0],
            handicap: ctx.user.handicap ?? null,
          }}
        />
      </div>
    </div>
  );
}
