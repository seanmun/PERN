CREATE TYPE "public"."trip_kind" AS ENUM('trip', 'outing', 'match');--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "kind" "trip_kind" DEFAULT 'trip' NOT NULL;
