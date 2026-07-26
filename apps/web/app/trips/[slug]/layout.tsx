import { notFound } from 'next/navigation';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { canViewTrip } from '@/lib/auth/permissions';

export default async function TripLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  // Belt-and-braces: every page under here gates on canViewTrip itself
  // (Next docs warn layouts don't re-run on every navigation, so this
  // can't be the only check). This stops the header leaking the trip's
  // name and icon around a page that 404s.
  const ctx = await getTripAuthContext(trip.id);
  if (!ctx || !canViewTrip(ctx)) notFound();

  return (
    <>
      <div className="border-b border-zinc-200 dark:border-zinc-900 bg-zinc-50 dark:bg-black/60">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2">
          {trip.imageUrl && (
            <span className="inline-flex h-6 w-6 shrink-0 overflow-hidden rounded-sm bg-zinc-100 dark:bg-zinc-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={trip.imageUrl} alt="" className="h-full w-full object-cover" />
            </span>
          )}
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-zinc-600 dark:text-zinc-400">
            {trip.name}
          </p>
          {trip.kind !== 'trip' && (
            <span className="ml-1 rounded-sm border border-zinc-300 dark:border-zinc-800 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              {trip.kind}
            </span>
          )}
        </div>
      </div>
      {children}
    </>
  );
}
