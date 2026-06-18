import { db } from '../db/client';
import { trips } from '../db/schema';
import { eq } from 'drizzle-orm';

const OLD_SLUG = 'pcup26';
const NEW_SLUG = 'pcup26';

async function main() {
  const updated = await db
    .update(trips)
    .set({ slug: NEW_SLUG })
    .where(eq(trips.slug, OLD_SLUG))
    .returning();

  if (!updated.length) throw new Error(`No trip found with slug "${OLD_SLUG}"`);
  console.log(`Renamed slug: ${OLD_SLUG} → ${NEW_SLUG} (${updated.length} row)`);
}

main().then(() => process.exit(0));
