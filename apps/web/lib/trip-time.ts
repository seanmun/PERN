/**
 * Trip-timezone wall-time conversion, DST-aware.
 *
 * Replaces the old hardcoded `-04:00` offset (correct only during EDT —
 * an hour off between November and March). All trip wall times are
 * Eastern for now; when trips carry their own timezone this is the one
 * place to thread it through.
 */
export const TRIP_TZ = 'America/New_York';

/** Milliseconds the zone is ahead of UTC at the given instant. */
function tzOffsetMs(utc: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(utc)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // Some ICU builds render midnight as "24".
    parts.hour === '24' ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - utc.getTime();
}

/**
 * Convert an Eastern wall time — "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM[:SS]"
 * (the shapes `<input type="date">` / `type="datetime-local">` post) —
 * to the UTC instant it names. Returns an invalid Date for garbage
 * input, matching `new Date(...)`; callers keep their existing
 * `Number.isNaN(d.getTime())` guards.
 */
export function tripWallTimeToDate(wall: string): Date {
  const withTime = wall.includes('T') ? wall : `${wall}T00:00:00`;
  const iso = withTime.length === 16 ? `${withTime}:00` : withTime;
  // Pretend the wall time is UTC, then correct by the zone's offset at
  // that instant. Second pass handles landing on a DST transition.
  const naive = new Date(`${iso}Z`);
  if (Number.isNaN(naive.getTime())) return naive;
  const guess = new Date(naive.getTime() - tzOffsetMs(naive, TRIP_TZ));
  return new Date(naive.getTime() - tzOffsetMs(guess, TRIP_TZ));
}

/** Today's date ("YYYY-MM-DD") on the trip's wall clock. */
export function tripLocalToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TRIP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
