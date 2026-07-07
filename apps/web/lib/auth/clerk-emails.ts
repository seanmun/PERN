import 'server-only';
import type { User as ClerkUser } from '@clerk/nextjs/server';

/**
 * Every email on the Clerk account, lowercased and deduped, primary
 * first. Claim/lazy-claim flows match trip_member rows against ALL of
 * these — an admin often knows a buddy by a different address than the
 * one they signed up with (work vs personal, gmail vs icloud), and
 * matching only the primary silently orphans those slots.
 */
export function clerkEmails(clerkUser: ClerkUser): string[] {
  const primary = clerkUser.primaryEmailAddress?.emailAddress;
  const all = [
    ...(primary ? [primary] : []),
    ...clerkUser.emailAddresses.map((e) => e.emailAddress),
  ]
    .filter(Boolean)
    .map((e) => e.toLowerCase());
  return Array.from(new Set(all));
}
