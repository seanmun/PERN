import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { db } from '@/db/client';
import { courses, courseHoles } from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { updateCourse } from '@/lib/actions/courses';
import ImagePickerInput from '@/components/ImagePickerInput';
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
            className="rounded-sm border border-zinc-700 px-6 py-3 font-mono text-xs font-semibold uppercase tracking-widest text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
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
          <div className="mt-6 overflow-hidden rounded-sm border border-zinc-800">
            <div className="grid grid-cols-[32px_1fr_1fr_1fr] gap-2 border-b border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              <span>#</span>
              <span className="text-right">Par</span>
              <span className="text-right">Yards</span>
              <span className="text-right">SI</span>
            </div>
            {holes.map((h) => (
              <div
                key={h.id}
                className="grid grid-cols-[32px_1fr_1fr_1fr] gap-2 border-b border-zinc-900 px-3 py-1.5 font-mono text-xs tabular-nums last:border-b-0"
              >
                <span className="text-yellow-400">{h.holeNumber}</span>
                <span className="text-right text-zinc-200">{h.par}</span>
                <span className="text-right text-zinc-500">
                  {h.yardage ?? '—'}
                </span>
                <span className="text-right text-zinc-500">
                  {h.handicapIndex}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const inputCls =
  'mt-2 block w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500';

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
