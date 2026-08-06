import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { AlertTriangle, ArrowLeft, Check, Download } from 'lucide-react';
import { db } from '@/db/client';
import { courseHoles, courseTees, courses, rounds } from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { canEditTrip } from '@/lib/auth/permissions';
import { updateTeeRating } from '@/lib/actions/courses';
import { enrichCourseFromGolfCourseApi } from '@/lib/actions/course-import';
import {
  gcaDisplayName,
  gcaLocationLine,
  isGolfCourseApiEnabled,
  searchGolfCourses,
} from '@/lib/golfcourseapi/client';

export const metadata: Metadata = {
  title: 'Course ratings · BuddyCup',
};

/**
 * Slope and rating for every tee this trip plays.
 *
 * Without them the course-handicap leaderboard has nothing to convert
 * with and silently falls back to the raw trip handicap — which is what
 * was happening to five of Pinehurst's seven rounds. The numbers were
 * always fixable; `updateTeeRating` has existed and been correct the
 * whole time. What was missing was a screen that called it, because the
 * course-library routes went with the §10 kill list.
 *
 * This is that screen, scoped deliberately tight: only the courses this
 * trip actually plays, only the field that is blocking scoring. It is not
 * the course library — that is still owed — and it does not pretend to
 * be.
 *
 * Plain form actions, no client component: each tee posts to the same
 * server action the admin screens used to.
 */
export default async function CourseRatingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lookup?: string; q?: string; filled?: string; unmatched?: string }>;
}) {
  const { slug } = await params;
  const { lookup, q, filled, unmatched } = await searchParams;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect(`/sign-in?redirect_url=/trips/${slug}/courses`);
  if (!canEditTrip(ctx, trip.id)) redirect(`/trips/${slug}/schedule`);

  const roundRows = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.tripId, trip.id), eq(rounds.isHidden, false)))
    .orderBy(asc(rounds.order));

  const courseIds = Array.from(new Set(roundRows.map((r) => r.courseId)));
  const [courseRows, teeRows, holeRows] = courseIds.length
    ? await Promise.all([
        db.select().from(courses).where(inArray(courses.id, courseIds)),
        db
          .select()
          .from(courseTees)
          .where(inArray(courseTees.courseId, courseIds))
          .orderBy(asc(courseTees.displayOrder)),
        db.select().from(courseHoles).where(inArray(courseHoles.courseId, courseIds)),
      ])
    : [[], [], []];

  const parOf = (courseId: string): number | null => {
    const hs = holeRows.filter((h) => h.courseId === courseId);
    return hs.length ? hs.reduce((sum, h) => sum + h.par, 0) : null;
  };

  /** The tee a round actually plays: its explicit pick, else the default. */
  const teeForRound = (r: (typeof roundRows)[number]) =>
    teeRows.find((t) => t.id === r.courseTeeId) ??
    teeRows.find((t) => t.courseId === r.courseId && t.isDefault) ??
    null;

  const unrated = roundRows.filter((r) => {
    const tee = teeForRound(r);
    return !(tee?.slope != null && tee?.rating != null && parOf(r.courseId) != null);
  });

  const courseUsage = new Map<string, string[]>();
  for (const r of roundRows) {
    const label = r.label ?? `Round ${r.order}`;
    courseUsage.set(r.courseId, [...(courseUsage.get(r.courseId) ?? []), label]);
  }

  const playedTeeIds = new Set(
    roundRows.map((r) => teeForRound(r)?.id).filter((x): x is string => !!x),
  );

  // The API lookup runs for ONE course, only when the admin asks — the free
  // tier is 50 requests/day, so nothing here is speculative.
  const apiEnabled = isGolfCourseApiEnabled();
  const lookupCourse = lookup ? courseRows.find((c) => c.id === lookup) : null;
  // Our course names and the API's rarely agree — ours say "Pinehurst
  // No. 4", the API files it as club "Pinehurst Cc" / course "No. 4" — so
  // the stored name is only the STARTING query, not the whole search.
  const query = (q ?? lookupCourse?.name ?? '').trim();
  let candidates: { id: string; name: string; location: string | null; tees: string[] }[] = [];
  let lookupError: string | null = null;
  if (lookupCourse && apiEnabled && query.length >= 3) {
    try {
      const found = await searchGolfCourses(query);
      candidates = found.slice(0, 14).map((c) => ({
        id: c.id,
        name: gcaDisplayName(c),
        location: gcaLocationLine(c),
        tees: [...(c.tees?.male ?? []), ...(c.tees?.female ?? [])]
          .filter((t) => t.slope_rating != null && t.course_rating != null)
          .map((t) => `${t.tee_name ?? '?'} ${t.slope_rating}/${t.course_rating}`),
      }));
    } catch (err) {
      lookupError = err instanceof Error ? err.message : 'Course API lookup failed';
    }
  }

  return (
    <div className="pb-24">
      <div className="mx-auto max-w-2xl px-4 pt-6">
        <Link
          href={`/trips/${slug}/schedule`}
          className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500 hover:text-yellow-500"
        >
          <ArrowLeft size={12} strokeWidth={2.5} />
          Back to schedule
        </Link>

        <h1 className="mt-4 text-2xl font-bold tracking-tight">Course ratings</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Slope and rating for every tee this trip plays. The course-handicap
          leaderboard needs both; without them it falls back to raw trip
          handicaps.
        </p>

        {(filled != null || unmatched != null) && (
          <p
            className={`mt-4 rounded-sm border p-3 text-[12px] ${
              Number(filled ?? 0) > 0
                ? 'border-emerald-600/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
                : 'border-yellow-600/40 bg-yellow-500/5 text-yellow-900 dark:text-yellow-300'
            }`}
          >
            {Number(filled ?? 0) > 0
              ? `Filled ${filled} tee(s) from the course API.`
              : 'Nothing was filled — no tee names matched.'}
            {Number(unmatched ?? 0) > 0 &&
              ` ${unmatched} tee(s) had no match in that record — type those in below.`}
          </p>
        )}

        {unrated.length > 0 ? (
          <div className="mt-4 rounded-sm border border-yellow-600/40 bg-yellow-500/5 p-3">
            <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-yellow-800 dark:text-yellow-300">
              <AlertTriangle size={12} />
              {unrated.length} of {roundRows.length} rounds are falling back
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {unrated.map((r) => (
                <li key={r.id} className="text-[12px] text-yellow-900 dark:text-yellow-300">
                  {r.label ?? `Round ${r.order}`} —{' '}
                  {teeForRound(r)
                    ? `${teeForRound(r)!.name} tee has no ${
                        teeForRound(r)!.slope == null ? 'slope' : ''
                      }${
                        teeForRound(r)!.slope == null && teeForRound(r)!.rating == null
                          ? '/'
                          : ''
                      }${teeForRound(r)!.rating == null ? 'rating' : ''}`
                    : 'no tee set on this course'}
                  {parOf(r.courseId) == null && ' · no hole data for par'}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-4 flex items-center gap-1.5 rounded-sm border border-emerald-600/40 bg-emerald-500/5 p-3 font-mono text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            <Check size={12} />
            Every round can produce a true course handicap
          </p>
        )}

        <div className="mt-6 space-y-4">
          {courseRows.map((c) => {
            const tees = teeRows.filter((t) => t.courseId === c.id);
            const par = parOf(c.id);
            return (
              <section
                key={c.id}
                className="rounded-sm border border-zinc-300 dark:border-zinc-800"
              >
                <div className="px-4 py-3">
                  <p className="text-sm font-bold">{c.name}</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    {(courseUsage.get(c.id) ?? []).join(' · ')}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    {par != null ? `par ${par}` : 'NO HOLE DATA — par unknown'}
                  </p>
                </div>

                {apiEnabled && (
                  <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-900">
                    {lookupCourse?.id === c.id ? (
                      <>
                        <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                          Search the course API
                        </p>
                        {/* Broad beats exact: "Pinehurst" finds all nine
                            Pinehurst Cc courses, "Pinehurst No. 4" finds
                            none of them. */}
                        <form method="get" className="mt-1.5 flex gap-2">
                          <input type="hidden" name="lookup" value={c.id} />
                          <input
                            name="q"
                            defaultValue={query}
                            placeholder="Try just the club name, e.g. Pinehurst"
                            className="min-w-0 flex-1 rounded-sm border border-zinc-300 bg-white px-2.5 py-2 text-sm focus:border-yellow-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950"
                          />
                          <button
                            type="submit"
                            className="shrink-0 rounded-sm border border-zinc-400 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                          >
                            Search
                          </button>
                        </form>
                        {lookupError && (
                          <p className="mt-1.5 text-[12px] text-red-600 dark:text-red-400">
                            {lookupError}
                          </p>
                        )}
                        {!lookupError && candidates.length === 0 && (
                          <p className="mt-1.5 text-[12px] text-zinc-500">
                            No results for “{query}”. Try a shorter query (the
                            club name alone), or type the slope and rating in
                            below.
                          </p>
                        )}
                        <ul className="mt-1.5 space-y-1">
                          {candidates.map((cand) => (
                            <li key={cand.id}>
                              <form action={enrichCourseFromGolfCourseApi}>
                                <input type="hidden" name="tripId" value={trip.id} />
                                <input type="hidden" name="courseId" value={c.id} />
                                <input type="hidden" name="apiCourseId" value={cand.id} />
                                <button
                                  type="submit"
                                  className="w-full rounded-sm border border-zinc-300 px-2.5 py-2 text-left hover:border-yellow-600/60 hover:bg-yellow-500/5 dark:border-zinc-800"
                                >
                                  <span className="block text-[13px] font-semibold">
                                    {cand.name}
                                  </span>
                                  {cand.location && (
                                    <span className="block text-[11px] text-zinc-500">
                                      {cand.location}
                                    </span>
                                  )}
                                  <span className="mt-0.5 block font-mono text-[10px] text-zinc-500">
                                    {cand.tees.length
                                      ? `${cand.tees.length} rated tee(s): ${cand.tees.slice(0, 4).join(' · ')}`
                                      : 'no rated tees in this record'}
                                  </span>
                                </button>
                              </form>
                            </li>
                          ))}
                        </ul>
                        <Link
                          href={`/trips/${slug}/courses`}
                          className="mt-2 inline-block font-mono text-[10px] uppercase tracking-widest text-zinc-500 hover:text-yellow-500"
                        >
                          Close
                        </Link>
                      </>
                    ) : (
                      <Link
                        href={`/trips/${slug}/courses?lookup=${c.id}`}
                        className="inline-flex items-center gap-1.5 rounded-sm border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-yellow-800 hover:bg-yellow-500/20 dark:text-yellow-300"
                      >
                        <Download size={12} strokeWidth={2.5} />
                        Get slope + rating from course API
                      </Link>
                    )}
                  </div>
                )}

                <div className="border-t border-zinc-200 dark:border-zinc-900">
                  {tees.length === 0 ? (
                    <p className="px-4 py-3 text-[12px] text-zinc-500">
                      This course has no tees. Rounds on it cannot produce a
                      course handicap.
                    </p>
                  ) : (
                    tees.map((t) => {
                      const rated = t.slope != null && t.rating != null;
                      const inPlay = playedTeeIds.has(t.id);
                      return (
                        <form
                          key={t.id}
                          action={updateTeeRating}
                          className={`flex flex-wrap items-end gap-2 border-b border-zinc-200 px-4 py-3 last:border-0 dark:border-zinc-900 ${
                            inPlay && !rated ? 'bg-yellow-500/5' : ''
                          }`}
                        >
                          <input type="hidden" name="tripId" value={trip.id} />
                          <input type="hidden" name="courseId" value={c.id} />
                          <input type="hidden" name="teeId" value={t.id} />

                          <div className="min-w-[7rem] flex-1">
                            <p className="text-[13px] font-semibold">
                              {t.name}
                              {t.isDefault && (
                                <span className="ml-1.5 font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                                  default
                                </span>
                              )}
                            </p>
                            {inPlay && (
                              <p className="font-mono text-[9px] uppercase tracking-widest text-yellow-800 dark:text-yellow-400">
                                played this trip
                              </p>
                            )}
                          </div>

                          <label className="block">
                            <span className="block font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                              Slope
                            </span>
                            <input
                              name="slope"
                              defaultValue={t.slope ?? ''}
                              inputMode="numeric"
                              placeholder="130"
                              className="mt-0.5 w-20 rounded-sm border border-zinc-300 bg-white px-2 py-1.5 text-center font-mono text-sm tabular-nums focus:border-yellow-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950"
                            />
                          </label>

                          <label className="block">
                            <span className="block font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                              Rating
                            </span>
                            <input
                              name="rating"
                              defaultValue={t.rating ?? ''}
                              inputMode="decimal"
                              placeholder="72.5"
                              className="mt-0.5 w-20 rounded-sm border border-zinc-300 bg-white px-2 py-1.5 text-center font-mono text-sm tabular-nums focus:border-yellow-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950"
                            />
                          </label>

                          <button
                            type="submit"
                            className="rounded-sm border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-yellow-800 hover:bg-yellow-500/20 dark:text-yellow-300"
                          >
                            Save
                          </button>
                        </form>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <p className="mt-6 text-[11px] text-zinc-500">
          Slope 55–200, rating 50–100. Blank clears the value. These are course
          facts, shared across every trip that plays the course.
        </p>
      </div>
    </div>
  );
}
