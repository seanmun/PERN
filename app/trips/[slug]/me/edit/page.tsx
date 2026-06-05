import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { updateMyProfile } from '@/lib/actions/update-profile';
import ImagePickerInput from '@/components/ImagePickerInput';
import PortraitGeneratorButton from '@/components/portraits/PortraitGeneratorButton';

export default async function EditProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) {
    redirect('/sign-in');
  }

  if (!ctx.tripMember) {
    redirect(`/trips/${slug}/me`);
  }

  const { user, tripMember } = ctx;

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-10">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-500">
        Edit profile
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">
        {tripMember.nickname}
      </h1>
      <p className="mt-1 text-xs text-zinc-500">
        Nickname, team, and captain status are set by the trip admin.
      </p>

      <form action={updateMyProfile} className="mt-8 space-y-6">
        <div>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            Profile photo
          </span>
          <div className="mt-2">
            <ImagePickerInput
              name="avatarUrl"
              defaultValue={tripMember.avatarUrl ?? undefined}
              aspect="1/1"
            />
          </div>
        </div>

        <ArcadePortraitSection
          portraitUrl={user.arcadePortraitUrl ?? null}
          sourceUrl={tripMember.avatarUrl ?? user.avatarUrl ?? null}
          redirectTo={`/trips/${slug}/me/edit`}
        />

        <Field
          label="Full name"
          name="fullName"
          defaultValue={user.fullName ?? ''}
          placeholder="Sean Munley"
        />
        <Field
          label="Trip handicap"
          name="tripHandicap"
          defaultValue={tripMember.tripHandicap ?? ''}
          placeholder="24.5"
          inputMode="decimal"
          hint="One decimal, e.g. 12.3. This drives stroke allocation for this trip."
        />
        <Field
          label="GHIN number"
          name="ghinNumber"
          defaultValue={user.ghinNumber ?? ''}
          placeholder="0000000"
          hint="Optional. Used later for handicap verification."
        />

        <fieldset className="space-y-4 rounded-sm border border-zinc-800 bg-zinc-950/40 p-4">
          <legend className="px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-yellow-500">
            Flights
          </legend>
          <p className="-mt-2 text-[11px] text-zinc-500">
            Shared on the Flights page so everyone can coordinate.
          </p>

          <Field
            label="Arrival time"
            name="flightArrivalAt"
            type="datetime-local"
            defaultValue={toWallTimeInput(tripMember.flightArrivalAt)}
            hint="Local at Pinehurst."
          />
          <Field
            label="Arrival details"
            name="flightArrivalDetails"
            defaultValue={tripMember.flightArrivalDetails ?? ''}
            placeholder="AA 123 from JFK → RDU"
          />
          <Field
            label="Departure time"
            name="flightDepartureAt"
            type="datetime-local"
            defaultValue={toWallTimeInput(tripMember.flightDepartureAt)}
          />
          <Field
            label="Departure details"
            name="flightDepartureDetails"
            defaultValue={tripMember.flightDepartureDetails ?? ''}
            placeholder="AA 456 RDU → JFK"
          />
        </fieldset>

        <div className="flex items-center gap-3 pt-4">
          <button
            type="submit"
            className="flex-1 rounded-sm bg-yellow-500 px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.3)] hover:bg-yellow-400"
          >
            Save
          </button>
          <Link
            href={`/trips/${slug}/me`}
            className="rounded-sm border border-zinc-700 px-6 py-3 font-mono text-xs font-semibold uppercase tracking-widest text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  hint,
  inputMode,
  type = 'text',
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  hint?: string;
  inputMode?: 'text' | 'decimal' | 'numeric' | 'email' | 'tel' | 'url';
  type?: string;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
        {label}
      </span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        inputMode={inputMode}
        className="mt-2 block w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
      />
      {hint && <p className="mt-1.5 text-[11px] text-zinc-500">{hint}</p>}
    </label>
  );
}

function ArcadePortraitSection({
  portraitUrl,
  sourceUrl,
  redirectTo,
}: {
  portraitUrl: string | null;
  sourceUrl: string | null;
  redirectTo: string;
}) {
  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-yellow-500">
          Arcade portrait
        </span>
        <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
          NBA Jam style · AI
        </span>
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">
        We take your profile photo and turn it into a 16-bit Sega arcade
        portrait used on matchup reveals and player profiles.
      </p>

      <div className="mt-4 grid grid-cols-[120px_1fr] items-start gap-4">
        {/* Checkered backdrop so the alpha channel is visible at a glance —
            otherwise a transparent portrait reads as if it has a black bg. */}
        <div
          className="aspect-square overflow-hidden rounded-sm border border-zinc-800"
          style={{
            backgroundImage:
              'linear-gradient(45deg, rgba(255,255,255,0.04) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.04) 75%), linear-gradient(45deg, rgba(255,255,255,0.04) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.04) 75%)',
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 8px 8px',
            backgroundColor: '#0a0a0a',
          }}
        >
          {portraitUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={portraitUrl} alt="Your arcade portrait" className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-center font-mono text-[9px] uppercase tracking-widest text-zinc-600">
              No portrait yet
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {!sourceUrl && (
            <p className="text-[11px] text-zinc-500">
              Upload a profile photo above first — that&apos;s the source the
              AI uses to make your portrait.
            </p>
          )}
          <PortraitGeneratorButton
            sourceUrl={sourceUrl}
            hasPortrait={!!portraitUrl}
            redirectTo={redirectTo}
          />
          <p className="text-[10px] text-zinc-600">
            Each generation takes 15–45 seconds. You can regenerate as many
            times as you want.
          </p>
        </div>
      </div>
    </div>
  );
}

const TRIP_TZ = 'America/New_York';

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
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
}
