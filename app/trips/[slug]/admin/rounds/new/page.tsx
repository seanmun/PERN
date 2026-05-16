import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus } from 'lucide-react';
import { asc } from 'drizzle-orm';
import { db } from '@/db/client';
import { courses } from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { createRound } from '@/lib/actions/rounds';

export default async function NewRoundPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');

  if (!isPlatformAdmin(ctx) && !isTripAdminOf(ctx, trip.id)) {
    redirect(`/trips/${slug}/admin`);
  }

  const allCourses = await db
    .select()
    .from(courses)
    .orderBy(asc(courses.name));

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-6">
      <Link
        href={`/trips/${slug}/schedule`}
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Schedule
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">New round</h1>
      <p className="mt-1 text-xs text-zinc-500">
        Create the round shell. Add tee times and matchups on the next screen.
      </p>

      <form action={createRound} className="mt-8 space-y-5">
        <Field label="Label" hint='e.g. "Wed PM — Pine Needles"'>
          <input
            type="text"
            name="label"
            placeholder="Wed PM — Pine Needles"
            className={inputCls}
          />
        </Field>

        <Field label="Date">
          <input type="date" name="date" className={inputCls} />
        </Field>

        <Field label="Course" required>
          <select name="courseId" required className={inputCls} defaultValue="">
            <option value="" disabled>
              — pick a course —
            </option>
            {allCourses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.location ? ` · ${c.location}` : ''}
              </option>
            ))}
          </select>
          <Link
            href={`/trips/${slug}/admin/courses/new?redirectTo=/trips/${slug}/admin/rounds/new`}
            className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-yellow-400 hover:text-yellow-300"
          >
            <Plus size={11} /> Add new course
          </Link>
        </Field>

        <Field label="Format" required>
          <select name="format" required className={inputCls} defaultValue="match_play_2v2">
            <option value="match_play_2v2">2v2 — Match play (cart vs cart)</option>
            <option value="singles">Singles — 1v1 match play</option>
            <option value="scramble">Scramble</option>
            <option value="stroke">Stroke play</option>
          </select>
        </Field>

        <label className="flex items-start gap-3 rounded-sm border border-zinc-800 bg-zinc-950/40 px-3 py-3">
          <input
            type="checkbox"
            name="friendly"
            className="mt-0.5 h-4 w-4 accent-yellow-500"
          />
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-[11px] font-semibold uppercase tracking-widest text-zinc-200">
              Friendly round
            </span>
            <span className="block text-[11px] text-zinc-500">
              Does not count toward the Cup.
            </span>
          </span>
        </label>

        <div className="flex items-center gap-3 pt-4">
          <button
            type="submit"
            className="flex-1 rounded-sm bg-yellow-500 px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.3)] hover:bg-yellow-400"
          >
            Create round
          </button>
          <Link
            href={`/trips/${slug}/schedule`}
            className="rounded-sm border border-zinc-700 px-6 py-3 font-mono text-xs font-semibold uppercase tracking-widest text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  'mt-2 block w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500';

function Field({
  label,
  children,
  hint,
  required,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
        {label}
        {required && <span className="ml-1 text-yellow-500">*</span>}
      </span>
      {children}
      {hint && <p className="mt-1.5 text-[11px] text-zinc-500">{hint}</p>}
    </label>
  );
}
