ALTER TABLE "trip_members" ADD COLUMN "flight_arrival_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trip_members" ADD COLUMN "flight_arrival_details" text;--> statement-breakpoint
ALTER TABLE "trip_members" ADD COLUMN "flight_departure_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trip_members" ADD COLUMN "flight_departure_details" text;