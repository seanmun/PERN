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

export const tripRoleEnum = pgEnum('trip_role', ['trip_admin', 'player']);

export const roundFormatEnum = pgEnum('round_format', [
  'match_play_2v2',
  'singles',
  'scramble',
  'stroke',
]);

export const matchStatusEnum = pgEnum('match_status', [
  'scheduled',
  'in_progress',
  'completed',
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
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),
  description: text('description'),
  imageUrl: text('image_url'),                                    // trip icon — shown on /me cards, trip header, etc.
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
  status: matchStatusEnum('status').default('scheduled').notNull(),
  resultText: text('result_text'),
  winningTeamId: uuid('winning_team_id').references(() => teams.id),
  isHalved: boolean('is_halved').default(false).notNull(),
});

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
