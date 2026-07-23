'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { ImageIcon, LocateFixed, Pencil, Star } from 'lucide-react';
import { toggleCourseFavorite } from '@/lib/actions/course-favorites';
import { formatMiles } from '@/lib/geo';
import { buildCourseSections, type CourseRowBase } from '@/lib/course-sections';

export type CourseLibraryRow = CourseRowBase;

/**
 * The course library, ranked: ★ Favorites → Played → everything else.
 * "Sort by distance" asks for the browser's position once (no persistent
 * tracking) and re-sorts each section nearest-first with a distance chip
 * on rows that have coordinates.
 */
export default function CourseLibraryList({
  rows: initialRows,
  slug,
}: {
  rows: CourseLibraryRow[];
  slug: string;
}) {
  const [rows, setRows] = useState(initialRows);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function requestLocation() {
    if (!navigator.geolocation) {
      setGeoError('Location not supported on this device.');
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocating(false);
      },
      () => {
        setGeoError('Location unavailable — sorted alphabetically.');
        setLocating(false);
      },
      { maximumAge: 300_000, timeout: 10_000 },
    );
  }

  function toggleStar(courseId: string) {
    // Optimistic flip; the action returns the settled state.
    setRows((prev) =>
      prev.map((r) =>
        r.id === courseId ? { ...r, isFavorite: !r.isFavorite } : r,
      ),
    );
    startTransition(async () => {
      try {
        const { favorited } = await toggleCourseFavorite(
          courseId,
          `/trips/${slug}/admin/courses`,
        );
        setRows((prev) =>
          prev.map((r) =>
            r.id === courseId ? { ...r, isFavorite: favorited } : r,
          ),
        );
      } catch {
        // Revert on failure.
        setRows((prev) =>
          prev.map((r) =>
            r.id === courseId ? { ...r, isFavorite: !r.isFavorite } : r,
          ),
        );
      }
    });
  }

  const sections = useMemo(() => buildCourseSections(rows, pos), [rows, pos]);

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={requestLocation}
          disabled={locating || pos != null}
          className="inline-flex items-center gap-1.5 rounded-sm border border-zinc-300 dark:border-zinc-700 px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400 hover:border-yellow-500/40 hover:text-yellow-800 dark:hover:text-yellow-300 disabled:opacity-60"
        >
          <LocateFixed size={12} className={locating ? 'animate-pulse' : ''} />
          {pos ? 'Sorted by distance' : locating ? 'Locating…' : 'Sort by distance'}
        </button>
        {geoError && <p className="text-[11px] text-zinc-500">{geoError}</p>}
      </div>

      {sections.map((s) => (
        <div key={s.key} className="mt-6">
          {s.title && (
            <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
              {s.title}
            </p>
          )}
          <div className="space-y-3">
            {s.rows.map((c) => (
              <div
                key={c.id}
                className="flex items-center rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 hover:border-yellow-500/40 hover:bg-zinc-100 dark:hover:bg-zinc-900/40"
              >
                <Link
                  href={`/trips/${slug}/admin/courses/${c.id}/edit`}
                  className="flex min-w-0 flex-1 items-center gap-3 p-3"
                >
                  <div
                    className="relative h-16 w-24 shrink-0 overflow-hidden rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900"
                    style={
                      c.imageUrl
                        ? {
                            backgroundImage: `url(${c.imageUrl})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                          }
                        : undefined
                    }
                  >
                    {!c.imageUrl && (
                      <div className="flex h-full items-center justify-center">
                        <ImageIcon size={16} className="text-zinc-700" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{c.name}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {[c.location, c.distance != null ? formatMiles(c.distance) : null]
                        .filter(Boolean)
                        .join(' · ') || ' '}
                    </p>
                    {!c.imageUrl && (
                      <p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-zinc-600">
                        No image
                      </p>
                    )}
                  </div>
                  <Pencil size={14} className="shrink-0 text-zinc-500" />
                </Link>
                <button
                  type="button"
                  onClick={() => toggleStar(c.id)}
                  aria-label={c.isFavorite ? 'Unstar course' : 'Star course'}
                  className="p-3 pl-1"
                >
                  <Star
                    size={16}
                    className={
                      c.isFavorite
                        ? 'fill-yellow-500 text-yellow-500'
                        : 'text-zinc-500 hover:text-yellow-500'
                    }
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
