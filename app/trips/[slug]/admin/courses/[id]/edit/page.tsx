import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { asc, eq, inArray } from 'drizzle-orm';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { db } from '@/db/client';
import {
  courses,
  courseHoles,
  courseTees,
  courseTeeYardages,
} from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { setDefaultTee, updateCourse } from '@/lib/actions/courses';
import ImagePickerInput from '@/components/ImagePickerInput';
import CourseHolesEditor from '@/components/admin/CourseHolesEditor';
import ExtractScorecardButton from '@/components/admin/ExtractScorecardButton';

export default async function EditCoursePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');

  const canEdit = isPlatformAdmin(ctx) || isTripAdminOf(ctx, trip.id);
  if (!canEdit) redirect('/');

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, id))
    .limit(1);

  if (!course) notFound();

  const holes = await db
    .select()
    .from(courseHoles)
    .where(eq(courseHoles.courseId, course.id))
    .orderBy(asc(courseHoles.holeNumber));

  const teesRows = await db
    .select()
    .from(courseTees)
    .where(eq(courseTees.courseId, course.id))
    .orderBy(asc(courseTees.displayOrder));

  const teeYardageRows = teesRows.length
    ? await db
        .select()
        .from(courseTeeYardages)
        .where(
          inArray(
            courseTeeYardages.courseTeeId,
            teesRows.map((t) => t.id),
          ),
        )
    : [];

  const yardagesByTee = new Map<string, Map<number, number>>();
  for (const t of teesRows) yardagesByTee.set(t.id, new Map());
  for (const y of teeYardageRows) {
    yardagesByTee.get(y.courseTeeId)?.set(y.holeNumber, y.yardage);
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-6">
      <Link
        href={`/trips/${slug}/admin/courses`}
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Courses
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">{course.name}</h1>
      <p className="mt-1 text-xs text-zinc-500">{course.location}</p>

      <form action={updateCourse} className="mt-6 space-y-5">
        <input type="hidden" name="id" value={course.id} />
        <input type="hidden" name="tripId" value={trip.id} />

        <Field label="Name" required>
          <input
            type="text"
            name="name"
            required
            defaultValue={course.name}
            className={inputCls}
          />
        </Field>

        <Field label="Location">
          <input
            type="text"
            name="location"
            defaultValue={course.location ?? ''}
            placeholder="Pinehurst, NC"
            className={inputCls}
          />
        </Field>

        <Field
          label="Address"
          hint="Street address. Used for the &ldquo;Open in Maps&rdquo; deep link on match detail."
        >
          <input
            type="text"
            name="address"
            defaultValue={course.address ?? ''}
            placeholder="80 Carolina Vista Dr, Pinehurst, NC 28374"
            className={inputCls}
          />
        </Field>

        <div>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            Landscape image
          </span>
          <p className="mt-1 mb-3 text-[11px] text-zinc-500">
            Used as the background on match detail pages. Upload a file, or paste a URL.
          </p>
          <ImagePickerInput name="imageUrl" defaultValue={course.imageUrl ?? undefined} />
        </div>

        <div>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            Scorecard image
          </span>
          <p className="mt-1 mb-3 text-[11px] text-zinc-500">
            Upload a photo of the back-of-card or scorecard PDF. Save first,
            then run AI extraction below to populate the 18 holes.
          </p>
          <ImagePickerInput
            name="scorecardImageUrl"
            defaultValue={course.scorecardImageUrl ?? undefined}
            aspect="4/3"
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="flex-1 rounded-sm bg-yellow-500 px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.3)] hover:bg-yellow-400"
          >
            Save course
          </button>
          <Link
            href={`/trips/${slug}/admin/courses`}
            className="rounded-sm border border-zinc-400 dark:border-zinc-700 px-6 py-3 font-mono text-xs font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-200"
          >
            Cancel
          </Link>
        </div>
      </form>

      {/* Holes section — outside the main form so the extraction button
          posts its own server action without triggering Save Course. */}
      <section className="mt-12">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-zinc-500">
            Holes ({holes.length}/18)
          </p>
          {course.scorecardExtractedAt && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-400">
              <Sparkles className="inline" size={10} /> Extracted
            </span>
          )}
        </div>

        {course.scorecardImageUrl ? (
          <div className="mt-3 space-y-3">
            <ExtractScorecardButton
              courseId={course.id}
              alreadyExtracted={!!course.scorecardExtractedAt}
              tripId={trip.id}
            />
            <p className="text-[11px] text-zinc-500">
              Takes 15–45 seconds. The model reads par, yardage, and stroke
              index for all 18 holes and writes them below. You can edit any
              cell afterwards.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">
            Upload a scorecard image above first, then come back to extract.
          </p>
        )}

        {holes.length > 0 && (
          <CourseHolesEditor
            tripId={trip.id}
            holes={holes.map((h) => ({
              id: h.id,
              holeNumber: h.holeNumber,
              par: h.par,
              yardage: h.yardage,
              handicapIndex: h.handicapIndex,
            }))}
          />
        )}
      </section>

      {/* Tees — one row per tee box on the scorecard. Per-hole yardages live
          in courseTeeYardages, displayed in a horizontally scrollable matrix
          so all tees can be compared side by side. */}
      {teesRows.length > 0 && (
        <section className="mt-12">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-zinc-500">
            Tees ({teesRows.length})
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            Default tee&apos;s yardages are used in score entry unless a round
            overrides them.
          </p>

          <div className="mt-4 space-y-3">
            {teesRows.map((t) => (
              <div
                key={t.id}
                className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {t.color && (
                        <span
                          aria-hidden
                          className="inline-block h-3 w-3 rounded-full border border-zinc-400 dark:border-zinc-700"
                          style={{ background: t.color }}
                        />
                      )}
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t.name}</p>
                      {t.isDefault && (
                        <span className="rounded-sm border border-yellow-500/40 bg-yellow-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-yellow-300">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                      {[
                        t.rating ? `${t.rating} rating` : null,
                        t.slope != null ? `slope ${t.slope}` : null,
                        t.totalYardage != null ? `${t.totalYardage} yds` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </p>
                  </div>
                  {!t.isDefault && (
                    <form action={setDefaultTee}>
                      <input type="hidden" name="tripId" value={trip.id} />
                      <input type="hidden" name="courseId" value={course.id} />
                      <input type="hidden" name="teeId" value={t.id} />
                      <button
                        type="submit"
                        className="shrink-0 rounded-sm border border-zinc-400 dark:border-zinc-700 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-700 dark:text-zinc-300 hover:border-yellow-500/40 hover:text-yellow-400"
                      >
                        Make default
                      </button>
                    </form>
                  )}
                </div>

                <div className="mt-3 overflow-x-auto">
                  <div className="inline-grid grid-cols-[20px_repeat(18,minmax(40px,1fr))] gap-x-1 font-mono text-[10px] tabular-nums text-zinc-600 dark:text-zinc-400">
                    <span className="text-right text-zinc-600">#</span>
                    {Array.from({ length: 18 }, (_, i) => (
                      <span key={`h-${i}`} className="text-right text-zinc-600">
                        {i + 1}
                      </span>
                    ))}
                    <span className="text-right text-zinc-500">Yd</span>
                    {Array.from({ length: 18 }, (_, i) => {
                      const y = yardagesByTee.get(t.id)?.get(i + 1);
                      return (
                        <span key={`y-${i}`} className="text-right">
                          {y ?? '—'}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const inputCls =
  'mt-2 block w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2.5 text-base text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-600 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500';

function Field({
  label,
  children,
  hint,
  required,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
        {label}
        {required && <span className="ml-1 text-yellow-500">*</span>}
      </span>
      {children}
      {hint && <p className="mt-1.5 text-[11px] text-zinc-500">{hint}</p>}
    </label>
  );
}
