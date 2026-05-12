import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthContext } from '@/lib/auth/current-user';
import { updateMyProfile } from '@/lib/actions/update-profile';
import ImagePickerInput from '@/components/ImagePickerInput';

export default async function EditProfilePage() {
  const ctx = await getAuthContext();
  if (!ctx) {
    redirect('/sign-in');
  }

  if (!ctx.tripMember) {
    redirect('/me');
  }

  const { user, tripMember } = ctx;

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-10">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-500">
        Edit profile
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">
        {tripMember.nickname}
      </h1>
      <p className="mt-1 text-xs text-zinc-500">
        Nickname, team, and captain status are set by the trip admin.
      </p>

      <form action={updateMyProfile} className="mt-8 space-y-6">
        <div>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            Profile photo
          </span>
          <div className="mt-2">
            <ImagePickerInput
              name="avatarUrl"
              defaultValue={tripMember.avatarUrl ?? undefined}
              aspect="1/1"
            />
          </div>
        </div>

        <Field
          label="Full name"
          name="fullName"
          defaultValue={user.fullName ?? ''}
          placeholder="Sean Munley"
        />
        <Field
          label="Trip handicap"
          name="tripHandicap"
          defaultValue={tripMember.tripHandicap ?? ''}
          placeholder="24.5"
          inputMode="decimal"
          hint="One decimal, e.g. 12.3. This drives stroke allocation for this trip."
        />
        <Field
          label="GHIN number"
          name="ghinNumber"
          defaultValue={user.ghinNumber ?? ''}
          placeholder="0000000"
          hint="Optional. Used later for handicap verification."
        />

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

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  hint,
  inputMode,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  hint?: string;
  inputMode?: 'text' | 'decimal' | 'numeric' | 'email' | 'tel' | 'url';
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
        {label}
      </span>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        inputMode={inputMode}
        className="mt-2 block w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
      />
      {hint && <p className="mt-1.5 text-[11px] text-zinc-500">{hint}</p>}
    </label>
  );
}
