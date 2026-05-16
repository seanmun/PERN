import { notFound, redirect } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { matches, rounds, courses } from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { getFeed } from '@/lib/data/feed';
import FeedClient from '@/components/feed/FeedClient';

export default async function FeedPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');

  const items = await getFeed(trip.id, { currentUserId: ctx.user.id });

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

  const isAdmin =
    isPlatformAdmin(ctx) || isTripAdminOf(ctx, trip.id);

  return (
    <FeedClient
      items={clientItems}
      canPost={true}
      matchOptions={matchOptions}
      isAdmin={isAdmin}
    />
  );
}
