-- Trip-level default for matches.handicap_method. The match builder
-- pre-selects this for every new match on the trip; admin can still
-- override per match. Reuses the handicap_method enum from 0027.
-- Applied via the Neon SQL editor per house workflow.

ALTER TABLE "trips" ADD COLUMN "default_handicap_method" "handicap_method" DEFAULT 'group_low' NOT NULL;
