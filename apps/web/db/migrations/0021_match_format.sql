ALTER TABLE "matches" ADD COLUMN "format" "round_format";--> statement-breakpoint
UPDATE "matches" SET "format" = "rounds"."format" FROM "rounds" WHERE "matches"."round_id" = "rounds"."id";--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "format" SET NOT NULL;
