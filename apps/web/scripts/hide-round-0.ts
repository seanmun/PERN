import { db } from '../db/client';
import { rounds, trips } from '../db/schema';
import { and, eq } from 'drizzle-orm';

async function main() {
  const [trip] = await db
    .select()
    .from(trips)
    .where(eq(trips.slug, 'pcup26'))
    .limit(1);
  if (!trip) throw new Error('Trip not found');

  const updated = await db
    .update(rounds)
    .set({ isHidden: true })
    .where(and(eq(rounds.tripId, trip.id), eq(rounds.order, 0)))
    .returning();

  console.log(`Hidden ${updated.length} round(s).`);
}

main().then(() => process.exit(0));
