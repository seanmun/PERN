import 'server-only';

/**
 * Thin client for golfcourseapi.com (v1). Feature is optional: when
 * GOLF_COURSE_API_KEY is unset, isGolfCourseApiEnabled() is false and the
 * course-database search UI stays hidden — Places + scorecard extraction
 * remain the only paths.
 *
 * Free tier is 50 requests/day, so callers should hit this on explicit
 * user intent (a picked search, an import) — never speculatively.
 */

const BASE = 'https://api.golfcourseapi.com';

export type GcaTeeBox = {
  tee_name?: string;
  course_rating?: number;
  slope_rating?: number;
  total_yards?: number;
  par_total?: number;
  number_of_holes?: number;
  holes?: { par?: number; yardage?: number; handicap?: number }[];
};

export type GcaCourse = {
  // The API returns an OPAQUE STRING id ("j886cxq8"), not a number. This
  // was typed as `number` and never exercised end to end, so every
  // `getGolfCourse` call failed its own payload guard and the import path
  // could not work at all.
  id: string;
  club_name?: string;
  course_name?: string;
  location?: {
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    // Not in the published OpenAPI spec but present on some records;
    // treat as a bonus, never rely on it.
    latitude?: number;
    longitude?: number;
  };
  tees?: { female?: GcaTeeBox[]; male?: GcaTeeBox[] };
};

export function isGolfCourseApiEnabled(): boolean {
  return Boolean(process.env.GOLF_COURSE_API_KEY);
}

async function gcaFetch<T>(path: string): Promise<T> {
  const key = process.env.GOLF_COURSE_API_KEY;
  if (!key) throw new Error('GOLF_COURSE_API_KEY is not set');
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    // Course data barely changes; a day of caching stretches the free tier.
    next: { revalidate: 86400 },
  });
  if (!res.ok) {
    throw new Error(`golfcourseapi ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export async function searchGolfCourses(query: string): Promise<GcaCourse[]> {
  const data = await gcaFetch<{ courses?: GcaCourse[] }>(
    `/v1/search?search_query=${encodeURIComponent(query)}`,
  );
  return data.courses ?? [];
}

export async function getGolfCourse(id: string): Promise<GcaCourse> {
  // The single-course endpoint wraps its payload — { course: {...} } —
  // just as search wraps { courses: [...] }. This used to cast the
  // envelope straight to GcaCourse, so every field read as undefined: the
  // import created courses named "Course #undefined" (the last-resort
  // fallback in gcaDisplayName, with an undefined id) carrying no
  // location, no tees and no hole data, even when the search result had
  // shown a scorecard badge.
  const data = await gcaFetch<{ course?: GcaCourse } & Partial<GcaCourse>>(
    `/v1/courses/${id}`,
  );
  const course = (data.course ?? data) as GcaCourse;
  // Fail loudly rather than importing an empty shell. If the payload ever
  // changes shape again, this throws instead of silently writing junk
  // rows that look like real courses until someone tries to score on one.
  if (course?.id == null || String(course.id).length === 0) {
    throw new Error(
      `golfcourseapi: unexpected payload for course ${id} — no course object in response`,
    );
  }
  // Normalise: ids arrive as strings today, but a numeric id would still
  // be a valid identifier and must not blow up the guard above.
  return { ...course, id: String(course.id) };
}

/** "Pinehurst Resort — No. 2" style display name; falls back sensibly. */
export function gcaDisplayName(c: GcaCourse): string {
  const club = c.club_name?.trim();
  const course = c.course_name?.trim();
  if (club && course && club.toLowerCase() !== course.toLowerCase()) {
    return `${club} — ${course}`;
  }
  return course || club || `Course #${c.id}`;
}

/** "City, ST" for the courses.location column. */
export function gcaLocationLine(c: GcaCourse): string | null {
  const parts = [c.location?.city, c.location?.state].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}
