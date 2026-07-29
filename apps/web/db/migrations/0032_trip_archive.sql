-- Archive support for trips/outings/matches. Null = live; set = archived
-- (hidden from home, restorable anytime — nothing is deleted).
-- Applied via the Neon SQL editor per house workflow.
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "archived_at" timestamptz;
