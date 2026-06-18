import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';

/**
 * Usernames are platform-wide handles (will be @mentioned once social ships).
 * They're auto-generated from the user's email at sign-up so nobody has to
 * pick one upfront — but they're editable on /me. Anything visible to other
 * users (mentions, profile URLs eventually) goes through this slug.
 */

// Same reserved set as parseUsername in lib/actions/me.ts. Kept inline (small,
// not worth a shared module) but if it grows, lift it out.
const RESERVED: ReadonlySet<string> = new Set([
  'admin', 'me', 'api', 'new', 'edit', 'sign-in', 'sign-up',
  'trips', 'documentation', 'brand', 'privacy', 'cup', 'buddycup',
  'support', 'help', 'root', 'system', 'home',
]);

/**
 * Take an email and produce a candidate username. Strips +tags ("foo+bar" →
 * "foo"), drops disallowed characters, trims to <= 20 chars, and falls back
 * to "user" if nothing usable is left.
 */
export function slugifyEmailLocalPart(email: string): string {
  const local = email.split('@')[0] ?? '';
  // Plus-tags collapse: "smunley13+test" → "smunley13"
  const stripped = local.split('+')[0] ?? '';
  // Lowercase, allowed chars only, replace illegal with hyphen, collapse runs
  const cleaned = stripped
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20);
  return cleaned || 'user';
}

/**
 * Derive a username that's guaranteed unique and not reserved. Appends a
 * suffix (2, 3, …) if the base is taken or reserved. Suffix expands the
 * base if needed to stay within the 20-char cap.
 */
export async function deriveUniqueUsername(email: string): Promise<string> {
  const base = slugifyEmailLocalPart(email);

  // Fast path: base is free and not reserved.
  if (!RESERVED.has(base)) {
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.username}) = ${base}`)
      .limit(1);
    if (!taken) return base;
  }

  // Suffix until we find a free slot. Cap at 999 to avoid pathological loops;
  // in the wild the first or second try is almost always free.
  for (let n = 2; n < 1000; n++) {
    const suffix = String(n);
    const trimmed = base.slice(0, Math.max(1, 20 - suffix.length));
    const candidate = `${trimmed}${suffix}`;
    if (RESERVED.has(candidate)) continue;
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.username}) = ${candidate}`)
      .limit(1);
    if (!taken) return candidate;
  }

  // Truly unreachable — but if hit, fall back to a non-conflicting form.
  return `user${Date.now().toString(36)}`.slice(0, 20);
}
