import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { updateTrip } from '@/lib/actions/trips';
import ImagePickerInput from '@/components/ImagePickerInput';

export default async function AdminTripDetailsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');

  if (!isPlatformAdmin(ctx) && !isTripAdminOf(ctx, trip.id)) {
    redirect(`/trips/${slug}/admin`);
  }

  const fmtDate = (d: Date | null): string => {
    if (!d) return '';
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'America/New_York',
    }).format(d);
  };

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-6">
      <Link
        href={`/trips/${slug}/admin`}
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Admin
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">Trip details</h1>
      <p className="mt-1 text-xs text-zinc-500">
        Name, dates, description, and the trip icon.
      </p>

      <form action={updateTrip} className="mt-8 space-y-5">
        <input type="hidden" name="id" value={trip.id} />

        <Field label="Trip name" required>
          <input
            type="text"
            name="name"
            required
            maxLength={120}
            defaultValue={trip.name}
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date">
            <input
              type="date"
              name="startDate"
              defaultValue={fmtDate(trip.startDate)}
              className={inputCls}
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              name="endDate"
              defaultValue={fmtDate(trip.endDate)}
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Description">
          <textarea
            name="description"
            rows={3}
            maxLength={500}
            defaultValue={trip.description ?? ''}
            placeholder="One sentence about the trip. Optional."
            className={`${inputCls} resize-y`}
          />
        </Field>

        <div>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            Trip icon
          </span>
          <p className="mt-1 mb-3 text-[11px] text-zinc-500">
            Shown on your trip list and the trip header. Square crops best.
          </p>
          <ImagePickerInput
            name="imageUrl"
            defaultValue={trip.imageUrl ?? undefined}
            aspect="1/1"
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="flex-1 rounded-sm bg-yellow-500 px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.3)] hover:bg-yellow-400"
          >
            Save trip
          </button>
          <Link
            href={`/trips/${slug}/admin`}
            className="rounded-sm border border-zinc-400 dark:border-zinc-700 px-6 py-3 font-mono text-xs font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-200"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  'mt-2 block w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2.5 text-base text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-600 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500';

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
        {required && <span className="ml-1 text-yellow-800 dark:text-yellow-500">*</span>}
      </span>
      {children}
      {hint && <p className="mt-1.5 text-[11px] text-zinc-500">{hint}</p>}
    </label>
  );
}
