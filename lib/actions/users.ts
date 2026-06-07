'use server';

import { sql, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import { AuthorizationError } from '@/lib/auth/permissions';

export type UserSearchResult = {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  arcadePortraitUrl: string | null;
  handicap: string | null;
};

/**
 * Search platform users by email or full name (case-insensitive substring).
 * Used by the admin "add player" form to pick an existing platform user
 * instead of typing their email manually — pre-fills nickname / handicap
 * and links the tripMember to their user row immediately.
 *
 * Auth: any signed-in user can search. Returning email + name + avatar of
 * users is the same surface area as adding someone you don't know to a
 * trip (which already lets you set their email). A future friends-only
 * mode can layer on top — this is the unfiltered base.
 *
 * (Future: when `friendsOnly` is true, restrict to the caller's friends
 * list and rank by relationship recency.)
 */
export async function searchUsers(
  query: string,
  opts?: { limit?: number },
): Promise<UserSearchResult[]> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const q = query.trim();
  if (q.length < 2) return [];
  const limit = Math.min(opts?.limit ?? 10, 25);
  const like = `%${q.toLowerCase()}%`;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      avatarUrl: users.avatarUrl,
      arcadePortraitUrl: users.arcadePortraitUrl,
      handicap: users.handicap,
    })
    .from(users)
    .where(
      or(
        sql`lower(${users.email}) like ${like}`,
        sql`lower(coalesce(${users.fullName}, '')) like ${like}`,
      ),
    )
    .limit(limit);

  return rows;
}
