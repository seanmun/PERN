-- Match template sizes — step 2 of docs/match-template-spec.md.
-- Per-side roster size lives on the match so the slot validator and the
-- match-builder UI don't have to recompute from match_participants on
-- every render. Same size on both sides for now — no 2v4 asymmetries.
--
-- Defaults to 1 so existing rows stay valid; the data-fix below
-- backfills sensible sizes from the current format + participant counts
-- on a best-effort basis.

ALTER TABLE "matches" ADD COLUMN "template_size_a" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "template_size_b" integer DEFAULT 1 NOT NULL;--> statement-breakpoint

-- Backfill: count participants per side and split evenly. Almost every
-- existing match is symmetric (2v2 best ball, 1v1 singles) so dividing
-- the total participant count by 2 lands on the right number for both
-- sides without needing team-side resolution.
UPDATE "matches" m
SET "template_size_a" = sz."per_side",
    "template_size_b" = sz."per_side"
FROM (
  SELECT "match_id", GREATEST(1, COUNT(*) / 2)::int AS "per_side"
  FROM "match_participants"
  GROUP BY "match_id"
) sz
WHERE m."id" = sz."match_id";
