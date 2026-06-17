import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import NewCourseForm from '@/components/admin/NewCourseForm';

export default async function NewCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { slug } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');

  if (!isPlatformAdmin(ctx) && !isTripAdminOf(ctx, trip.id)) {
    redirect(`/trips/${slug}/admin`);
  }

  const { redirectTo } = await searchParams;

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-6">
      <Link
        href={`/trips/${slug}/admin/courses`}
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Courses
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">New course</h1>
      <p className="mt-1 text-xs text-zinc-500">
        Adds a course to the trip catalog so it can be picked when creating rounds.
      </p>

      <NewCourseForm tripId={trip.id} slug={slug} redirectTo={redirectTo} />
    </div>
  );
}
