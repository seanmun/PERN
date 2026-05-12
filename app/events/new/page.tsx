import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { trips } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/current-user';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { createEvent } from '@/lib/actions/events';
import EventForm from '@/components/schedule/EventForm';

export default async function NewEventPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/sign-in');

  const [trip] = await db
    .select()
    .from(trips)
    .where(eq(trips.slug, 'pinehurst-cup-2026'))
    .limit(1);

  if (!trip) {
    return (
      <div className="mx-auto max-w-md px-4 pt-16">
        <p className="text-zinc-400">Trip not found.</p>
      </div>
    );
  }

  const canEdit = isPlatformAdmin(ctx) || isTripAdminOf(ctx, trip.id);
  if (!canEdit) redirect('/schedule');

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-6">
      <Link
        href="/schedule"
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
          cancelHref="/schedule"
          hiddenFields={{ tripId: trip.id }}
        />
      </div>
    </div>
  );
}
