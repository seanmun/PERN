import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { createEvent } from '@/lib/actions/events';
import EventForm from '@/components/schedule/EventForm';

export default async function NewEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');

  const canEdit = isPlatformAdmin(ctx) || isTripAdminOf(ctx, trip.id);
  if (!canEdit) redirect(`/trips/${slug}/schedule`);

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-6">
      <Link
        href={`/trips/${slug}/schedule`}
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Schedule
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">New event</h1>
      <p className="mt-1 text-xs text-zinc-500">
        Add a non-golf item to the trip itinerary (meal, dinner, shuttle, flight, etc.).
      </p>

      <div className="mt-8">
        <EventForm
          action={createEvent}
          submitLabel="Create event"
          cancelHref={`/trips/${slug}/schedule`}
          hiddenFields={{ tripId: trip.id }}
        />
      </div>
    </div>
  );
}
