import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import {
  MapPin,
  Plane,
  Bus,
  UtensilsCrossed,
  Sparkles,
  Hotel,
  Calendar,
  Pencil,
  ArrowLeft,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tripEvents } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/current-user';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import {
  formatTripTime,
  formatTripDayLong,
  mapsUrl,
  eventTypeLabel,
} from '@/lib/format';

const ICONS: Record<string, LucideIcon> = {
  flight: Plane,
  shuttle: Bus,
  meal: UtensilsCrossed,
  social: Sparkles,
  hotel_checkin: Hotel,
  hotel_checkout: Hotel,
  other: Calendar,
};

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/sign-in');

  const { id } = await params;

  const [event] = await db
    .select()
    .from(tripEvents)
    .where(eq(tripEvents.id, id))
    .limit(1);

  if (!event) notFound();

  const canEdit =
    isPlatformAdmin(ctx) || isTripAdminOf(ctx, event.tripId);
  const Icon = ICONS[event.type] ?? Calendar;
  const mapQuery = event.address ?? event.location;

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-6">
      <Link
        href="/schedule"
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Schedule
      </Link>

      <div className="mt-6 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon size={16} className="text-yellow-500" />
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-500">
              {eventTypeLabel(event.type)}
            </p>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{event.title}</h1>
        </div>
        {canEdit && (
          <Link
            href={`/events/${event.id}/edit`}
            aria-label="Edit event"
            className="shrink-0 rounded-sm border border-zinc-800 bg-black/50 p-2 text-zinc-400 hover:border-yellow-500/50 hover:text-yellow-400"
          >
            <Pencil size={14} />
          </Link>
        )}
      </div>

      <dl className="mt-8 space-y-5">
        <Row label="When">
          <p className="text-base font-medium">{formatTripDayLong(event.startTime)}</p>
          <p className="font-mono text-sm tabular-nums text-yellow-400">
            {formatTripTime(event.startTime)}
            {event.endTime && ` — ${formatTripTime(event.endTime)}`}
          </p>
        </Row>

        {event.location && (
          <Row label="Where">
            <p className="text-base">{event.location}</p>
            {event.address && (
              <p className="mt-0.5 text-sm text-zinc-500">{event.address}</p>
            )}
          </Row>
        )}

        {event.description && (
          <Row label="Notes">
            <p className="whitespace-pre-wrap text-sm text-zinc-300">{event.description}</p>
          </Row>
        )}
      </dl>

      {mapQuery && (
        <a
          href={mapsUrl(mapQuery)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-sm border border-yellow-500/40 bg-yellow-500/10 px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-yellow-300 hover:bg-yellow-500/20"
        >
          <MapPin size={14} /> Open in Maps
        </a>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
        {label}
      </dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}
