import { notFound } from 'next/navigation';
import { getTripBySlug } from '@/lib/auth/trip-context';

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

  return (
    <>
      <div className="border-b border-zinc-900 bg-black/60">
        <div className="mx-auto max-w-3xl px-4 py-2">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-zinc-400">
            {trip.name}
          </p>
        </div>
      </div>
      {children}
    </>
  );
}
