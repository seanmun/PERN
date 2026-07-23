import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/db/client';
import { courses, courseFavorites, rounds, tripMembers } from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import CourseLibraryList from '@/components/admin/CourseLibraryList';

export default async function AdminCoursesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');

  const canEdit = isPlatformAdmin(ctx) || isTripAdminOf(ctx, trip.id);
  if (!canEdit) redirect(`/trips/${slug}/admin`);

  const [list, favorites, playedRows] = await Promise.all([
    db.select().from(courses).orderBy(asc(courses.name)),
    db
      .select({ courseId: courseFavorites.courseId })
      .from(courseFavorites)
      .where(eq(courseFavorites.userId, ctx.user.id)),
    // "Played" = the course has a round on any trip this user is a member of.
    db
      .selectDistinct({ courseId: rounds.courseId })
      .from(rounds)
      .innerJoin(tripMembers, eq(tripMembers.tripId, rounds.tripId))
      .where(eq(tripMembers.userId, ctx.user.id)),
  ]);

  const favoriteIds = new Set(favorites.map((f) => f.courseId));
  const playedIds = new Set(playedRows.map((p) => p.courseId));

  const rows = list.map((c) => ({
    id: c.id,
    name: c.name,
    location: c.location,
    imageUrl: c.imageUrl,
    latitude: c.latitude,
    longitude: c.longitude,
    isFavorite: favoriteIds.has(c.id),
    played: playedIds.has(c.id),
  }));

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <Link
        href={`/trips/${slug}/admin`}
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Admin
      </Link>

      <div className="mt-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Courses</h1>
          <p className="mt-1 text-xs text-zinc-500">
            Star favorites, see courses you&rsquo;ve played, and sort by distance.
          </p>
        </div>
        <Link
          href={`/trips/${slug}/admin/courses/new`}
          className="shrink-0 rounded-sm border border-yellow-500/40 bg-yellow-500/10 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-yellow-800 dark:text-yellow-300 hover:bg-yellow-500/20"
        >
          + New
        </Link>
      </div>

      <CourseLibraryList rows={rows} slug={slug} />
    </div>
  );
}
