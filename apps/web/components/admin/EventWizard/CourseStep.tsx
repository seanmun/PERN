'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  LocateFixed,
  MapPin,
  Search,
  Star,
} from 'lucide-react';
import { importCourseForWizard } from '@/lib/actions/course-import';
import { formatMiles } from '@/lib/geo';
import {
  buildCourseSections,
  type CourseRowBase,
  type LatLng,
} from '@/lib/course-sections';

type DbResult = {
  id: number;
  name: string;
  location: string | null;
  hasScorecardData: boolean;
};

/**
 * Wizard step 2 for match/outing: pick the course FIRST — it's the one
 * constant of the event. Ranked library (★ favorites → played → all,
 * distance-sorted on request) plus live search that also covers the
 * course database for one-tap scorecard import. Picking anything routes
 * to the Details step with ?courseId= attached.
 */
export default function CourseStep({
  kind,
  rows,
  dbEnabled,
}: {
  kind: 'outing' | 'match';
  rows: CourseRowBase[];
  dbEnabled: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [dbResults, setDbResults] = useState<DbResult[]>([]);
  const [searchingDb, setSearchingDb] = useState(false);
  const [pos, setPos] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [importingId, setImportingId] = useState<number | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [, startImport] = useTransition();
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const detailsHref = (courseId?: string) =>
    `/trips/new/details?kind=${kind}${courseId ? `&courseId=${courseId}` : ''}`;

  // Debounced course-database search alongside the instant local filter.
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (!dbEnabled || query.trim().length < 3) {
      setDbResults([]);
      return;
    }
    debounceTimer.current = setTimeout(async () => {
      setSearchingDb(true);
      try {
        const res = await fetch(
          `/api/course-db/search?q=${encodeURIComponent(query)}`,
        );
        if (res.ok) {
          const data: { results: DbResult[] } = await res.json();
          setDbResults(data.results);
        }
      } finally {
        setSearchingDb(false);
      }
    }, 250);
  }, [query, dbEnabled]);

  function requestLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { maximumAge: 300_000, timeout: 10_000 },
    );
  }

  function pickImport(r: DbResult) {
    setImportError(null);
    setImportingId(r.id);
    startImport(async () => {
      try {
        const { courseId } = await importCourseForWizard(r.id);
        router.push(detailsHref(courseId));
      } catch {
        setImportError(`Import failed for ${r.name} — try another result.`);
        setImportingId(null);
      }
    });
  }

  const q = query.trim().toLowerCase();
  const localMatches = useMemo(
    () =>
      q
        ? rows.filter(
            (r) =>
              r.name.toLowerCase().includes(q) ||
              (r.location ?? '').toLowerCase().includes(q),
          )
        : rows,
    [rows, q],
  );
  const sections = useMemo(
    () =>
      q
        ? [{ key: 'rest' as const, title: 'Your library', rows: buildCourseSections(localMatches, pos).flatMap((s) => s.rows) }]
        : buildCourseSections(localMatches, pos),
    [localMatches, pos, q],
  );
  // Hide DB results that are already in the library (same external id
  // isn't visible client-side, so match on name).
  const localNames = useMemo(
    () => new Set(rows.map((r) => r.name.toLowerCase())),
    [rows],
  );
  const freshDbResults = dbResults.filter(
    (r) => !localNames.has(r.name.toLowerCase()),
  );

  return (
    <div className="mt-6">
      {/* Search — one box, both sources. */}
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search any course…"
          className="block w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2.5 pl-9 pr-9 text-base text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-600 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
        />
        {searchingDb && (
          <Loader2
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-zinc-500"
          />
        )}
      </div>
      {importError && (
        <p className="mt-2 text-[11px] text-red-600 dark:text-red-400">{importError}</p>
      )}

      {!q && (
        <button
          type="button"
          onClick={requestLocation}
          disabled={locating || pos != null}
          className="mt-3 inline-flex items-center gap-1.5 rounded-sm border border-zinc-300 dark:border-zinc-700 px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400 hover:border-yellow-500/40 hover:text-yellow-800 dark:hover:text-yellow-300 disabled:opacity-60"
        >
          <LocateFixed size={12} className={locating ? 'animate-pulse' : ''} />
          {pos ? 'Sorted by distance' : locating ? 'Locating…' : 'Sort by distance'}
        </button>
      )}

      {/* Local library, ranked. */}
      {sections.map((s) => (
        <div key={s.key} className="mt-5">
          {s.title && (
            <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
              {s.title}
            </p>
          )}
          <div className="space-y-2">
            {s.rows.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => router.push(detailsHref(c.id))}
                className="flex w-full items-center gap-3 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-3 text-left hover:border-yellow-500/40 hover:bg-zinc-100 dark:hover:bg-zinc-900/40"
              >
                {c.isFavorite && (
                  <Star size={14} className="shrink-0 fill-yellow-500 text-yellow-500" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{c.name}</p>
                  <p className="truncate text-xs text-zinc-500">
                    {[c.location, c.distance != null ? formatMiles(c.distance) : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <ChevronRight size={14} className="shrink-0 text-zinc-500" />
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Course-database results — importing creates the course with its
          full scorecard, then continues to Details. */}
      {q && freshDbResults.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            Course database
          </p>
          <div className="space-y-2">
            {freshDbResults.map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={importingId != null}
                onClick={() => pickImport(r)}
                className="flex w-full items-center gap-3 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-3 text-left hover:border-yellow-500/40 hover:bg-zinc-100 dark:hover:bg-zinc-900/40 disabled:opacity-60"
              >
                <MapPin size={14} className="shrink-0 text-zinc-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{r.name}</p>
                  {r.location && (
                    <p className="truncate text-xs text-zinc-500">{r.location}</p>
                  )}
                </div>
                {importingId === r.id ? (
                  <Loader2 size={12} className="shrink-0 animate-spin text-yellow-600 dark:text-yellow-400" />
                ) : r.hasScorecardData ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-green-600/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-widest text-green-700 dark:text-green-400">
                    <FileSpreadsheet size={10} /> Scorecard
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      )}

      {q && sections.every((s) => s.rows.length === 0) && freshDbResults.length === 0 && !searchingDb && (
        <p className="mt-5 text-sm text-zinc-500">
          No matches. You can skip and add the course later.
        </p>
      )}

      <div className="mt-8 flex items-center gap-4">
        <Link
          href={detailsHref()}
          className="font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500 hover:text-zinc-300"
        >
          Skip for now →
        </Link>
        <a
          href="/trips/new"
          className="font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500 hover:text-zinc-300"
        >
          Back
        </a>
      </div>
    </div>
  );
}
