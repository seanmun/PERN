import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/db/client';
import { teams } from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { createPlayer } from '@/lib/actions/players';

export default async function NewPlayerPage({
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
    redirect(`/trips/${slug}/admin/players`);
  }

  const teamsList = await db
    .select()
    .from(teams)
    .where(eq(teams.tripId, trip.id))
    .orderBy(asc(teams.name));

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-6">
      <Link
        href={`/trips/${slug}/admin/players`}
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Players
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">Add player</h1>
      <p className="mt-1 text-xs text-zinc-500">
        Type their nickname and email. They’ll claim the slot the first time
        they sign in with that email.
      </p>

      <form action={createPlayer} className="mt-8 space-y-5">
        <input type="hidden" name="tripId" value={trip.id} />

        <Field label="Nickname" required>
          <input
            type="text"
            name="nickname"
            required
            maxLength={40}
            placeholder="Dan"
            className={inputCls}
          />
        </Field>

        <Field
          label="Email"
          required
          hint="They’ll sign in with this address — make sure it’s the one they use."
        >
          <input
            type="email"
            name="email"
            required
            placeholder="dan@example.com"
            className={inputCls}
          />
        </Field>

        <Field label="Team">
          <select name="teamId" defaultValue="" className={inputCls}>
            <option value="">— None —</option>
            {teamsList.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Trip handicap"
          hint="Optional. One decimal, e.g. 12.3."
        >
          <input
            type="text"
            name="tripHandicap"
            inputMode="decimal"
            placeholder="—"
            className={inputCls}
          />
        </Field>

        <div className="flex items-center gap-3 pt-4">
          <button
            type="submit"
            className="flex-1 rounded-sm bg-yellow-500 px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.3)] hover:bg-yellow-400"
          >
            Add player
          </button>
          <Link
            href={`/trips/${slug}/admin/players`}
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
