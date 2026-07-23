// Shared tee-ordering helpers, used by both the scorecard-extraction
// persistence path and the GolfCourseAPI import path. courses.ts is a
// 'use server' module and can't export sync helpers, so they live here.

// Common tee names roughly ordered longest -> shortest. Used to pick the
// "default" tee when a source returns multiple, and to order the tee list
// for display. Match is case-insensitive substring.
export const TEE_ORDER: ReadonlyArray<string> = [
  'tournament',
  'championship',
  'tips',
  'black',
  'blue',
  'gold',
  'white',
  'green',
  'silver',
  'yellow',
  'red',
  'forward',
  'senior',
  'junior',
];

export function teeRank(name: string): number {
  const lower = name.toLowerCase();
  for (let i = 0; i < TEE_ORDER.length; i++) {
    if (lower.includes(TEE_ORDER[i])) return i;
  }
  return TEE_ORDER.length; // unknown names fall to the bottom
}

// Pick a sensible default tee. Prefer "white" / "middle" / "regular" when
// present; otherwise fall back to the longest tee we recognize.
export function pickDefaultTeeIndex(tees: { name: string }[]): number {
  if (tees.length === 0) return -1;
  const preferred = ['white', 'middle', 'regular', 'member'];
  for (const pref of preferred) {
    const idx = tees.findIndex((t) => t.name.toLowerCase().includes(pref));
    if (idx !== -1) return idx;
  }
  return 0; // first tee in ranked order
}
