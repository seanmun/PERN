/**
 * Read-only diagnostic. Dumps a course's tee data so we can see what the
 * scorecard extractor actually wrote to course_tees and course_tee_yardages.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/dump-course-tees.ts <courseId>
 */

import { db } from '../db/client';
import {
  courses,
  courseHoles,
  courseTees,
  courseTeeYardages,
} from '../db/schema';
import { asc, eq } from 'drizzle-orm';

async function main() {
  const courseId = process.argv[2]?.trim();
  if (!courseId) {
    console.error('Usage: npx tsx --env-file=.env.local scripts/dump-course-tees.ts <courseId>');
    process.exit(1);
  }

  const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
  if (!course) {
    console.log(`No course found for ${courseId}`);
    return;
  }

  console.log(`=== Course ===`);
  console.log(`${course.name}${course.location ? ` (${course.location})` : ''}`);
  console.log(`scorecard extracted at: ${course.scorecardExtractedAt?.toISOString() ?? 'never'}`);
  console.log();

  const tees = await db
    .select()
    .from(courseTees)
    .where(eq(courseTees.courseId, courseId))
    .orderBy(asc(courseTees.displayOrder));

  console.log(`=== course_tees (${tees.length}) ===`);
  if (tees.length === 0) {
    console.log('(none — extractor wrote nothing here, or the card only had one tee)');
  } else {
    for (const t of tees) {
      console.log(
        `${t.displayOrder}. ${t.name}` +
          (t.isDefault ? ' [DEFAULT]' : '') +
          (t.color ? `  color=${t.color}` : '') +
          (t.rating ? `  rating=${t.rating}` : '') +
          (t.slope != null ? `  slope=${t.slope}` : '') +
          (t.totalYardage != null ? `  total=${t.totalYardage}` : '')
      );
    }
  }
  console.log();

  if (tees.length > 0) {
    console.log(`=== course_tee_yardages by tee ===`);
    for (const t of tees) {
      const ys = await db
        .select()
        .from(courseTeeYardages)
        .where(eq(courseTeeYardages.courseTeeId, t.id))
        .orderBy(asc(courseTeeYardages.holeNumber));
      const grid = Array(18).fill('   —');
      for (const y of ys) grid[y.holeNumber - 1] = String(y.yardage).padStart(4);
      console.log(`${t.name.padEnd(14)} ${grid.join(' ')}  (${ys.length} holes)`);
    }
    console.log();
  }

  console.log(`=== course_holes (denormalized default tee yardage) ===`);
  const holes = await db
    .select()
    .from(courseHoles)
    .where(eq(courseHoles.courseId, courseId))
    .orderBy(asc(courseHoles.holeNumber));
  console.log(`# par yards SI`);
  for (const h of holes) {
    console.log(
      String(h.holeNumber).padStart(2),
      String(h.par).padStart(3),
      String(h.yardage ?? '—').padStart(5),
      String(h.handicapIndex).padStart(2)
    );
  }
}

main().then(() => process.exit(0));
