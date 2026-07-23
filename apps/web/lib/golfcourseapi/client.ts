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
  id: number;
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

export async function getGolfCourse(id: number): Promise<GcaCourse> {
  return gcaFetch<GcaCourse>(`/v1/courses/${id}`);
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
