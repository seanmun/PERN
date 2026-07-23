-- 30 Ball commit-and-lock. A side's per-hole ball selection becomes an
-- explicit, irreversible act: after entering grosses the side taps
-- "Commit scores", picks 0-3 to count toward their 30, and the hole
-- locks. committed_at is stamped on ALL of the side's rows for that
-- hole (counted or not) — null means the side hasn't decided yet, which
-- is distinct from "decided to burn zero balls".
-- Backfill: selections made under the old free-toggle UI stay counted
-- and become locked, matching the new semantics.
-- Applied via the Neon SQL editor per house workflow.

ALTER TABLE "hole_scores" ADD COLUMN "committed_at" timestamp with time zone;

UPDATE "hole_scores" SET "committed_at" = "entered_at" WHERE "counted" = true;
