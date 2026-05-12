import { redirect } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { trips, matches, rounds, courses } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/current-user';
import { getFeed } from '@/lib/data/feed';
import FeedClient from '@/components/feed/FeedClient';

export default async function FeedPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/sign-in');

  const [trip] = await db
    .select()
    .from(trips)
    .where(eq(trips.slug, 'pinehurst-cup-2026'))
    .limit(1);

  if (!trip) {
    return (
      <div className="mx-auto max-w-md px-4 pt-16">
        <p className="text-zinc-400">Trip not found.</p>
      </div>
    );
  }

  const items = await getFeed(trip.id);

  // Match options for the composer's match tag dropdown.
  const matchRows = await db
    .select({ match: matches, round: rounds, course: courses })
    .from(matches)
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .innerJoin(courses, eq(rounds.courseId, courses.id))
    .where(eq(rounds.tripId, trip.id))
    .orderBy(asc(rounds.order));

  const matchOptions = matchRows.map((r) => ({
    id: r.match.id,
    label: `R${r.round.order} · ${r.course.name}`,
  }));

  // Serialize Date → string for the client component.
  const clientItems = items.map((i) => ({ ...i, at: i.at.toISOString() }));

  return (
    <FeedClient
      items={clientItems}
      canPost={true}
      matchOptions={matchOptions}
    />
  );
}
