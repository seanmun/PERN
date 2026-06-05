import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { eq, asc, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { tripMembers, teams, users } from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { updatePlayer } from '@/lib/actions/players';
import ImagePickerInput from '@/components/ImagePickerInput';
import PortraitGeneratorButton from '@/components/portraits/PortraitGeneratorButton';

export default async function EditPlayerPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');

  const [player] = await db
    .select()
    .from(tripMembers)
    .where(eq(tripMembers.id, id))
    .limit(1);

  if (!player) notFound();

  const canEdit =
    isPlatformAdmin(ctx) || isTripAdminOf(ctx, player.tripId);
  if (!canEdit) redirect(`/trips/${slug}/admin/players`);

  const teamsList = await db
    .select()
    .from(teams)
    .where(eq(teams.tripId, player.tripId))
    .orderBy(asc(teams.name));

  // The arcade portrait lives on `users`. Try by linked userId first; fall
  // back to email match for players who haven't claimed yet but might have
  // had a portrait pre-baked (we stub a users row when admin generates).
  let portraitUser:
    | { arcadePortraitUrl: string | null; avatarUrl: string | null }
    | null = null;
  if (player.userId) {
    const [u] = await db
      .select({
        arcadePortraitUrl: users.arcadePortraitUrl,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.id, player.userId))
      .limit(1);
    portraitUser = u ?? null;
  } else if (player.email) {
    const [u] = await db
      .select({
        arcadePortraitUrl: users.arcadePortraitUrl,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(sql`lower(${users.email}) = ${player.email.toLowerCase()}`)
      .limit(1);
    portraitUser = u ?? null;
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-6">
      <Link
        href={`/trips/${slug}/admin/players`}
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Players
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">{player.nickname}</h1>
      <p className="mt-1 text-xs text-zinc-500">
        Admin edit. Player can override their own avatar + handicap later.
      </p>

      <form action={updatePlayer} className="mt-8 space-y-5">
        <input type="hidden" name="id" value={player.id} />

        <div>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            Photo
          </span>
          <div className="mt-2">
            <ImagePickerInput
              name="avatarUrl"
              defaultValue={player.avatarUrl ?? undefined}
              aspect="1/1"
            />
          </div>
        </div>

        <Field label="Nickname" required>
          <input
            type="text"
            name="nickname"
            required
            defaultValue={player.nickname}
            className={inputCls}
          />
        </Field>

        <Field label="Email" required hint="Used for lazy-claim — they sign in with this email to claim their slot.">
          <input
            type="email"
            name="email"
            required
            defaultValue={player.email}
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Team">
            <select
              name="teamId"
              defaultValue={player.teamId ?? ''}
              className={inputCls}
            >
              <option value="">— None —</option>
              {teamsList.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Role">
            <select
              name="role"
              defaultValue={player.role}
              className={inputCls}
            >
              <option value="player">Player</option>
              <option value="trip_admin">Trip admin</option>
            </select>
          </Field>
        </div>

        <label className="flex items-center gap-3 rounded-sm border border-zinc-800 bg-zinc-950/40 px-3 py-3">
          <input
            type="checkbox"
            name="isCaptain"
            defaultChecked={player.isCaptain}
            className="h-4 w-4 accent-yellow-500"
          />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-zinc-200">
            Team captain
          </span>
        </label>

        <Field
          label="Trip handicap"
          hint="One decimal, e.g. 12.3. Drives stroke allocation for this trip."
        >
          <input
            type="text"
            name="tripHandicap"
            inputMode="decimal"
            defaultValue={player.tripHandicap ?? ''}
            placeholder="24.5"
            className={inputCls}
          />
        </Field>

        <Field
          label="Scouting report"
          hint="Captain-authored bio. Shown on profile pages."
        >
          <textarea
            name="scoutingReport"
            defaultValue={player.scoutingReport ?? ''}
            rows={3}
            placeholder="“Long drives, suspect putter.”"
            className={`${inputCls} resize-none`}
          />
        </Field>

        <div className="flex items-center gap-3 pt-4">
          <button
            type="submit"
            className="flex-1 rounded-sm bg-yellow-500 px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.3)] hover:bg-yellow-400"
          >
            Save player
          </button>
          <Link
            href={`/trips/${slug}/admin/players`}
            className="rounded-sm border border-zinc-700 px-6 py-3 font-mono text-xs font-semibold uppercase tracking-widest text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
          >
            Cancel
          </Link>
        </div>
      </form>

      {/* Arcade portrait — separate from the main form because it submits its
          own server action (a slow OpenAI call). Sits outside the player-save
          form so clicking Generate doesn't trigger Save Player. */}
      <section className="mt-10 rounded-sm border border-zinc-800 bg-zinc-950/40 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-yellow-500">
            Arcade portrait
          </span>
          <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
            NBA Jam style · AI
          </span>
        </div>
        <p className="mt-1 text-[11px] text-zinc-500">
          Turn {player.nickname}&apos;s photo into a 16-bit Sega arcade portrait.
          Used on matchup reveals and player profiles.
        </p>

        <div className="mt-4 grid grid-cols-[120px_1fr] items-start gap-4">
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
              {portraitUser?.arcadePortraitUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={portraitUser.arcadePortraitUrl}
                  alt={`${player.nickname}'s arcade portrait`}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-center font-mono text-[9px] uppercase tracking-widest text-zinc-600">
                  No portrait yet
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <PortraitGeneratorButton
                sourceUrl={player.avatarUrl ?? portraitUser?.avatarUrl ?? null}
                hasPortrait={!!portraitUser?.arcadePortraitUrl}
                redirectTo={`/trips/${slug}/admin/players/${player.id}/edit`}
                targetTripMemberId={player.id}
                targetLabel={`${player.nickname}'s`}
              />
              {!player.avatarUrl && !portraitUser?.avatarUrl && (
                <p className="text-[11px] text-zinc-500">
                  Upload a profile photo above and click Save Player first —
                  that&apos;s the source the AI uses.
                </p>
              )}
              <p className="text-[10px] text-zinc-600">
                Each generation takes 15–45 seconds.
                {!player.userId && (
                  <>
                    {' '}When {player.nickname} signs in, this portrait
                    automatically becomes theirs.
                  </>
                )}
              </p>
            </div>
          </div>
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
