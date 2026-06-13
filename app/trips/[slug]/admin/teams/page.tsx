import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/db/client';
import { teams } from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { updateTeam } from '@/lib/actions/teams';
import TeamColorPicker from '@/components/admin/TeamColorPicker';

export default async function AdminTeamsPage({
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

  const teamsList = await db
    .select()
    .from(teams)
    .where(eq(teams.tripId, trip.id))
    .orderBy(asc(teams.name));

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-6">
      <Link
        href={`/trips/${slug}/admin`}
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Admin
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">Teams</h1>
      <p className="mt-1 text-xs text-zinc-500">
        Rename and recolor the two teams competing for this cup.
      </p>

      <div className="mt-8 space-y-6">
        {teamsList.map((t) => (
          <form
            key={t.id}
            action={updateTeam}
            className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-4"
          >
            <input type="hidden" name="id" value={t.id} />

            <div className="flex items-center gap-3">
              {t.color && (
                <span
                  className="inline-block h-6 w-6 shrink-0 rounded-sm border border-zinc-400 dark:border-zinc-700"
                  style={{ background: t.color }}
                  aria-hidden="true"
                />
              )}
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
                Team
              </p>
            </div>

            <label className="mt-4 block">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                Name <span className="text-yellow-500">*</span>
              </span>
              <input
                type="text"
                name="name"
                required
                maxLength={40}
                defaultValue={t.name}
                className={inputCls}
              />
            </label>

            <div className="mt-4">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                Color
              </span>
              <div className="mt-2">
                <TeamColorPicker name="color" defaultValue={t.color ?? '#71717a'} />
              </div>
            </div>

            <button
              type="submit"
              className="mt-5 w-full rounded-sm bg-yellow-500 px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-yellow-400"
            >
              Save team
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}

const inputCls =
  'mt-2 block w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2.5 text-base text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-600 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500';
