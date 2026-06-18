import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tripEvents } from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { updateEvent } from '@/lib/actions/events';
import EventForm from '@/components/schedule/EventForm';
import DeleteEventButton from '@/components/schedule/DeleteEventButton';

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');

  const [event] = await db
    .select()
    .from(tripEvents)
    .where(eq(tripEvents.id, id))
    .limit(1);

  if (!event) notFound();

  const canEdit = isPlatformAdmin(ctx) || isTripAdminOf(ctx, event.tripId);
  if (!canEdit) redirect(`/trips/${slug}/events/${event.id}`);

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-6">
      <Link
        href={`/trips/${slug}/events/${event.id}`}
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Event
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">Edit event</h1>
      <p className="mt-1 text-xs text-zinc-500">{event.title}</p>

      <div className="mt-8">
        <EventForm
          action={updateEvent}
          submitLabel="Save changes"
          cancelHref={`/trips/${slug}/events/${event.id}`}
          hiddenFields={{ id: event.id }}
          defaults={{
            type: event.type,
            title: event.title,
            description: event.description,
            location: event.location,
            address: event.address,
            startTime: event.startTime,
            endTime: event.endTime,
          }}
          deleteSlot={
            <div className="mt-6 border-t border-zinc-300 dark:border-zinc-800 pt-6">
              <DeleteEventButton eventId={event.id} />
            </div>
          }
        />
      </div>
    </div>
  );
}
