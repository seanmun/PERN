-- Retroactive record. This SQL was applied to prod by hand (Neon SQL
-- editor) alongside the 30 Ball feature but was never captured as a
-- migration file — 0030 reads "counted" and schema.ts declares both.
-- Committed so a clean replay of this folder works end to end.
--
-- ALREADY APPLIED TO PROD — do not run there again. Both statements
-- are idempotent-guarded regardless.

-- 30 Ball format value (schema.ts round_format includes it; no prior
-- migration ever added it to the Postgres enum).
ALTER TYPE "round_format" ADD VALUE IF NOT EXISTS 'thirty_ball';

-- Per-score selection flag: which of the side's 54 scores count toward
-- the 30-score budget.
ALTER TABLE "hole_scores" ADD COLUMN IF NOT EXISTS "counted" boolean DEFAULT false NOT NULL;
