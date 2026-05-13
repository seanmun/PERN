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
  email: text('email').notNull(),
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
  totalPar: integer('total_par'),
  imageUrl: text('image_url'),                         // landscape hero photo for match detail backgrounds
});

export const courseHoles = pgTable('course_holes', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  holeNumber: integer('hole_number').notNull(),
  par: integer('par').notNull(),
  yardage: integer('yardage'),
  handicapIndex: integer('handicap_index').notNull(),
});

export const rounds = pgTable('rounds', {
  id: uuid('id').primaryKey().defaultRandom(),
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
