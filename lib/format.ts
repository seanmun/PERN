const TRIP_TZ = 'America/New_York';

export function formatTripTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: TRIP_TZ,
  }).format(date);
}

export function formatTripDayLong(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: TRIP_TZ,
  }).format(date);
}

export function mapsUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function eventTypeLabel(t: string): string {
  return t.replace('_', ' ');
}

export function roundFormatLabel(fmt: string): string {
  switch (fmt) {
    case 'match_play_2v2': return '2v2 · Match Play';
    case 'singles':        return 'Singles · 1v1';
    case 'scramble':       return 'Scramble';
    case 'stroke':         return 'Stroke Play';
    default:               return fmt;
  }
}
