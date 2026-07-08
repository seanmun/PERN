import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  numeric,
  pgEnum,
  primaryKey,
  unique,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

export const tripRoleEnum = pgEnum('trip_role', ['trip_admin', 'player', 'viewer']);

/**
 * Kind of golf event. Drives the UI shape and the Cup-tab behavior.
 *   - trip    : multi-day, multi-round (Pinehurst). Schedule items, team Cup,
 *               cumulative leaderboard.
 *   - outing  : single day, multiple groups, one course. Live-status board.
 *   - match   : single group, 2–4 players, one round. Cup tab is the match.
 */
export const tripKindEnum = pgEnum('trip_kind', ['trip', 'outing', 'match']);

export const roundFormatEnum = pgEnum('round_format', [
  'best_ball',
  'singles',
  'scramble',
  'stroke',
  'two_man_aggregate',
  'thirty_ball',
]);

export const matchStatusEnum = pgEnum('match_status', [
  'scheduled',
  'in_progress',
  'completed',
]);

// How a match is RESOLVED, separate from how it's PLAYED (format). The same
// 2v2 best-ball can be scored match-play (UP/DOWN per hole), stroke (low
// total wins), or stableford (sum of per-hole points). Default match_play
// keeps every existing match unchanged.
export const matchScoringEnum = pgEnum('match_scoring', [
  'match_play',
  'stableford',
  'stroke',
]);

// How strokes are computed for a match, orthogonal to format AND scoring:
//   group_low : differential vs the lowest handicap in the FOURSOME
//               (the original Cup convention — default)
//   match_low : differential vs the lowest handicap in the MATCH
//   course    : full course handicap per player — trip handicap treated as
//               an index, converted via the round tee's slope/rating
export const handicapMethodEnum = pgEnum('handicap_method', [
  'group_low',
  'match_low',
  'course',
]);

export const mediaTypeEnum = pgEnum('media_type', ['image', 'video']);

export const moderationStatusEnum = pgEnum('moderation_status', [
  'approved',
  'flagged',
]);

export const tripEventTypeEnum = pgEnum('trip_event_type', [
  'flight',
  'shuttle',
  'meal',
  'social',
  'hotel_checkin',
  'hotel_checkout',
  'other',
]);

export const reactionTargetKindEnum = pgEnum('reaction_target_kind', [
  'score',
  'media',
  'text',
]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkId: text('clerk_id').unique(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  fullName: text('full_name'),
  avatarUrl: text('avatar_url'),
  ghinNumber: text('ghin_number'),
  handicap: numeric('handicap', { precision: 4, scale: 1 }),
  // Public handle for future social features (profile URLs, @mentions,
  // friend search). Stored lowercase; uniqueness enforced case-insensitively
  // via the unique index. Nullable so existing users aren't forced to pick
  // a username immediately — they can claim one on /me/edit.
  username: text('username').unique(),
  city: text('city'),
  state: text('state'),
  // The user's home club, or blank if they're a free agent.
  clubName: text('club_name'),
  // NBA-Jam-style arcade portrait, generated from the user's regular avatar.
  arcadePortraitUrl: text('arcade_portrait_url'),
  // Source photo URL used at generation time. Preserved so re-generation
  // doesn't require re-uploading even if avatarUrl later changes.
  arcadePortraitSourceUrl: text('arcade_portrait_source_url'),
  arcadePortraitGeneratedAt: timestamp('arcade_portrait_generated_at', { withTimezone: true }),
  defaultTripId: uuid('default_trip_id').references((): AnyPgColumn => trips.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const trips = pgTable('trips', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  kind: tripKindEnum('kind').default('trip').notNull(),           // trip | outing | match — drives UI defaults and Cup-tab shape
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),
  description: text('description'),
  imageUrl: text('image_url'),                                    // trip icon — shown on /me cards, trip header, etc.
  // Pre-selected handicap method for every new match on this trip.
  // Admin can still override per match in the builder.
  defaultHandicapMethod: handicapMethodEnum('default_handicap_method')
    .default('group_low')
    .notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  color: text('color'),
  captainUserId: uuid('captain_user_id').references(() => users.id),
});

export const tripMembers = pgTable('trip_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id),
  // Nullable so admins can add "shell" players who haven't been invited yet
  // (or who refused to join). When NULL, lazy-claim can't link this row
  // to a user on sign-in — it stays unclaimed until an admin sets the email.
  email: text('email'),
  teamId: uuid('team_id').references(() => teams.id),
  nickname: text('nickname').notNull(),
  avatarUrl: text('avatar_url'),                                 // trip-scoped photo (admin can set before claim)
  role: tripRoleEnum('role').default('player').notNull(),
  isCaptain: boolean('is_captain').default(false).notNull(),
  tripHandicap: numeric('trip_handicap', { precision: 4, scale: 1 }),
  scoutingReport: text('scouting_report'),
  flightArrivalAt: timestamp('flight_arrival_at', { withTimezone: true }),
  flightArrivalDetails: text('flight_arrival_details'),
  flightDepartureAt: timestamp('flight_departure_at', { withTimezone: true }),
  flightDepartureDetails: text('flight_departure_details'),
});

export const courses = pgTable('courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  location: text('location'),
  address: text('address'),                            // street address for map deep-link
  totalPar: integer('total_par'),
  imageUrl: text('image_url'),                         // landscape hero photo for match detail backgrounds
  scorecardImageUrl: text('scorecard_image_url'),      // uploaded scorecard image
  scorecardExtractedAt: timestamp('scorecard_extracted_at', { withTimezone: true }),
});

export const courseHoles = pgTable(
  'course_holes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
    holeNumber: integer('hole_number').notNull(),
    par: integer('par').notNull(),
    // Denormalized "default tee" yardage, kept in sync with the default
    // courseTee's yardage row. Existing callers still read from here.
    yardage: integer('yardage'),
    handicapIndex: integer('handicap_index').notNull(),
  },
  (t) => [unique('course_holes_course_hole_unique').on(t.courseId, t.holeNumber)]
);

// One row per tee box a course offers (Black, Blue, White, Gold, Red, etc.).
// Per-hole yardages live in courseTeeYardages.
export const courseTees = pgTable(
  'course_tees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),                                   // "Black", "Blue", "White", "Senior", etc.
    color: text('color'),                                           // #hex if shown on the card
    rating: numeric('rating', { precision: 4, scale: 1 }),          // course rating from the card, optional
    slope: integer('slope'),                                        // slope rating, optional
    totalYardage: integer('total_yardage'),                         // sum across 18 holes, optional
    displayOrder: integer('display_order').notNull(),               // 0 = longest first, ascending
    isDefault: boolean('is_default').default(false).notNull(),      // exactly one per course is the "default"
  },
  (t) => [unique('course_tees_course_name_unique').on(t.courseId, t.name)]
);

export const courseTeeYardages = pgTable(
  'course_tee_yardages',
  {
    courseTeeId: uuid('course_tee_id').references(() => courseTees.id, { onDelete: 'cascade' }).notNull(),
    holeNumber: integer('hole_number').notNull(),
    yardage: integer('yardage').notNull(),
  },
  (t) => [primaryKey({ columns: [t.courseTeeId, t.holeNumber] })]
);

export const rounds = pgTable('rounds', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseTeeId: uuid('course_tee_id').references(() => courseTees.id, { onDelete: 'set null' }),
  tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'cascade' }).notNull(),
  courseId: uuid('course_id').references(() => courses.id).notNull(),
  date: timestamp('date', { withTimezone: true }),
  format: roundFormatEnum('format').notNull(),
  order: integer('order').notNull(),
  label: text('label'),
  countsTowardCup: boolean('counts_toward_cup').default(true).notNull(),
  isHidden: boolean('is_hidden').default(false).notNull(),    // hidden from public views; used for test rounds
});

export const teeTimes = pgTable('tee_times', {
  id: uuid('id').primaryKey().defaultRandom(),
  roundId: uuid('round_id').references(() => rounds.id, { onDelete: 'cascade' }).notNull(),
  time: timestamp('time', { withTimezone: true }),
  groupNumber: integer('group_number').notNull(),
});

export const matches = pgTable('matches', {
  id: uuid('id').primaryKey().defaultRandom(),
  roundId: uuid('round_id').references(() => rounds.id, { onDelete: 'cascade' }).notNull(),
  teeTimeId: uuid('tee_time_id').references(() => teeTimes.id),
  // Format lives on the match (not the round) so a single tee time can stack
  // matches of different formats — e.g. a 2v2 Best Ball plus a 1v1 Singles
  // side bet in the same foursome. Defaults to the round's format when a new
  // match is created.
  format: roundFormatEnum('format').notNull(),
  // Per-side roster size. Denormalized from match_participants so the slot
  // validator doesn't have to recompute on every save. Same size on both
  // sides for now — no 2v4 asymmetries. See docs/match-template-spec.md.
  templateSizeA: integer('template_size_a').default(1).notNull(),
  templateSizeB: integer('template_size_b').default(1).notNull(),
  // Resolution mode — independent of format. Defaults to match_play so
  // every existing match keeps its current behavior.
  scoring: matchScoringEnum('scoring').default('match_play').notNull(),
  // Stroke-computation basis — see handicapMethodEnum. Defaults to the
  // original foursome-low convention so existing matches are unchanged.
  handicapMethod: handicapMethodEnum('handicap_method').default('group_low').notNull(),
  // Per-match stableford point overrides. Null = use the global default
  // (eagle=4, birdie=3, par=2, bogey=1, double+=0). Admin can dial these
  // per match to get Modified Stableford (5/2/0/-1/-3) or any custom
  // scale without us shipping a second algorithm.
  ptsEagle: integer('pts_eagle'),
  ptsBirdie: integer('pts_birdie'),
  ptsPar: integer('pts_par'),
  ptsBogey: integer('pts_bogey'),
  ptsDoublePlus: integer('pts_double_plus'),
  // Match points — how many cup points this match awards across its
  // three segments (overall 18 / front 9 / back 9). Defaults preserve
  // the prior "1 point per match" behavior. Admin can dial:
  //   1 / 0 / 0 — whole match only (default)
  //   0 / 1 / 1 — each nine, no overall
  //   1 / 1 / 1 — match + both nines (3 points total)
  pointsOverall: integer('points_overall').default(1).notNull(),
  pointsFront9: integer('points_front_9').default(0).notNull(),
  pointsBack9: integer('points_back_9').default(0).notNull(),
  status: matchStatusEnum('status').default('scheduled').notNull(),
  resultText: text('result_text'),
  // Per-segment winners. winningTeamId stays the overall (full-18)
  // winner for backward compatibility; the two new columns track
  // the segment winners independently — a segment closes per its own
  // hole range without killing holes for other segments.
  winningTeamId: uuid('winning_team_id').references(() => teams.id),
  front9WinningTeamId: uuid('front_9_winning_team_id').references(() => teams.id),
  back9WinningTeamId: uuid('back_9_winning_team_id').references(() => teams.id),
  isHalved: boolean('is_halved').default(false).notNull(),
});

// Explicit foursome roster — who's physically in this tee time. Decoupled
// from match participation so a player only in a round-wide cross-foursome
// match still shows on the foursome's scorecard.
export const teeTimeParticipants = pgTable(
  'tee_time_participants',
  {
    teeTimeId: uuid('tee_time_id').references(() => teeTimes.id, { onDelete: 'cascade' }).notNull(),
    tripMemberId: uuid('trip_member_id').references(() => tripMembers.id, { onDelete: 'cascade' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.teeTimeId, t.tripMemberId] })]
);

export const matchParticipants = pgTable(
  'match_participants',
  {
    matchId: uuid('match_id').references(() => matches.id, { onDelete: 'cascade' }).notNull(),
    tripMemberId: uuid('trip_member_id').references(() => tripMembers.id).notNull(),
    teamId: uuid('team_id').references(() => teams.id).notNull(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.tripMemberId] })]
);

export const holeScores = pgTable(
  'hole_scores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matchId: uuid('match_id').references(() => matches.id, { onDelete: 'cascade' }).notNull(),
    tripMemberId: uuid('trip_member_id').references(() => tripMembers.id).notNull(),
    holeNumber: integer('hole_number').notNull(),
    gross: integer('gross'),
    net: integer('net'),
    strokesReceived: integer('strokes_received').default(0).notNull(),
    // "30 Ball" only — whether this score has been selected to count
    // toward the side's 30-score budget. Meaningless/unused for every
    // other format (default false is inert for them).
    counted: boolean('counted').default(false).notNull(),
    enteredBy: uuid('entered_by').references(() => users.id),
    enteredAt: timestamp('entered_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique('hole_scores_match_player_hole_unique').on(t.matchId, t.tripMemberId, t.holeNumber)]
);

export const media = pgTable('media', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'cascade' }).notNull(),
  matchId: uuid('match_id').references(() => matches.id),
  roundId: uuid('round_id').references(() => rounds.id),
  holeNumber: integer('hole_number'),
  uploadedBy: uuid('uploaded_by').references(() => users.id).notNull(),
  url: text('url').notNull(),
  mediaType: mediaTypeEnum('media_type').notNull(),
  caption: text('caption'),
  moderationStatus: moderationStatusEnum('moderation_status').default('approved').notNull(),
  moderationReason: text('moderation_reason'),
  moderationCheckedAt: timestamp('moderation_checked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tripEvents = pgTable('trip_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'cascade' }).notNull(),
  type: tripEventTypeEnum('type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  location: text('location'),                          // human-readable name, e.g. "Pinehurst No. 2 Clubhouse"
  address: text('address'),                            // full street address for map deep-link
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tripInvites = pgTable('trip_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'cascade' }).notNull(),
  code: text('code').notNull().unique(),                           // short, lower-case URL-safe (e.g. "xyz123")
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  note: text('note'),                                              // admin-facing label ("for Dave", etc.)
  usesAllowed: integer('uses_allowed'),                            // null = unlimited
  usesCount: integer('uses_count').default(0).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),      // null = never
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const reactions = pgTable(
  'reactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    targetKind: reactionTargetKindEnum('target_kind').notNull(),
    targetId: uuid('target_id').notNull(),
    emoji: text('emoji').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('reactions_user_target_emoji_unique').on(
      t.userId,
      t.targetKind,
      t.targetId,
      t.emoji
    ),
  ]
);

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'cascade' }).notNull(),
  authorId: uuid('author_id').references(() => users.id).notNull(),
  body: text('body').notNull(),
  pinnedByCaptain: boolean('pinned_by_captain').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
