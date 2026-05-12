// One-off: copy any existing users.avatarUrl → trip_members.avatarUrl
// for members that have been claimed but lost their avatar reference
// when the column moved to trip_members.

import { db } from '../db/client';
import { tripMembers, users } from '../db/schema';
import { eq, and, isNotNull, isNull } from 'drizzle-orm';

async function main() {
  const rows = await db
    .select({
      memberId: tripMembers.id,
      nickname: tripMembers.nickname,
      userAvatar: users.avatarUrl,
    })
    .from(tripMembers)
    .innerJoin(users, eq(tripMembers.userId, users.id))
    .where(and(isNotNull(users.avatarUrl), isNull(tripMembers.avatarUrl)));

  if (!rows.length) {
    console.log('No avatars to migrate.');
    return;
  }

  for (const row of rows) {
    if (!row.userAvatar) continue;
    await db
      .update(tripMembers)
      .set({ avatarUrl: row.userAvatar })
      .where(eq(tripMembers.id, row.memberId));
    console.log(`✓ ${row.nickname} avatar restored`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
