'use client';

/**
 * "Where" — the round-builder atom's first question (§6.1).
 *
 * Course facts are immutable foundation data (§4.1), so this only ever
 * picks from what the library already holds; it never edits a course.
 * Favourites first, then courses you have played, then the rest — the
 * course you want is nearly always one you have been to.
 */

import { useMemo, useState } from 'react';
import { Check, MapPin, Search, Star } from 'lucide-react';
import { INPUT, LABEL } from './ui';

export type CourseRow = {
  id: string;
  name: string;
  location: string | null;
  isFavorite: boolean;
  played: boolean;
  tees: { id: string; name: string; slope: number | null; rating: string | null }[];
};

export default function CoursePicker({
  courses,
  courseId,
  courseTeeId,
  disabled,
  onPick,
  onPickTee,
}: {
  courses: CourseRow[];
  courseId: string;
  courseTeeId: string | null;
  disabled?: boolean;
  onPick: (course: CourseRow) => void;
  onPickTee: (teeId: string | null) => void;
}) {
  const [query, setQuery] = useState('');
  const course = courses.find((c) => c.id === courseId) ?? null;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? courses.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.location ?? '').toLowerCase().includes(q),
        )
      : courses;
    return pool.slice(0, q ? 20 : 6);
  }, [courses, query]);

  return (
    <div>
      {course && (
        <p className="mb-2 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
          <Check size={12} /> {course.name}
        </p>
      )}

      {!disabled && (
        <>
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={course ? 'Change course…' : 'Search courses…'}
              className={`${INPUT} pl-9`}
            />
          </div>

          <ul className="mt-2 space-y-1">
            {visible.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(c);
                    setQuery('');
                  }}
                  className={`flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900 ${
                    c.id === courseId
                      ? 'border border-yellow-600/40 bg-yellow-500/5'
                      : ''
                  }`}
                >
                  {c.isFavorite ? (
                    <Star size={12} className="shrink-0 text-yellow-500" />
                  ) : (
                    <MapPin size={12} className="shrink-0 text-zinc-500" />
                  )}
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {c.name}
                  </span>
                  {c.location && (
                    <span className="truncate text-[11px] text-zinc-500">
                      {c.location}
                    </span>
                  )}
                </button>
              </li>
            ))}
            {visible.length === 0 && (
              <li className="px-2.5 py-2 text-[12px] text-zinc-500">
                No course matches “{query}”.
              </li>
            )}
          </ul>
        </>
      )}

      {/* Tee choice carries the slope and rating the handicap pipeline
          allocates from (§4.2), so it belongs to the round, not the course. */}
      {course && course.tees.length > 0 && (
        <label className="mt-3 block">
          <span className={LABEL}>Tees</span>
          <select
            value={courseTeeId ?? ''}
            disabled={disabled}
            onChange={(e) => onPickTee(e.target.value || null)}
            className={`${INPUT} mt-1`}
          >
            <option value="">Course default</option>
            {course.tees.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.slope ? ` · slope ${t.slope}` : ''}
                {t.rating ? ` · rating ${t.rating}` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
