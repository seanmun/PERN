-- Per-match handicap method. Three ways to compute strokes:
--   group_low : differential vs the lowest handicap in the FOURSOME
--               (the original Cup convention — stays the default)
--   match_low : differential vs the lowest handicap in the MATCH
--   course    : full course handicap per player — trip handicap treated
--               as an index and converted via the round tee's
--               slope/rating (Index × Slope/113 + (Rating − Par)),
--               scratch baseline 0
-- Applied via the Neon SQL editor per house workflow.

CREATE TYPE "public"."handicap_method" AS ENUM('group_low', 'match_low', 'course');--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "handicap_method" "handicap_method" DEFAULT 'group_low' NOT NULL;
