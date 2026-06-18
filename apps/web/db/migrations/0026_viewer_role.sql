-- Viewer role — a trip member who can read the cup tab, schedule, and
-- match detail but can't enter scores. Useful for spouses, guests, and
-- followers who get invited to the BuddyCup event without playing.

ALTER TYPE "public"."trip_role" ADD VALUE 'viewer';
