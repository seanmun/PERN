import Link from 'next/link';

const TRIP_TZ = 'America/New_York';

export type EventFormDefaults = {
  type?: string;
  title?: string;
  description?: string | null;
  location?: string | null;
  address?: string | null;
  startTime?: Date | null;
  endTime?: Date | null;
};

export type EventFormProps = {
  action: (formData: FormData) => Promise<void>;
  defaults?: EventFormDefaults;
  hiddenFields?: Record<string, string>;
  submitLabel?: string;
  cancelHref?: string;
  deleteSlot?: React.ReactNode;
};

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'meal', label: 'Meal' },
  { value: 'social', label: 'Social' },
  { value: 'flight', label: 'Flight' },
  { value: 'shuttle', label: 'Shuttle' },
  { value: 'hotel_checkin', label: 'Hotel check-in' },
  { value: 'hotel_checkout', label: 'Hotel check-out' },
  { value: 'other', label: 'Other' },
];

function toWallTimeInput(d: Date | null | undefined): string {
  if (!d) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TRIP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  // Some en-CA outputs have hour "24" for midnight — coerce to "00".
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
}

export default function EventForm({
  action,
  defaults,
  hiddenFields,
  submitLabel = 'Save',
  cancelHref = '/schedule',
  deleteSlot,
}: EventFormProps) {
  return (
    <form action={action} className="space-y-5">
      {hiddenFields &&
        Object.entries(hiddenFields).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}

      <Field label="Title" required>
        <input
          type="text"
          name="title"
          required
          defaultValue={defaults?.title ?? ''}
          placeholder="Welcome dinner"
          className={inputCls}
        />
      </Field>

      <Field label="Type" required>
        <select
          name="type"
          required
          defaultValue={defaults?.type ?? 'meal'}
          className={inputCls}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Start" required hint="Local time at Pinehurst.">
          <input
            type="datetime-local"
            name="startTime"
            required
            defaultValue={toWallTimeInput(defaults?.startTime)}
            className={inputCls}
          />
        </Field>
        <Field label="End" hint="Optional.">
          <input
            type="datetime-local"
            name="endTime"
            defaultValue={toWallTimeInput(defaults?.endTime)}
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Location" hint="Human-readable name, e.g. “Pinehurst Resort.”">
        <input
          type="text"
          name="location"
          defaultValue={defaults?.location ?? ''}
          placeholder="Pinehurst Resort"
          className={inputCls}
        />
      </Field>

      <Field label="Address" hint="Used for the “Open in Maps” deep link.">
        <input
          type="text"
          name="address"
          defaultValue={defaults?.address ?? ''}
          placeholder="80 Carolina Vista Dr, Pinehurst, NC 28374"
          className={inputCls}
        />
      </Field>

      <Field label="Notes" hint="Optional.">
        <textarea
          name="description"
          defaultValue={defaults?.description ?? ''}
          rows={3}
          className={`${inputCls} resize-none`}
        />
      </Field>

      <div className="flex items-center gap-3 pt-4">
        <button
          type="submit"
          className="flex-1 rounded-sm bg-yellow-500 px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.3)] hover:bg-yellow-400"
        >
          {submitLabel}
        </button>
        <Link
          href={cancelHref}
          className="rounded-sm border border-zinc-700 px-6 py-3 font-mono text-xs font-semibold uppercase tracking-widest text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
        >
          Cancel
        </Link>
      </div>

      {deleteSlot}
    </form>
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
