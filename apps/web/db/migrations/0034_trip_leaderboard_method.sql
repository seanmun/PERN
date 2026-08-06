-- Trip Scoring, setting 1: how the INDIVIDUAL leaderboard ranks players.
--
-- Trip-level and applied at READ time. hole_scores.net and
-- hole_scores.strokes_received are never rewritten by changing it, so
-- flipping the setting is reversible and cannot damage a recorded score.
-- Distinct from matches.handicap_method, which decides how a MATCH
-- resolves — different question, different column.
--
--   gross               raw strokes, no allocation
--   net_trip_handicap   strokes off the trip handicap, used as-is
--   net_course_handicap strokes off the full course handicap (index
--                       converted via the round tee's slope/rating);
--                       falls back to the trip handicap when a tee has
--                       no slope/rating, and the leaderboard says so
--
-- Purely additive: a new type plus a NOT NULL column with a default, so
-- every existing trip keeps the behaviour it has today (course handicap
-- is what the leaderboard already did, unconditionally).
-- Applied via the Neon SQL editor per house workflow.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'leaderboard_method') THEN
    CREATE TYPE "leaderboard_method" AS ENUM (
      'gross',
      'net_trip_handicap',
      'net_course_handicap'
    );
  END IF;
END $$;

ALTER TABLE "trips"
  ADD COLUMN IF NOT EXISTS "leaderboard_method" "leaderboard_method"
  DEFAULT 'net_course_handicap' NOT NULL;
