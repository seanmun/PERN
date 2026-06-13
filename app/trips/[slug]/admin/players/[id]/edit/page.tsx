import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { eq, asc, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { tripMembers, teams, users } from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { updatePlayer } from '@/lib/actions/players';
import PhotoWithPortraitSection from '@/components/portraits/PhotoWithPortraitSection';

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
      .where(sql`lower(${users.email}) = ${player.email!.toLowerCase()}`)
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

        <PhotoWithPortraitSection
          photoName="avatarUrl"
          photoDefaultValue={player.avatarUrl ?? portraitUser?.avatarUrl ?? null}
          portraitUrl={portraitUser?.arcadePortraitUrl ?? null}
          redirectTo={`/trips/${slug}/admin/players/${player.id}/edit`}
          targetTripMemberId={player.id}
          targetLabel={`${player.nickname}'s`}
        />

        <Field label="Nickname" required>
          <input
            type="text"
            name="nickname"
            required
            defaultValue={player.nickname}
            className={inputCls}
          />
        </Field>

        <Field
          label="Email"
          hint="Leave blank for a shell player. Set the email so they can lazy-claim this slot on sign-in."
        >
          <input
            type="email"
            name="email"
            defaultValue={player.email ?? ''}
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

        <label className="flex items-center gap-3 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 px-3 py-3">
          <input
            type="checkbox"
            name="isCaptain"
            defaultChecked={player.isCaptain}
            className="h-4 w-4 accent-yellow-500"
          />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-zinc-800 dark:text-zinc-200">
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
        {required && <span className="ml-1 text-yellow-800 dark:text-yellow-500">*</span>}
      </span>
      {children}
      {hint && <p className="mt-1.5 text-[11px] text-zinc-500">{hint}</p>}
    </label>
  );
}
