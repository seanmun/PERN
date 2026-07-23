import { NextResponse } from 'next/server';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import {
  gcaDisplayName,
  gcaLocationLine,
  isGolfCourseApiEnabled,
  searchGolfCourses,
} from '@/lib/golfcourseapi/client';

/**
 * Course-database search (golfcourseapi.com) for the new-course form.
 *
 *   GET /api/course-db/search?q=pinehurst
 *
 * Response: { enabled, results: [{ id, name, location, hasScorecardData }] }
 *
 * `enabled: false` (no API key configured) tells the form to hide the
 * course-database section entirely. Auth-gated — the free tier is 50
 * requests/day and shouldn't be burnable by anonymous traffic.
 */
export async function GET(request: Request) {
  if (!isGolfCourseApiEnabled()) {
    return NextResponse.json({ enabled: false, results: [] });
  }

  const ctx = await getGlobalAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 3) {
    return NextResponse.json({ enabled: true, results: [] });
  }

  try {
    const courses = await searchGolfCourses(q);
    const results = courses.slice(0, 8).map((c) => ({
      id: c.id,
      name: gcaDisplayName(c),
      location: gcaLocationLine(c),
      hasScorecardData: Boolean(
        c.tees?.male?.length || c.tees?.female?.length,
      ),
    }));
    return NextResponse.json({ enabled: true, results });
  } catch (err) {
    console.error('[course-db/search]', err);
    return NextResponse.json({ error: 'Upstream failed' }, { status: 502 });
  }
}
