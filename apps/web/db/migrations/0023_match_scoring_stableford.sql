-- Stableford support — adds a per-match scoring mode (independent of
-- format) and 5 nullable int columns for point overrides. Defaults
-- match every existing match's current behavior.

CREATE TYPE "public"."match_scoring" AS ENUM('match_play', 'stableford', 'stroke');--> statement-breakpoint

ALTER TABLE "matches" ADD COLUMN "scoring" "match_scoring" DEFAULT 'match_play' NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "pts_eagle" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "pts_birdie" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "pts_par" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "pts_bogey" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "pts_double_plus" integer;
