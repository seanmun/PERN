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

const KIND_COPY: Record<Kind, { nameLabel: string; namePlaceholder: string; submit: string }> = {
  trip: {
    nameLabel: 'Trip name',
    namePlaceholder: 'Pinehurst Cup 2026',
    submit: 'Create trip',
  },
  outing: {
    nameLabel: 'Outing name',
    namePlaceholder: 'Sunday at Pine Hills',
    submit: 'Create outing',
  },
  match: {
    nameLabel: 'Match name',
    namePlaceholder: 'Sat foursome',
    submit: 'Create match',
  },
};

export default function NewTripForm({ kind = 'trip' }: { kind?: Kind }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const slugInputRef = useRef<HTMLInputElement>(null);
  const copy = KIND_COPY[kind];
  // Single-day kinds: collapse end date — server defaults endDate to startDate.
  const singleDay = kind === 'outing' || kind === 'match';

  useEffect(() => {
    if (!slugTouched) {
      setSlug(slugifyTripName(name));
    }
  }, [name, slugTouched]);

  return (
    <form action={createTrip} className="mt-8 space-y-6">
      <input type="hidden" name="kind" value={kind} />
      {/* Trip basics */}
      <section className="space-y-5">
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
            Auto‑generated from the name. Lowercase letters, numbers, and dashes.
            Edit if you want a shorter handle.
          </p>
        </div>

        {singleDay ? (
          <div>
            <label htmlFor="trip-start" className={labelCls}>
              Date
            </label>
            <input
              id="trip-start"
              type="date"
              name="startDate"
              className={`mt-1.5 ${inputCls}`}
            />
            <p className={hintCls}>
              {kind === 'match'
                ? 'When the foursome plays.'
                : 'When everyone tees off.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="trip-start" className={labelCls}>
                Start date
              </label>
              <input
                id="trip-start"
                type="date"
                name="startDate"
                className={`mt-1.5 ${inputCls}`}
              />
            </div>
            <div>
              <label htmlFor="trip-end" className={labelCls}>
                End date
              </label>
              <input
                id="trip-end"
                type="date"
                name="endDate"
                className={`mt-1.5 ${inputCls}`}
              />
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
            placeholder="One sentence about the trip. Optional."
            className={`mt-1.5 ${inputCls} resize-y`}
          />
        </div>

        <div>
          <p className={labelCls}>Icon</p>
          <p className={`${hintCls} mt-1`}>
            Optional. Shown on your trip list and the trip header.
          </p>
          <div className="mt-2">
            <ImagePickerInput name="imageUrl" aspect="1/1" />
          </div>
        </div>
      </section>

      {/* Teams */}
      <section className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-4">
        <p className={labelCls}>Teams</p>
        <p className={`${hintCls} mt-2`}>
          Two teams compete for the cup. You can rename and recolor them later.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <TeamFieldset
            idPrefix="team1"
            nameField="team1Name"
            colorField="team1Color"
            defaultName="Team A"
            defaultColor="#16a34a"
          />
          <TeamFieldset
            idPrefix="team2"
            nameField="team2Name"
            colorField="team2Color"
            defaultName="Team B"
            defaultColor="#eab308"
          />
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-sm bg-yellow-500 px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.4)] transition-colors hover:bg-yellow-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          {copy.submit}
        </button>
        <a
          href="/home"
          className="font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500 hover:text-zinc-300"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}

function TeamFieldset({
  idPrefix,
  nameField,
  colorField,
  defaultName,
  defaultColor,
}: {
  idPrefix: string;
  nameField: string;
  colorField: string;
  defaultName: string;
  defaultColor: string;
}) {
  const [color, setColor] = useState(defaultColor);

  return (
    <div className="space-y-2 rounded-sm border border-zinc-200 dark:border-zinc-900 bg-zinc-50 dark:bg-black/40 p-3">
      <label htmlFor={`${idPrefix}-name`} className={labelCls}>
        Name
      </label>
      <input
        id={`${idPrefix}-name`}
        type="text"
        name={nameField}
        required
        maxLength={40}
        defaultValue={defaultName}
        className={inputCls}
      />

      <label htmlFor={`${idPrefix}-color`} className={`${labelCls} pt-1`}>
        Color
      </label>
      <div className="flex items-center gap-2">
        <input
          id={`${idPrefix}-color`}
          type="color"
          name={colorField}
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950"
          aria-label={`${defaultName} color`}
        />
        <span className="font-mono text-[11px] uppercase tabular-nums text-zinc-600 dark:text-zinc-400">
          {color}
        </span>
      </div>
    </div>
  );
}
