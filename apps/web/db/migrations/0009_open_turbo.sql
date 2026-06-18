CREATE TYPE "public"."moderation_status" AS ENUM('approved', 'flagged');--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "moderation_status" "moderation_status" DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "moderation_reason" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "moderation_checked_at" timestamp with time zone;