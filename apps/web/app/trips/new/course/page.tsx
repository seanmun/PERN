import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { courses, courseFavorites, rounds, tripMembers } from '@/db/schema';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import { isGolfCourseApiEnabled } from '@/lib/golfcourseapi/client';
import WizardShell from '@/components/admin/EventWizard/WizardShell';
import CourseStep from '@/components/admin/EventWizard/CourseStep';

export const metadata: Metadata = {
  title: 'New event · Course · BuddyCup',
};

const COPY = {
  outing: {
    title: 'Where are you playing?',
    body: 'The course is the one constant of an outing — set it first. Everything else can change later.',
  },
  match: {
    title: 'Where are you playing?',
    body: 'The course is the one constant of a match — set it first. Everything else can change later.',
  },
} as const;

export default async function NewEventCoursePage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const ctx = await getGlobalAuthContext();
  if (!ctx) redirect('/sign-in?redirect_url=/trips/new');

  const { kind } = await searchParams;
  // Trips set up courses later (multi-course, admin-driven); only the
  // single-day kinds front-load the course.
  if (kind !== 'outing' && kind !== 'match') redirect('/trips/new');

  const [list, favorites, playedRows] = await Promise.all([
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

  const copy = COPY[kind];

  return (
    <div className="pb-24">
      <WizardShell active="course" kind={kind} />
      <div className="mx-auto max-w-xl px-4 pt-6">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-800 dark:text-yellow-500">
          Step 2
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{copy.title}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{copy.body}</p>

        <CourseStep kind={kind} rows={rows} dbEnabled={isGolfCourseApiEnabled()} />
      </div>
    </div>
  );
}
