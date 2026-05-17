import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { createCourse } from '@/lib/actions/courses';
import ImagePickerInput from '@/components/ImagePickerInput';

export default async function NewCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { slug } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');

  if (!isPlatformAdmin(ctx) && !isTripAdminOf(ctx, trip.id)) {
    redirect(`/trips/${slug}/admin`);
  }

  const { redirectTo } = await searchParams;

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-6">
      <Link
        href={`/trips/${slug}/admin/courses`}
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Courses
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">New course</h1>
      <p className="mt-1 text-xs text-zinc-500">
        Adds a course to the trip catalog so it can be picked when creating rounds.
      </p>

      <form action={createCourse} className="mt-8 space-y-5">
        <input type="hidden" name="tripId" value={trip.id} />
        {redirectTo && (
          <input type="hidden" name="redirectTo" value={redirectTo} />
        )}

        <Field label="Name" required>
          <input
            type="text"
            name="name"
            required
            placeholder="Pinehurst No. 6"
            className={inputCls}
          />
        </Field>

        <Field label="Location">
          <input
            type="text"
            name="location"
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
            placeholder="80 Carolina Vista Dr, Pinehurst, NC 28374"
            className={inputCls}
          />
        </Field>

        <Field label="Total par">
          <input
            type="number"
            name="totalPar"
            placeholder="72"
            min={50}
            max={90}
            className={inputCls}
          />
        </Field>

        <div>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            Landscape image
          </span>
          <p className="mt-1 mb-3 text-[11px] text-zinc-500">
            Optional — used as the match-detail background.
          </p>
          <ImagePickerInput name="imageUrl" />
        </div>

        <div>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            Scorecard image
          </span>
          <p className="mt-1 mb-3 text-[11px] text-zinc-500">
            Upload a clear photo of the back-of-card or official scorecard PDF page.
            When you save, AI will read the 18 holes (par, yardage, stroke index) and
            populate the hole table automatically. You can edit any value afterwards.
          </p>
          <ImagePickerInput name="scorecardImageUrl" aspect="4/3" />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="flex-1 rounded-sm bg-yellow-500 px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.3)] hover:bg-yellow-400"
          >
            Create course
          </button>
          <Link
            href={`/trips/${slug}/admin/courses`}
            className="rounded-sm border border-zinc-700 px-6 py-3 font-mono text-xs font-semibold uppercase tracking-widest text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  'mt-2 block w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500';

function Field({
  label,
  children,
  required,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
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
