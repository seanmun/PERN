import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { asc } from 'drizzle-orm';
import { ArrowLeft, ImageIcon, Pencil } from 'lucide-react';
import { db } from '@/db/client';
import { courses } from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';

export default async function AdminCoursesPage({
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
  if (!canEdit) redirect(`/trips/${slug}/admin`);

  const list = await db.select().from(courses).orderBy(asc(courses.name));

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <Link
        href={`/trips/${slug}/admin`}
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Admin
      </Link>

      <div className="mt-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Courses</h1>
          <p className="mt-1 text-xs text-zinc-500">
            Set the landscape photo that runs behind each match detail page.
          </p>
        </div>
        <Link
          href={`/trips/${slug}/admin/courses/new`}
          className="shrink-0 rounded-sm border border-yellow-500/40 bg-yellow-500/10 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-yellow-800 dark:text-yellow-300 hover:bg-yellow-500/20"
        >
          + New
        </Link>
      </div>

      <div className="mt-8 space-y-3">
        {list.map((c) => (
          <Link
            key={c.id}
            href={`/trips/${slug}/admin/courses/${c.id}/edit`}
            className="block rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 hover:border-yellow-500/40 hover:bg-zinc-100 dark:hover:bg-zinc-900/40"
          >
            <div className="flex items-center gap-3 p-3">
              <div
                className="relative h-16 w-24 shrink-0 overflow-hidden rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900"
                style={
                  c.imageUrl
                    ? {
                        backgroundImage: `url(${c.imageUrl})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }
                    : undefined
                }
              >
                {!c.imageUrl && (
                  <div className="flex h-full items-center justify-center">
                    <ImageIcon size={16} className="text-zinc-700" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{c.name}</p>
                {c.location && (
                  <p className="truncate text-xs text-zinc-500">{c.location}</p>
                )}
                {!c.imageUrl && (
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-zinc-600">
                    No image
                  </p>
                )}
              </div>
              <Pencil size={14} className="shrink-0 text-zinc-500" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
