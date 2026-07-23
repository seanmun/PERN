-- Bingo Bango Bongo: new format + committed per-hole judgment points.
-- Three points per hole (Bingo = first on green, Bango = closest once
-- all on, Bongo = first to hole out), awarded by the group via the same
-- commit flow as 30 Ball. One row per (match, hole), created at commit —
-- row existence IS the commit; uncommit deletes it. Each point nullable:
-- a washed point awards nothing. Points are per player; side totals sum
-- them; higher wins (computeBingoBangoBongo in packages/scoring).
-- Applied via the Neon SQL editor per house workflow.

ALTER TYPE "round_format" ADD VALUE 'bingo_bango_bongo';

CREATE TABLE "bbb_hole_points" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "match_id" uuid NOT NULL REFERENCES "matches"("id") ON DELETE CASCADE,
  "hole_number" integer NOT NULL,
  "bingo_trip_member_id" uuid REFERENCES "trip_members"("id"),
  "bango_trip_member_id" uuid REFERENCES "trip_members"("id"),
  "bongo_trip_member_id" uuid REFERENCES "trip_members"("id"),
  "committed_by" uuid REFERENCES "users"("id"),
  "committed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "bbb_points_match_hole_unique" UNIQUE ("match_id", "hole_number")
);
