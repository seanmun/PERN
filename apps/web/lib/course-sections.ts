// Shared ranking for course lists: ★ Favorites → Played → everything else,
// each section distance-sorted when the viewer's position is known. Used by
// the admin course library and the event-wizard course picker so the two
// surfaces never drift.

import { distanceMiles } from '@/lib/geo';

export type CourseRowBase = {
  id: string;
  name: string;
  location: string | null;
  imageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  isFavorite: boolean;
  played: boolean;
};

export type LatLng = { lat: number; lng: number };

export type CourseSection<T extends CourseRowBase> = {
  key: 'favorites' | 'played' | 'rest';
  title: string | null;
  rows: (T & { distance: number | null })[];
};

export function buildCourseSections<T extends CourseRowBase>(
  rows: T[],
  pos: LatLng | null,
): CourseSection<T>[] {
  const withDistance = rows.map((r) => ({
    ...r,
    distance:
      pos && r.latitude != null && r.longitude != null
        ? distanceMiles(pos.lat, pos.lng, r.latitude, r.longitude)
        : null,
  }));

  const favorites = withDistance.filter((r) => r.isFavorite);
  const played = withDistance.filter((r) => !r.isFavorite && r.played);
  const rest = withDistance.filter((r) => !r.isFavorite && !r.played);

  const sort = (list: typeof withDistance) =>
    [...list].sort((a, b) => {
      if (pos) {
        // Rows with coordinates first, nearest first; no-coordinate rows
        // fall to the bottom alphabetically.
        if (a.distance != null && b.distance != null) return a.distance - b.distance;
        if (a.distance != null) return -1;
        if (b.distance != null) return 1;
      }
      return a.name.localeCompare(b.name);
    });

  return [
    { key: 'favorites' as const, title: 'Favorites', rows: sort(favorites) },
    { key: 'played' as const, title: 'Played', rows: sort(played) },
    {
      key: 'rest' as const,
      title: favorites.length || played.length ? 'All courses' : null,
      rows: sort(rest),
    },
  ].filter((s) => s.rows.length > 0);
}
