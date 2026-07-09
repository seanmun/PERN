import { notFound, redirect } from 'next/navigation';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { updateTrip } from '@/lib/actions/trips';
import ImagePickerInput from '@/components/ImagePickerInput';
import WizardShell from '@/components/admin/EventWizard/WizardShell';

/**
 * Details tab of the event-settings surface — the post-creation
 * counterpart to /trips/new/details. The old /admin/details page
 * redirects here so there's exactly one form.
 */
export default async function SetupDetailsPage({
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
    redirect(`/trips/${slug}/schedule`);
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
    <div className="pb-24">
      <WizardShell active="details" tripSlug={slug} />
      <div className="mx-auto max-w-xl px-4 pt-6">
        <h1 className="text-2xl font-bold tracking-tight">Details.</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Name, dates, kind, icon, and trip-wide defaults.
        </p>

        <form action={updateTrip} className="mt-6 space-y-5">
          <input type="hidden" name="id" value={trip.id} />

          <Field label="Event name" required>
            <input
              type="text"
              name="name"
              required
              maxLength={120}
              defaultValue={trip.name}
              className={inputCls}
            />
          </Field>

          <Field
            label="Kind"
            hint="Trip = multi-day cup with day tabs. Outing / Match = single day, live board on the cup tab. Changing this only changes how the cup tab renders — no data is touched."
          >
            <select name="kind" defaultValue={trip.kind} className={inputCls}>
              <option value="trip">Trip — multi-day</option>
              <option value="outing">Outing — one day, multiple groups</option>
              <option value="match">Match — one group, one round</option>
            </select>
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

          <Field
            label="Default handicaps"
            hint="Pre-selected for every new match on this trip. You can still override per match in the builder."
          >
            <select
              name="defaultHandicapMethod"
              defaultValue={trip.defaultHandicapMethod}
              className={inputCls}
            >
              <option value="group_low">Off group low — lowest in the foursome plays scratch</option>
              <option value="match_low">Off match low — lowest in the match plays scratch</option>
              <option value="course">Course handicap — everyone gets full strokes (slope-adjusted)</option>
            </select>
          </Field>

          <div>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
              Event icon
            </span>
            <p className="mt-1 mb-3 text-[11px] text-zinc-500">
              Shown on your trip list and the trip header. Square crops best.
            </p>
            <ImagePickerInput
              name="imageUrl"
              defaultValue={trip.imageUrl ?? undefined}
              aspect="1/1"
              previewMaxWidth={112}
            />
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-zinc-200 dark:border-zinc-900 pt-6">
            <button
              type="submit"
              className="rounded-sm bg-yellow-500 px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.3)] hover:bg-yellow-400"
            >
              Save details
            </button>
            <a
              href={`/trips/${slug}/setup/players`}
              className="font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500 hover:text-zinc-300"
            >
              Players →
            </a>
          </div>
        </form>
      </div>
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
