import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/db/client';
import { courses, trips } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/current-user';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { updateCourse } from '@/lib/actions/courses';
import ImagePickerInput from '@/components/ImagePickerInput';

export default async function EditCoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/sign-in');

  const [trip] = await db.select().from(trips).limit(1);
  if (!trip) redirect('/');

  const canEdit = isPlatformAdmin(ctx) || isTripAdminOf(ctx, trip.id);
  if (!canEdit) redirect('/');

  const { id } = await params;
  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, id))
    .limit(1);

  if (!course) notFound();

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-6">
      <Link
        href="/admin/courses"
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Courses
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">{course.name}</h1>
      <p className="mt-1 text-xs text-zinc-500">{course.location}</p>

      <form action={updateCourse} className="mt-6 space-y-5">
        <input type="hidden" name="id" value={course.id} />

        <Field label="Name" required>
          <input
            type="text"
            name="name"
            required
            defaultValue={course.name}
            className={inputCls}
          />
        </Field>

        <Field label="Location">
          <input
            type="text"
            name="location"
            defaultValue={course.location ?? ''}
            placeholder="Pinehurst, NC"
            className={inputCls}
          />
        </Field>

        <div>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            Landscape image
          </span>
          <p className="mt-1 mb-3 text-[11px] text-zinc-500">
            Used as the background on match detail pages. Upload a file, or paste a URL.
          </p>
          <ImagePickerInput name="imageUrl" defaultValue={course.imageUrl ?? undefined} />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="flex-1 rounded-sm bg-yellow-500 px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.3)] hover:bg-yellow-400"
          >
            Save course
          </button>
          <Link
            href="/admin/courses"
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
