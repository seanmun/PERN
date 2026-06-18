import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/db/client';
import { teams } from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import NewPlayerForm from '@/components/admin/NewPlayerForm';

export default async function NewPlayerPage({
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
    redirect(`/trips/${slug}/admin/players`);
  }

  const teamsList = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.tripId, trip.id))
    .orderBy(asc(teams.name));

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-6">
      <Link
        href={`/trips/${slug}/admin/players`}
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Players
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">Add player</h1>
      <p className="mt-1 text-xs text-zinc-500">
        Search for an existing platform user, type an email to invite someone
        new, or skip the email entirely for a shell player.
      </p>

      <NewPlayerForm tripId={trip.id} slug={slug} teams={teamsList} />
    </div>
  );
}
