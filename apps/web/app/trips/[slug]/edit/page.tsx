import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { canEditTrip } from '@/lib/auth/permissions';
import { getBuddies } from '@/lib/data/buddies';
import { loadBuilderCourses, loadEventForBuilder } from '@/lib/data/event-builder';
import EventBuilder from '@/components/event-builder/EventBuilder';

export const metadata: Metadata = {
  title: 'Edit event · BuddyCup',
};

/**
 * Edit mode — the same builder, the same write path (§10: "the `/admin/*`
 * route sprawl collapses into the same round-builder used in edit mode.
 * Admin ≠ a second app").
 *
 * The fourteen admin screens this replaces each owned a slice of the event
 * and saved on their own; between them they were the queued-write bug
 * class. There is one screen and one submit now.
 *
 * The §2 lock rules are surfaced by the builder as visible states — a
 * round with scores shows a padlock and disabled games, and the players in
 * it cannot be dropped or re-teamed — so the admin sees the constraint
 * rather than discovering it as a rejected save.
 */
export default async function EditEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect(`/sign-in?redirect_url=/trips/${slug}/edit`);
  if (!canEditTrip(ctx, trip.id)) redirect(`/trips/${slug}/schedule`);

  const event = await loadEventForBuilder(slug);
  // Null means the event has no two-team structure — it cannot round-trip
  // through the builder, and rendering a form that can only fail is worse
  // than saying so.
  if (!event) notFound();

  const [courses, buddies] = await Promise.all([
    loadBuilderCourses(ctx.user.id),
    getBuddies(
      ctx.user.id,
      event.players.map((p) => p.userId).filter((x): x is string => !!x),
    ),
  ]);

  return (
    <div className="pb-24">
      <div className="mx-auto max-w-2xl px-4 pt-6">
        <Link
          href={`/trips/${slug}/schedule`}
          className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500 hover:text-yellow-500"
        >
          <ArrowLeft size={12} strokeWidth={2.5} />
          Back to schedule
        </Link>

        <h1 className="mt-4 text-2xl font-bold tracking-tight">{trip.name}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Everything about this event, on one page. Nothing is written until
          you save.
        </p>

        <EventBuilder
          init={{ mode: 'edit', event }}
          courses={courses}
          buddies={buddies.map((b) => ({
            userId: b.userId,
            email: b.email,
            nickname: b.recentNickname || b.displayName || b.email.split('@')[0],
            handicap: b.recentHandicap,
            playedTogether: b.matchesPlayedTogether,
          }))}
        />
      </div>
    </div>
  );
}
