import { redirect } from 'next/navigation';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { ArrowLeft, ImageIcon, Pencil } from 'lucide-react';
import { db } from '@/db/client';
import { courses, trips } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/current-user';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';

export default async function AdminCoursesPage() {
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
  if (!canEdit) redirect('/admin');

  const list = await db.select().from(courses).orderBy(asc(courses.name));

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Admin
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">Courses</h1>
      <p className="mt-1 text-xs text-zinc-500">
        Set the landscape photo that runs behind each match detail page.
      </p>

      <div className="mt-8 space-y-3">
        {list.map((c) => (
          <Link
            key={c.id}
            href={`/admin/courses/${c.id}/edit`}
            className="block rounded-sm border border-zinc-800 bg-zinc-950/40 hover:border-yellow-500/40 hover:bg-zinc-900/40"
          >
            <div className="flex items-center gap-3 p-3">
              <div
                className="relative h-16 w-24 shrink-0 overflow-hidden rounded-sm border border-zinc-800 bg-zinc-900"
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
