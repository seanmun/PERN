import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getAuthContext } from '@/lib/auth/current-user';
import { updateMyUserProfile } from '@/lib/actions/me';

export default async function GlobalMeEditPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/sign-in?redirect_url=/me/edit');

  const { user } = ctx;

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-6">
      <Link
        href="/me"
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> My account
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">Profile</h1>
      <p className="mt-1 text-xs text-zinc-500">
        Your platform-wide profile. The handicap here is your default — when
        you join a new trip, your trip handicap starts from this value. Trip
        admins can override your handicap on a specific trip without changing
        this one.
      </p>

      <form action={updateMyUserProfile} className="mt-8 space-y-5">
        <Field label="Email">
          <input
            type="email"
            value={user.email}
            disabled
            className={`${inputCls} cursor-not-allowed opacity-60`}
          />
          <p className="mt-1.5 text-[11px] text-zinc-500">
            Email comes from your sign-in account and can&apos;t be changed here.
          </p>
        </Field>

        <Field label="Full name">
          <input
            type="text"
            name="fullName"
            defaultValue={user.fullName ?? ''}
            placeholder="Sean Munley"
            className={inputCls}
          />
        </Field>

        <Field
          label="Handicap"
          hint="One decimal, e.g. 12.3. This is your default handicap across every trip you join."
        >
          <input
            type="text"
            name="handicap"
            inputMode="decimal"
            defaultValue={user.handicap ?? ''}
            placeholder="12.3"
            className={inputCls}
          />
        </Field>

        <Field
          label="GHIN number"
          hint="Optional. Used later for handicap verification."
        >
          <input
            type="text"
            name="ghinNumber"
            defaultValue={user.ghinNumber ?? ''}
            placeholder="0000000"
            className={inputCls}
          />
        </Field>

        <div className="flex items-center gap-3 pt-4">
          <button
            type="submit"
            className="flex-1 rounded-sm bg-yellow-500 px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.3)] hover:bg-yellow-400"
          >
            Save
          </button>
          <Link
            href="/me"
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
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
        {label}
      </span>
      {children}
      {hint && <p className="mt-1.5 text-[11px] text-zinc-500">{hint}</p>}
    </label>
  );
}
