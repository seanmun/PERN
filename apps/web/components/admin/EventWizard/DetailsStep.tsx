'use client';

import { useEffect, useRef, useState } from 'react';
import { createTrip } from '@/lib/actions/trips';
import { slugifyTripName } from '@/lib/slug';
import ImagePickerInput from '@/components/ImagePickerInput';

const inputCls =
  'w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-600 focus:border-yellow-500/60 focus:outline-none focus:ring-1 focus:ring-yellow-500/40';

const labelCls =
  'block font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-600 dark:text-zinc-400';

const hintCls = 'mt-1 text-[11px] text-zinc-500';

type Kind = 'trip' | 'outing' | 'match';

const KIND_COPY: Record<Kind, { nameLabel: string; namePlaceholder: string }> = {
  trip: { nameLabel: 'Trip name', namePlaceholder: 'Pinehurst Cup 2026' },
  outing: { nameLabel: 'Outing name', namePlaceholder: 'Sunday at Pine Hills' },
  match: { nameLabel: 'Match name', namePlaceholder: 'Sat foursome' },
};

export default function DetailsStep({ kind }: { kind: Kind }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const slugInputRef = useRef<HTMLInputElement>(null);
  const copy = KIND_COPY[kind];
  const singleDay = kind === 'outing' || kind === 'match';

  useEffect(() => {
    if (!slugTouched) setSlug(slugifyTripName(name));
  }, [name, slugTouched]);

  // Team1/Team2 default the same way createTrip already defaults them
  // when the fields are absent — no team setup here, that's Step 4.
  // The wizard's next step is Players, keyed off the slug we're about
  // to create. createTrip slugifies the same input the same way
  // (slugifyTripName), so the client-known slug and the server-computed
  // one match — no placeholder substitution needed here (unlike
  // createRound, where the id truly doesn't exist yet).
  const redirectTo = slug ? `/trips/${slug}/setup/players` : undefined;

  return (
    <form action={createTrip} className="mt-6 space-y-6">
      <input type="hidden" name="kind" value={kind} />
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}

      <div>
        <label htmlFor="trip-name" className={labelCls}>
          {copy.nameLabel} <span className="text-yellow-800 dark:text-yellow-500">*</span>
        </label>
        <input
          id="trip-name"
          type="text"
          name="name"
          required
          maxLength={120}
          placeholder={copy.namePlaceholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`mt-1.5 ${inputCls}`}
        />
      </div>

      <div>
        <label htmlFor="trip-slug" className={labelCls}>
          URL slug <span className="text-yellow-800 dark:text-yellow-500">*</span>
        </label>
        <div className="mt-1.5 flex items-stretch overflow-hidden rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 focus-within:border-yellow-500/60 focus-within:ring-1 focus-within:ring-yellow-500/40">
          <span className="flex items-center bg-zinc-100 dark:bg-zinc-900 px-3 font-mono text-[11px] text-zinc-500">
            /trips/
          </span>
          <input
            id="trip-slug"
            ref={slugInputRef}
            type="text"
            name="slug"
            required
            maxLength={60}
            pattern="[a-z0-9-]+"
            placeholder="pcup26"
            value={slug}
            onChange={(e) => {
              setSlug(slugifyTripName(e.target.value));
              setSlugTouched(true);
            }}
            className="w-full bg-transparent px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-600 focus:outline-none"
          />
        </div>
        <p className={hintCls}>
          Auto-generated from the name. Lowercase letters, numbers, and dashes.
        </p>
      </div>

      {singleDay ? (
        <div>
          <label htmlFor="trip-start" className={labelCls}>
            Date
          </label>
          <input id="trip-start" type="date" name="startDate" className={`mt-1.5 ${inputCls}`} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="trip-start" className={labelCls}>
              Start date
            </label>
            <input id="trip-start" type="date" name="startDate" className={`mt-1.5 ${inputCls}`} />
          </div>
          <div>
            <label htmlFor="trip-end" className={labelCls}>
              End date
            </label>
            <input id="trip-end" type="date" name="endDate" className={`mt-1.5 ${inputCls}`} />
          </div>
        </div>
      )}

      <div>
        <label htmlFor="trip-description" className={labelCls}>
          Description
        </label>
        <textarea
          id="trip-description"
          name="description"
          rows={3}
          maxLength={500}
          placeholder="One sentence. Optional."
          className={`mt-1.5 ${inputCls} resize-y`}
        />
      </div>

      <div>
        <p className={labelCls}>Icon</p>
        <p className={`${hintCls} mt-1`}>Optional. Shown on the trip header and cards.</p>
        <div className="mt-2">
          <ImagePickerInput name="imageUrl" aspect="1/1" previewMaxWidth={112} />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          className="rounded-sm bg-yellow-500 px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.4)] hover:bg-yellow-400"
        >
          Continue →
        </button>
        <a
          href="/trips/new"
          className="font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500 hover:text-zinc-300"
        >
          Back
        </a>
      </div>
    </form>
  );
}
