import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { eq, asc, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { tripMembers, teams, users } from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { updatePlayerField, deletePlayer } from '@/lib/actions/players';
import PhotoWithPortraitSection from '@/components/portraits/PhotoWithPortraitSection';
import {
  InlineText,
  InlineChips,
  InlineCheckbox,
} from '@/components/admin/InlineRoundCard';

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

      <div className="mt-8">
        <PhotoWithPortraitSection
          photoName="avatarUrl"
          photoDefaultValue={player.avatarUrl ?? portraitUser?.avatarUrl ?? null}
          portraitUrl={portraitUser?.arcadePortraitUrl ?? null}
          redirectTo={`/trips/${slug}/admin/players/${player.id}/edit`}
          targetTripMemberId={player.id}
          targetLabel={`${player.nickname}'s`}
        />
      </div>

      {/* Inline-edit card — every field auto-saves on blur / Enter. */}
      <section className="mt-6 space-y-4 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-4">
        <Row label="Nickname">
          <InlineText
            action={updatePlayerField}
            hidden={{ id: player.id }}
            field="nickname"
            value={player.nickname}
            placeholder="Add nickname…"
          />
        </Row>

        <Row label="Email" hint="Leave blank for a shell player. Set the email so they can lazy-claim this slot on sign-in.">
          <InlineText
            action={updatePlayerField}
            hidden={{ id: player.id }}
            field="email"
            value={player.email}
            placeholder="player@example.com"
          />
        </Row>

        <Row label="Team">
          <InlineChips
            action={updatePlayerField}
            hidden={{ id: player.id }}
            field="teamId"
            value={player.teamId}
            allowEmpty
            emptyLabel="— None —"
            options={teamsList.map((t) => ({ value: t.id, label: t.name }))}
          />
        </Row>

        <Row label="Role">
          <InlineChips
            action={updatePlayerField}
            hidden={{ id: player.id }}
            field="role"
            value={player.role}
            options={[
              { value: 'player', label: 'Player' },
              { value: 'trip_admin', label: 'Trip admin' },
              { value: 'viewer', label: 'Viewer' },
            ]}
          />
        </Row>

        <InlineCheckbox
          action={updatePlayerField}
          hidden={{ id: player.id }}
          field="isCaptain"
          checked={player.isCaptain}
          label="Team captain"
        />

        <Row label="Trip handicap" hint="One decimal, e.g. 12.3. Drives stroke allocation for this trip.">
          <InlineText
            action={updatePlayerField}
            hidden={{ id: player.id }}
            field="tripHandicap"
            value={player.tripHandicap}
            placeholder="24.5"
          />
        </Row>

        <Row label="Scouting report" hint="Captain-authored bio. Shown on profile pages.">
          <InlineText
            action={updatePlayerField}
            hidden={{ id: player.id }}
            field="scoutingReport"
            value={player.scoutingReport}
            placeholder="“Long drives, suspect putter.”"
          />
        </Row>
      </section>

      <section className="mt-12 rounded-sm border border-red-500/30 bg-red-500/5 p-4">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-red-700 dark:text-red-400">
          Danger zone
        </p>
        <p className="mt-1.5 text-[12px] text-zinc-700 dark:text-zinc-300">
          Removing a player wipes their match + foursome assignments. Blocked if
          they already have hole scores entered (to protect history).
        </p>
        <form action={deletePlayer} className="mt-3">
          <input type="hidden" name="id" value={player.id} />
          <button
            type="submit"
            className="rounded-sm border border-red-500/50 bg-red-500/10 px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-red-700 dark:text-red-300 hover:bg-red-500/20"
          >
            Remove player
          </button>
        </form>
      </section>

    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
        {label}
      </p>
      {children}
      {hint && <p className="mt-1 text-[11px] text-zinc-500">{hint}</p>}
    </div>
  );
}
