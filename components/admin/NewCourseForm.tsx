'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, Search } from 'lucide-react';
import { createCourse } from '@/lib/actions/courses';
import ImagePickerInput from '@/components/ImagePickerInput';

type Suggestion = {
  placeId: string;
  mainText: string;
  secondaryText: string;
};

/**
 * New-course form with a Google Places autocomplete at the top.
 *
 * Admin types in the search box → debounced fetch hits our proxy at
 * /api/places/golf-courses → suggestion list drops down. Tap a result
 * → second fetch resolves name + address + location + landscape photo
 * URL, all dropped into the form's state. Admin can still edit any
 * value or skip the search entirely and fill manually.
 */
export default function NewCourseForm({
  tripId,
  slug,
  redirectTo,
}: {
  tripId: string;
  slug: string;
  redirectTo?: string;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Form values — owned here so the autocomplete can fill them.
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [address, setAddress] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Debounced autocomplete. 250ms feels responsive but doesn't hammer
  // the API on every keystroke.
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (searchQuery.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    debounceTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/places/golf-courses?q=${encodeURIComponent(searchQuery)}`,
        );
        if (res.ok) {
          const data: { suggestions: Suggestion[] } = await res.json();
          setSuggestions(data.suggestions);
          setShowDropdown(true);
        }
      } finally {
        setSearching(false);
      }
    }, 250);
  }, [searchQuery]);

  // Click-outside closes the dropdown.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function pickSuggestion(s: Suggestion) {
    setShowDropdown(false);
    setSearchQuery(`${s.mainText}${s.secondaryText ? ` · ${s.secondaryText}` : ''}`);
    setResolving(true);
    try {
      const res = await fetch(
        `/api/places/golf-courses/${encodeURIComponent(s.placeId)}`,
      );
      if (res.ok) {
        const data: {
          name?: string;
          address?: string;
          location?: string;
          imageUrl?: string | null;
        } = await res.json();
        if (data.name) setName(data.name);
        if (data.address) setAddress(data.address);
        if (data.location) setLocation(data.location);
        if (data.imageUrl) setImageUrl(data.imageUrl);
      }
    } finally {
      setResolving(false);
    }
  }

  return (
    <form action={createCourse} className="mt-8 space-y-5">
      <input type="hidden" name="tripId" value={tripId} />
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}

      {/* Search/autocomplete — fills the form below on selection. */}
      <div className="relative" ref={containerRef}>
        <label className="block">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            Find course
          </span>
          <div className="relative mt-2">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => suggestions.length && setShowDropdown(true)}
              placeholder="Pinehurst, Augusta National, Pebble Beach…"
              className="block w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2.5 pl-9 pr-9 text-base text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-600 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
            />
            {(searching || resolving) && (
              <Loader2
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-zinc-500"
              />
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-500">
            Powered by Google. Pick a result to autofill name, address, and a photo.
            Optional — fill it manually if you'd rather.
          </p>
        </label>

        {showDropdown && suggestions.length > 0 && (
          <ul className="absolute left-0 right-0 z-10 mt-1 max-h-64 overflow-y-auto rounded-sm border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 shadow-lg">
            {suggestions.map((s) => (
              <li key={s.placeId}>
                <button
                  type="button"
                  onClick={() => pickSuggestion(s)}
                  className="flex w-full flex-col items-start gap-0.5 border-b border-zinc-200 dark:border-zinc-800 px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-yellow-500/10"
                >
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {s.mainText}
                  </span>
                  {s.secondaryText && (
                    <span className="text-xs text-zinc-500">{s.secondaryText}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Manual fields — controlled so the autocomplete can fill them. */}
      <Field label="Name" required>
        <input
          type="text"
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Pinehurst No. 6"
          className={inputCls}
        />
      </Field>

      <Field label="Location">
        <input
          type="text"
          name="location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Pinehurst, NC"
          className={inputCls}
        />
      </Field>

      <Field
        label="Address"
        hint="Street address. Used for the &ldquo;Open in Maps&rdquo; deep link on match detail."
      >
        <input
          type="text"
          name="address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="80 Carolina Vista Dr, Pinehurst, NC 28374"
          className={inputCls}
        />
      </Field>

      <Field label="Total par">
        <input
          type="number"
          name="totalPar"
          placeholder="72"
          min={50}
          max={90}
          className={inputCls}
        />
      </Field>

      <div>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
          Landscape image
        </span>
        <p className="mt-1 mb-3 text-[11px] text-zinc-500">
          Optional — used as the match-detail background.
        </p>
        {/* key={imageUrl} forces a remount when the autocomplete fills
            a new URL — ImagePickerInput uses defaultValue, which only
            applies on first mount otherwise. */}
        <ImagePickerInput
          key={imageUrl || 'empty'}
          name="imageUrl"
          defaultValue={imageUrl || undefined}
        />
      </div>

      <div>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
          Scorecard image
        </span>
        <p className="mt-1 mb-3 text-[11px] text-zinc-500">
          Upload a clear photo of the back-of-card or official scorecard PDF page.
          When you save, AI will read the 18 holes (par, yardage, stroke index) and
          populate the hole table automatically. You can edit any value afterwards.
        </p>
        <ImagePickerInput name="scorecardImageUrl" aspect="4/3" />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          className="flex-1 rounded-sm bg-yellow-500 px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.3)] hover:bg-yellow-400"
        >
          Create course
        </button>
        <Link
          href={`/trips/${slug}/admin/courses`}
          className="rounded-sm border border-zinc-400 dark:border-zinc-700 px-6 py-3 font-mono text-xs font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-200"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

const inputCls =
  'mt-2 block w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2.5 text-base text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-600 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500';

function Field({
  label,
  children,
  required,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
        {label}
        {required && <span className="ml-1 text-yellow-800 dark:text-yellow-500">*</span>}
      </span>
      {children}
      {hint && <p className="mt-1.5 text-[11px] text-zinc-500">{hint}</p>}
    </label>
  );
}
