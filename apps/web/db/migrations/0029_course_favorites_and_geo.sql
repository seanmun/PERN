-- Course library upgrades for the GolfCourseAPI integration:
--   1. lat/lng on courses so pickers can distance-sort against the user's
--      one-shot browser geolocation.
--   2. external_source / external_id so API imports dedupe into the existing
--      row instead of creating copies.
--   3. course_favorites — platform-level starred courses. Keyed to users,
--      not trip_members: favorites follow the user across trips.
-- Applied via the Neon SQL editor per house workflow.

ALTER TABLE "courses" ADD COLUMN "latitude" double precision;
ALTER TABLE "courses" ADD COLUMN "longitude" double precision;
ALTER TABLE "courses" ADD COLUMN "external_source" text;
ALTER TABLE "courses" ADD COLUMN "external_id" text;

-- Nullable pair: manually-created courses have neither, and Postgres unique
-- indexes ignore NULL conflicts, so only real imports are deduped.
CREATE UNIQUE INDEX "courses_external_source_id_unique"
  ON "courses" ("external_source", "external_id");

CREATE TABLE "course_favorites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "course_id" uuid NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "course_favorites_user_course_unique" UNIQUE ("user_id", "course_id")
);
