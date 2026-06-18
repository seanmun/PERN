ALTER TABLE "users" ADD COLUMN "arcade_portrait_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "arcade_portrait_source_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "arcade_portrait_generated_at" timestamp with time zone;