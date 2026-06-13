import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import { updateMyUserProfile } from '@/lib/actions/me';
import PhotoWithPortraitSection from '@/components/portraits/PhotoWithPortraitSection';

export default async function MyProfilePage() {
  const ctx = await getGlobalAuthContext();
  if (!ctx) redirect('/sign-in?redirect_url=/me');

  const { user } = ctx;

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-6">
      <Link
        href="/home"
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Home
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">Profile</h1>
      <p className="mt-1 text-xs text-zinc-500">
        Your platform-wide profile. The handicap here is your default — when
        you join a new trip, your trip handicap starts from this value. Trip
        admins can override your handicap on a specific trip without changing
        this one.
      </p>

      <form action={updateMyUserProfile} className="mt-8 space-y-6">
        <PhotoWithPortraitSection
          photoName="avatarUrl"
          photoDefaultValue={user.avatarUrl ?? null}
          portraitUrl={user.arcadePortraitUrl ?? null}
          redirectTo="/me"
        />

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
          hint="One decimal, e.g. 12.3. This is your default across every trip you join. Trip admins can override per trip."
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

        <Field label="Home club" hint="Where you play most. Leave blank if you're a free agent.">
          <input
            type="text"
            name="clubName"
            defaultValue={user.clubName ?? ''}
            placeholder="Pinehurst Resort"
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Field label="City">
              <input
                type="text"
                name="city"
                defaultValue={user.city ?? ''}
                placeholder="Hoboken"
                className={inputCls}
              />
            </Field>
          </div>
          <div className="col-span-1">
            <Field label="State">
              <input
                type="text"
                name="state"
                defaultValue={user.state ?? ''}
                placeholder="NJ"
                maxLength={2}
                autoCapitalize="characters"
                className={inputCls}
              />
            </Field>
          </div>
        </div>

        <details className="rounded-sm border border-zinc-200 dark:border-zinc-900 bg-zinc-50 dark:bg-zinc-950/30">
          <summary className="cursor-pointer select-none px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500 hover:text-zinc-300">
            Public handle
            {user.username && (
              <span className="ml-2 normal-case tracking-normal text-yellow-400">
                @{user.username}
              </span>
            )}
          </summary>
          <div className="border-t border-zinc-200 dark:border-zinc-900 px-3 pt-3 pb-4">
            <p className="text-[11px] text-zinc-500">
              Your @-handle. Auto-set from your email when you signed up. Will be used for mentions and your profile URL when social ships — you can claim a better one now if you want.
            </p>
            <div className="mt-2 flex items-stretch overflow-hidden rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 focus-within:border-yellow-500">
              <span className="flex items-center px-3 font-mono text-base text-zinc-500">@</span>
              <input
                type="text"
                name="username"
                defaultValue={user.username ?? ''}
                placeholder="seanmun"
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                maxLength={20}
                className="flex-1 bg-transparent px-1 py-2 font-mono text-base text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
              />
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-500">
              3–20 chars, lowercase letters, numbers, hyphens, underscores.
            </p>
          </div>
        </details>

        <div className="flex items-center gap-3 pt-4">
          <button
            type="submit"
            className="flex-1 rounded-sm bg-yellow-500 px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.3)] hover:bg-yellow-400"
          >
            Save
          </button>
          <Link
            href="/home"
            className="rounded-sm border border-zinc-400 dark:border-zinc-700 px-6 py-3 font-mono text-xs font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-200"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  'mt-2 block w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2.5 text-base text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-600 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500';

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
