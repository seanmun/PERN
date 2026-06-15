-- Explicit foursome roster. Before this, "who's in foursome 1" was
-- derived from match participation, so a player in only a round-wide
-- cross-foursome match (tee_time_id = NULL) appeared in no foursome
-- at all — and the foursome scorecard rendered fewer than 4 rows.
--
-- After: every foursome has its own player list, independent of any
-- match. The scorecard reads this. Matches still drive results.

CREATE TABLE "tee_time_participants" (
  "tee_time_id" uuid NOT NULL REFERENCES "tee_times"("id") ON DELETE CASCADE,
  "trip_member_id" uuid NOT NULL REFERENCES "trip_members"("id") ON DELETE CASCADE,
  PRIMARY KEY ("tee_time_id", "trip_member_id")
);--> statement-breakpoint

-- Backfill from existing match participants. Any trip member who's in
-- ANY match with tee_time_id = X is treated as being in foursome X.
-- This preserves existing app state — Pinehurst's per-foursome 2v2s
-- already implicitly assigned their 4 players. After this migration,
-- admin can add the players who were ONLY in round-wide matches to
-- the right foursome via the UI.
INSERT INTO "tee_time_participants" ("tee_time_id", "trip_member_id")
SELECT DISTINCT m."tee_time_id", mp."trip_member_id"
FROM "matches" m
INNER JOIN "match_participants" mp ON mp."match_id" = m."id"
WHERE m."tee_time_id" IS NOT NULL
ON CONFLICT DO NOTHING;
