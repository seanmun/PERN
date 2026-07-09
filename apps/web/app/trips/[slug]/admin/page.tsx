import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, ImageIcon, Settings, Trophy, Users } from 'lucide-react';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin } from '@/lib/auth/permissions';
import ComingSoon from '@/components/ComingSoon';

export default async function AdminPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');

  const isAdmin =
    isPlatformAdmin(ctx) || ctx.tripMember?.role === 'trip_admin';

  if (!isAdmin) {
    return (
      <ComingSoon
        title="Admin"
        description="You don't have admin access to this trip."
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-800 dark:text-yellow-500">
        Admin
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Trip controls</h1>

      <div className="mt-8 space-y-3">
        <AdminLink
          href={`/trips/${slug}/setup/details`}
          icon={<Settings size={16} />}
          label="Event settings"
          hint="Details, players, teams, groups, matches — the tabbed setup surface."
        />
        <AdminLink
          href={`/trips/${slug}/admin/players`}
          icon={<Users size={16} />}
          label="Players (deep edit)"
          hint="Photos, handicaps, captains, scouting reports, invites."
        />
        <AdminLink
          href={`/trips/${slug}/admin/rounds`}
          icon={<Trophy size={16} />}
          label="Rounds (deep edit)"
          hint="Per-round labels, tees, recompute, delete."
        />
        <AdminLink
          href={`/trips/${slug}/admin/courses`}
          icon={<ImageIcon size={16} />}
          label="Courses"
          hint="Shared course library — holes, tees, slope/rating, photos."
        />
      </div>
    </div>
  );
}

function AdminLink({
  href,
  icon,
  label,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-4 hover:border-yellow-500/40 hover:bg-zinc-100 dark:hover:bg-zinc-900/40"
    >
      <span className="text-yellow-800 dark:text-yellow-500">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
      </div>
      <ChevronRight size={14} className="text-zinc-600" />
    </Link>
  );
}
