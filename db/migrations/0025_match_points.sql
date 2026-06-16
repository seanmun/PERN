-- Match points system. Every match can award up to 3 separate point
-- values: overall (full 18), front 9 winner, back 9 winner. Defaults
-- preserve current behavior — 1 point for the overall winner only.
--
-- The two new winning-team columns store the segment winners so cup
-- standings and the leaderboard can credit each segment independently
-- once it closes.

ALTER TABLE "matches" ADD COLUMN "points_overall" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "points_front_9" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "points_back_9" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

ALTER TABLE "matches" ADD COLUMN "front_9_winning_team_id" uuid REFERENCES "teams"("id");--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "back_9_winning_team_id" uuid REFERENCES "teams"("id");
