# Schema

The data model. Drop-in Drizzle code below, with notes on intent for each table.

## Conventions

- All IDs are `uuid` (default random).
- All timestamps are `timestamp with timezone`, defaulting to `now()`.
- Soft deletes are deliberately avoided — the app is small enough that hard delete + audit log (later) is cleaner.
- `users` is global to the platform. Everything else is trip-scoped via `trip_id`.
- Handicaps stored as `numeric(4,1)` — Drizzle returns these as strings to preserve precision. Do not naively `parseFloat`; route them through the scoring engine.

## Entity overview

```
User ─────┬──────────┐
          │          │
          ▼          ▼
       TripMember   Trip ────┬──── Team ── Round ── TeeTime
          │ (captain_of)     │       │       │       │
          └──────────────────┘       │       │       │
                                     │       │       ▼
                                     │       └──── Match ── HoleScore
                                     │              │       │
                                     ├──── Media ───┘       │
                                     │                      │
                                     └──── Message          │
                                                            │
                                                  (via MatchParticipant)
```

## Drizzle schema

```ts
// db/schema.ts
import {
  pgTable, uuid, text, timestamp, integer, boolean, numeric,
  pgEnum, primaryKey,
} from 'drizzle-orm/pg-core';

// ============ ENUMS ============

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

// ============ USERS (global) ============

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkId: text('clerk_id').unique(),                              // null until claimed
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  fullName: text('full_name'),
  avatarUrl: text('avatar_url'),
  ghinNumber: text('ghin_number'),
  handicap: numeric('handicap', { precision: 4, scale: 1 }),       // e.g. "16.5"
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
// platform_admin is determined by PLATFORM_ADMIN_EMAILS env var, not stored.

// ============ TRIPS ============

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

// ============ TEAMS ============

export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  color: text('color'),                                            // hex e.g. "#1d4ed8"
  captainUserId: uuid('captain_user_id').references(() => users.id),
});

// ============ TRIP MEMBERS (lazy-claim roster) ============

export const tripMembers = pgTable('trip_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id),              // null until claimed
  email: text('email').notNull(),                                  // lazy-claim binds via email
  teamId: uuid('team_id').references(() => teams.id),
  nickname: text('nickname').notNull(),
  role: tripRoleEnum('role').default('player').notNull(),
  isCaptain: boolean('is_captain').default(false).notNull(),
  tripHandicap: numeric('trip_handicap', { precision: 4, scale: 1 }), // override for this trip
  scoutingReport: text('scouting_report'),                         // captain-authored, optional
});

// ============ COURSES ============

export const courses = pgTable('courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  location: text('location'),
  address: text('address'),                    // street address for map deep-link
  latitude: doublePrecision('latitude'),       // distance-sort in course pickers
  longitude: doublePrecision('longitude'),
  externalSource: text('external_source'),     // e.g. 'golfcourseapi'
  externalId: text('external_id'),             // id within that source; (source, id) unique — dedupes re-imports
  totalPar: integer('total_par'),
  imageUrl: text('image_url'),
  scorecardImageUrl: text('scorecard_image_url'),
  scorecardExtractedAt: timestamp('scorecard_extracted_at', { withTimezone: true }),
});

// Platform-level starred courses — keyed to users, not trip_members,
// so favorites follow the user across trips. (user_id, course_id) unique.
export const courseFavorites = pgTable('course_favorites', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const courseHoles = pgTable('course_holes', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  holeNumber: integer('hole_number').notNull(),                    // 1–18
  par: integer('par').notNull(),
  yardage: integer('yardage'),
  handicapIndex: integer('handicap_index').notNull(),              // 1–18; 1 = hardest
});

// ============ ROUNDS ============

export const rounds = pgTable('rounds', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'cascade' }).notNull(),
  courseId: uuid('course_id').references(() => courses.id).notNull(),
  date: timestamp('date', { withTimezone: true }),
  format: roundFormatEnum('format').notNull(),
  order: integer('order').notNull(),                               // 1, 2, 3...
  label: text('label'),                                            // "Friday Morning", "Sat AM Singles"
  countsTowardCup: boolean('counts_toward_cup').default(true).notNull(),
});

// ============ TEE TIMES ============

export const teeTimes = pgTable('tee_times', {
  id: uuid('id').primaryKey().defaultRandom(),
  roundId: uuid('round_id').references(() => rounds.id, { onDelete: 'cascade' }).notNull(),
  time: timestamp('time', { withTimezone: true }),
  groupNumber: integer('group_number').notNull(),                  // 1, 2, 3 per round
});

// ============ MATCHES ============

export const matches = pgTable('matches', {
  id: uuid('id').primaryKey().defaultRandom(),
  roundId: uuid('round_id').references(() => rounds.id, { onDelete: 'cascade' }).notNull(),
  teeTimeId: uuid('tee_time_id').references(() => teeTimes.id),
  status: matchStatusEnum('status').default('scheduled').notNull(),
  resultText: text('result_text'),                                 // "3&2" | "AS" | "1UP"
  winningTeamId: uuid('winning_team_id').references(() => teams.id), // null for halved
  isHalved: boolean('is_halved').default(false).notNull(),
});

// Many-to-many: trip_members participating in a match (handles 2v2 and 1v1).
export const matchParticipants = pgTable('match_participants', {
  matchId: uuid('match_id').references(() => matches.id, { onDelete: 'cascade' }).notNull(),
  tripMemberId: uuid('trip_member_id').references(() => tripMembers.id).notNull(),
  teamId: uuid('team_id').references(() => teams.id).notNull(),    // which team they represent
}, (t) => ({
  pk: primaryKey({ columns: [t.matchId, t.tripMemberId] }),
}));

// ============ HOLE SCORES ============

export const holeScores = pgTable('hole_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  matchId: uuid('match_id').references(() => matches.id, { onDelete: 'cascade' }).notNull(),
  tripMemberId: uuid('trip_member_id').references(() => tripMembers.id).notNull(),
  holeNumber: integer('hole_number').notNull(),
  gross: integer('gross'),
  net: integer('net'),
  strokesReceived: integer('strokes_received').default(0).notNull(),
  enteredBy: uuid('entered_by').references(() => users.id),
  enteredAt: timestamp('entered_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============ MEDIA (stub for v2 — hole-tagged photos/videos) ============

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

// ============ MESSAGES (stub for v2 — trash talk feed) ============

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'cascade' }).notNull(),
  authorId: uuid('author_id').references(() => users.id).notNull(),
  body: text('body').notNull(),
  pinnedByCaptain: boolean('pinned_by_captain').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

## Notes by table

- **users** — Global. Created by Clerk webhook. `clerk_id` and `email` are the join keys for lazy-claim.
- **trips** — Top-level container. v1 has exactly one row (Pinehurst).
- **teams** — Trip-scoped. Pinehurst has two (MachIans, Douchebags).
- **trip_members** — The roster. Acts as both the "player slot" (lazy-claim) and the per-trip identity (nickname, handicap override, team, captain status). Every score and match references `trip_member_id`, not `user_id`, because *a player on this trip* is a trip-scoped concept.
- **courses + course_holes** — `handicap_index` per hole is *critical* for net match play stroke allocation. Seed from official scorecards.
- **rounds** — 6 per Pinehurst trip (5 cup + 1 fun scramble). `counts_toward_cup` flag distinguishes them.
- **matches** — Status + result. `result_text` is the human-readable "3&2"; cup points are derived (1 for win, 0.5 each for halved). Stored fields are `winningTeamId` and `isHalved`.
- **match_participants** — Many-to-many between a match and the trip members playing in it. `team_id` says which side they represent. Handles 2v2, 1v1, and (if needed later) larger formats.
- **hole_scores** — The atomic unit. `strokesReceived` is computed at match start from handicap differential + course hole stroke index. Net = gross − strokesReceived.
- **media** and **messages** — Stubbed for v2. Tables exist now so we don't need a migration when those features ship.

## Migrations

Single initial file: `0001_init.sql` (generated by `drizzle-kit generate`).

Seed file: `db/seed.ts` — populates the Pinehurst trip, teams, 12 trip_members, 4 courses, 6 rounds, tee times, fixed matchups. See [`pinehurst.md`](./pinehurst.md) for the source data.
