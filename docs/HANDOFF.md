# BuddyCup — Full Project Documentation

**Written as a standalone handoff.** It assumes no prior context and no
particular tooling. Everything below was read out of the source or queried
from the live database on 2026-07-30, not recalled from memory.

Repo: `github.com/seanmun/PERN` · Production: `https://buddycup.golf` ·
Branch `main` auto-deploys to Vercel.

---

## 1. What the app is

A multi-tenant golf-trip app. A group of friends creates an *event*, adds
players, splits them into two teams, groups them into foursomes, builds
matchups, and enters scores hole by hole. The app computes match results,
a running team scoreboard ("the Cup"), and an individual leaderboard.

Three event kinds exist (`trips.kind`):

| Kind | Rounds | Courses | Days | Groups |
|---|---|---|---|---|
| `match` | 1 | 1 | 1 | 1 |
| `outing` | 1 | 1 | 1 | 2+ |
| `trip` | 2+ | 1+ | 1+ | any |

**Important:** nothing in the codebase behaves differently for `match` vs
`outing`. All seven branch points either group them together
(`kind === 'outing' || kind === 'match'`) or ask "is it a trip?". The only
place the difference is visible to a user is a badge in
`app/trips/[slug]/layout.tsx` that prints the raw word.

The flagship real event is the **Pinehurst Cup 2026** (§8).

---

## 2. Services and external dependencies

Every third-party service, what it does, and the env var that configures
it. All env vars live in `apps/web/.env.local` (git-ignored); the template
is `apps/web/.env.example`.

| Service | Purpose | Env vars |
|---|---|---|
| **Clerk** | Auth — magic-link only. No passwords, no OAuth providers. Also sends `user.created` webhooks used for lazy-claiming shell player rows. | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`, `NEXT_PUBLIC_CLERK_FALLBACK_REDIRECT_URL`, `CLERK_WEBHOOK_SIGNING_SECRET` |
| **Neon** | Postgres database, serverless driver over HTTP. | `DATABASE_URL` |
| **Vercel** | Hosting + CI. `main` auto-deploys to production. | — |
| **Vercel Blob** | File storage for uploaded avatars, scorecard images, feed media. Package `@vercel/blob`. | Vercel-managed token |
| **Anthropic (Claude)** | AI extraction of course scorecard images into per-hole par / yardage / handicap-index rows. Package `@anthropic-ai/sdk`. | `ANTHROPIC_API_KEY` |
| **OpenAI** | Generates NBA-Jam-style "arcade portraits" from player avatars via `gpt-image-1`. Package `openai`. | `OPENAI_API_KEY` |
| **Resend** | Transactional email — player invites. Verified sending domain `mail.buddycup.golf`. | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME` |
| **Google Places** | Golf-course search / autofill in the new-course form. | `GOOGLE_PLACES_API_KEY` |
| **golfcourseapi.com** | One-tap course + scorecard import. Optional — the course-database search UI hides itself when unset. Free tier: 50 requests/day. | `GOLF_COURSE_API_KEY` |

Other config:

- `PLATFORM_ADMIN_EMAILS` — comma-separated, no spaces. Grants godmode
  across all trips.
- `NEXT_PUBLIC_APP_URL` — public origin used to build invite links, no
  trailing slash.

### Key libraries

`next@16.2.6` (App Router, Turbopack) · `react@19.2.4` ·
`drizzle-orm@0.45.2` · `@tanstack/react-query@5` (polling, no websockets) ·
`framer-motion@12` · `@dnd-kit/*` (drag-and-drop) · `lucide-react` (icons) ·
`sharp` + `browser-image-compression` (image processing) ·
`@react-email/*` (invite email templates) · Tailwind v4.

---

## 3. Repo layout

npm workspaces monorepo. **Do not reintroduce pnpm** — it was removed
because Vercel builds were unwinnable (commit `07fc00b`).

```
apps/web/                  the entire Next.js app
  app/                     App Router routes
  components/              React components, organised BY SCREEN (see §10)
  db/schema.ts             Drizzle schema — the source of truth
  db/migrations/           34 generated SQL migrations
  lib/actions/             server actions (mutations)
  lib/data/                query/loader modules (reads)
  lib/auth/                permission helpers
  lib/scoring/             app-side glue: recompute + persistence
  scripts/                 one-off maintenance scripts (tsx)
  tests/                   vitest — 149 tests, ALL against packages/scoring
packages/scoring/          pure TS scoring engine, framework-free
docs/                      this file and the specs below
```

### Existing docs

`product.md` (vision, principles) · `architecture.md` (stack, roles,
multi-tenancy) · `schema.md` (data model) · `pinehurst.md` (trip seed data) ·
`event-setup-spec.md` (setup domain rules) · `match-template-spec.md`
(format registry design) · `backlog.md` · `arcade-portraits.md` ·
`email-tokens.md` · `marketing-page-spec.md` · `mobile-app-plan.md` ·
`multi-tenant-unlock.md` · `session-failures-2026-07.md` (blunt record of
what a prior AI session got wrong — worth reading before touching setup).

### Conventions

- Directories `kebab-case`, components `PascalCase.tsx`, utilities `camelCase.ts`.
- **Migrations are applied by pasting SQL into the Neon SQL editor**, never
  `db:migrate`, and must be applied BEFORE any code depending on them is
  pushed, because `main` auto-deploys.
- The schema is the source of truth; the DB is downstream. Never regenerate
  the schema from the database.
- All trip-scoped queries must filter by `trip_id`.
- All permission checks go through `lib/auth/permissions.ts`. Never inline.
- Handicaps are `numeric` and Drizzle returns them as **strings**. Don't
  `parseFloat` casually — pass them to the scoring engine.
- No row-level security. Permission lives in the application layer.

---

## 4. Database schema

21 tables, 10 enums. Every column below is real.

### Enums

| Enum | Values |
|---|---|
| `trip_role` | `trip_admin`, `player`, `viewer` |
| `trip_kind` | `trip`, `outing`, `match` |
| `round_format` | `best_ball`, `singles`, `scramble`, `stroke`, `two_man_aggregate`, `thirty_ball`, `bingo_bango_bongo` |
| `match_status` | `scheduled`, `in_progress`, `completed` |
| `match_scoring` | `match_play`, `stableford`, `stroke` |
| `handicap_method` | `group_low`, `match_low`, `course` |
| `media_type` | `image`, `video` |
| `moderation_status` | `approved`, `flagged` |
| `trip_event_type` | `flight`, `shuttle`, `meal`, `social`, `hotel_checkin`, `hotel_checkout`, `other` |
| `reaction_target_kind` | `score`, `media`, `text` |

> **Note:** `alternate_shot` exists in the code's format registry
> (`packages/scoring/formats.ts`) but **NOT** in the `round_format` enum, so
> it can never be saved. It needs a migration adding the enum value before
> it can be offered anywhere.

### Identity and tenancy

**`users`** — platform-level identity, one per human.
`id`, `clerk_id` (unique), `email` (unique, notNull), `display_name`,
`full_name`, `avatar_url`, `ghin_number`, `handicap` numeric(4,1),
`username` (unique, lowercase), `city`, `state`, `club_name`,
`arcade_portrait_url`, `arcade_portrait_source_url`,
`arcade_portrait_generated_at`, `default_trip_id` → trips,
`created_at`, `updated_at`.

**`trips`** — one event (of any kind).
`id`, `slug` (unique), `name`, `kind` (trip_kind, default `trip`),
`start_date`, `end_date`, `description`, `image_url`,
`default_handicap_method` (default `group_low`), `archived_at`
(nullable — archiving hides without deleting), `created_by` → users,
`created_at`.

**`teams`** — exactly two per trip in practice.
`id`, `trip_id` → trips (cascade), `name`, `color` (#hex),
`captain_user_id` → users.

**`trip_members`** — a person's participation in one trip. The central table.
`id`, `trip_id` → trips (cascade), `user_id` → users (**nullable** — "shell"
players who haven't signed up yet), `email` (nullable; when null, lazy-claim
can't link this row), `team_id` → teams, `nickname` (notNull), `avatar_url`
(trip-scoped photo), `role` (trip_role, default `player`), `is_captain`,
`trip_handicap` numeric(4,1), `scouting_report`, `flight_arrival_at`,
`flight_arrival_details`, `flight_departure_at`, `flight_departure_details`.

**`trip_invites`** — shareable join codes.
`id`, `trip_id`, `code` (unique, short URL-safe), `created_by`, `note`,
`uses_allowed` (null = unlimited), `uses_count`, `expires_at` (null = never),
`created_at`.

### Courses

**`courses`** — `id`, `name`, `location`, `address`, `latitude`,
`longitude`, `external_source` (e.g. `golfcourseapi`), `external_id`,
`total_par`, `image_url`, `scorecard_image_url`, `scorecard_extracted_at`.
Unique index on (`external_source`, `external_id`) to dedupe re-imports.

**`course_favorites`** — user-level starred courses, follow the user across
trips. Unique on (`user_id`, `course_id`).

**`course_holes`** — `id`, `course_id`, `hole_number`, `par`, `yardage`
(denormalised from the default tee), `handicap_index`. Unique on
(`course_id`, `hole_number`).

**`course_tees`** — one row per tee box. `id`, `course_id`, `name`
("Black", "Blue"…), `color`, `rating` numeric(4,1), `slope`,
`total_yardage`, `display_order`, `is_default`. Unique on
(`course_id`, `name`).

**`course_tee_yardages`** — per-hole yardage per tee. PK
(`course_tee_id`, `hole_number`), plus `yardage`.

### Play structure

**`rounds`** — one round of golf within a trip.
`id`, `trip_id` (cascade), `course_id` (notNull), `course_tee_id`
(set null), `date`, `format` (round_format, notNull), `order` (notNull),
`label`, `counts_toward_cup` (default true), `is_hidden` (default false —
used for test rounds).

**`tee_times`** — **this table doubles as the GROUP/foursome table.**
`id`, `round_id` (cascade), `time` (nullable — "TBD"), `group_number`
(notNull).

> This conflation is load-bearing and is the root of several bugs. There is
> no separate `groups` table: `group_number` lives on `tee_times`, so a
> foursome cannot exist without a tee-time row even when no time is set.
> The whole schedule is keyed on tee times as a result.

**`tee_time_participants`** — who is in which foursome. (`tee_time_id`,
`trip_member_id`). Capped at 4 by application logic
(`updateTeeTimeRoster` throws above 4).

**`matches`** — a single contest inside a round.
`id`, `round_id` (cascade, notNull), `tee_time_id` (**nullable** — null
means the match spans groups, e.g. a 3v3 30 Ball), `format`
(round_format — lives on the match, not the round, so one foursome can
stack a Best Ball plus a Singles side bet), `template_size_a`,
`template_size_b` (per-side roster size, denormalised), `scoring`
(match_scoring, default `match_play`), `handicap_method` (default
`group_low`), `pts_eagle`/`pts_birdie`/`pts_par`/`pts_bogey`/
`pts_double_plus` (nullable stableford overrides), `points_overall`
(default 1), `points_front_9` (default 0), `points_back_9` (default 0),
`status`, `result_text`, `winning_team_id`, `front_9_winning_team_id`,
`back_9_winning_team_id`, `is_halved`.

**`match_participants`** — PK (`match_id`, `trip_member_id`), plus
`team_id` (notNull) which determines the side.

### Scores

**`hole_scores`** — `id`, `match_id` (cascade), `trip_member_id`,
`hole_number`, `gross`, `net`, `strokes_received` (default 0), `counted`
(30 Ball only — whether this score counts toward the side's 30-score
budget), `committed_at` (30 Ball only — locks the hole), `entered_by`,
`entered_at`. Unique on (`match_id`, `trip_member_id`, `hole_number`).

> Scores hang off a **match**. A player on a foursome roster who is in no
> match has nowhere to store a score — the app disables entry for them
> explicitly.

**`bbb_hole_points`** — Bingo Bango Bongo. Row existence *is* the commit.
`id`, `match_id` (cascade), `hole_number`, `bingo_trip_member_id`,
`bango_trip_member_id`, `bongo_trip_member_id` (each nullable = washed),
`committed_by`, `committed_at`. Unique on (`match_id`, `hole_number`).

### Social

**`media`** — `id`, `trip_id`, `match_id`, `round_id`, `hole_number`,
`uploaded_by`, `url`, `media_type`, `caption`, `moderation_status`,
`moderation_reason`, `moderation_checked_at`, `created_at`.

**`trip_events`** — non-golf itinerary items (flights, meals, hotel).
`id`, `trip_id`, `type`, `title`, `description`, `location`, `address`,
`start_time` (notNull), `end_time`, `created_at`, `updated_at`.

**`reactions`** — `id`, `user_id`, `target_kind`, `target_id`, `emoji`,
`created_at`. Unique on (user, kind, target, emoji).

**`messages`** — `id`, `trip_id`, `author_id`, `body`,
`pinned_by_captain`, `created_at`.

---

## 5. The scoring engine

`packages/scoring/` — pure functions, no DB, no React, so a future mobile
app can share it. This is the most algorithmically important and the most
trustworthy code in the repo. All 149 tests target it.

| File | Contents |
|---|---|
| `formats.ts` | `FORMAT_META` — the format registry (see below) |
| `engine.ts` | `computeMatch`, `computeStrokePlayMatch`, `computeThirtyBallMatch`, `computeBingoBangoBongo`, `computeStrokes`, status formatters |
| `handicap.ts` | `toCourseHandicap`, `allocateCourseStrokes`, `hasCourseRating` |
| `team-split.ts` | `autoSplitByHandicap` — snake draft in groups of 4 |
| `lineup.ts` | `deriveLineup`, `preferredSideSize` (added 2026-07-30, §9) |
| `validation/match-builder.ts` | `validateBuilderState`, `getMatchTeeTimeId`, `canDropOnSide` — the same rules run client-side (to grey out drop targets) and server-side (to refuse bad writes) |

App-side glue lives in `apps/web/lib/scoring/` (recompute + persistence).

### The format registry — `FORMAT_META`

Every format declares its legal side sizes, its foursome constraints, and
how scores are recorded. **This is the single source of truth for lineup
rules**, and everything downstream keys off these flags.

| Format | Side sizes | Same foursome per side | ALL in one foursome | Input |
|---|---|---|---|---|
| `singles` | 1 | no | no | individual |
| `best_ball` | 2, 3, 4 | no | no | individual |
| `two_man_aggregate` | 2 | **yes** | no | individual |
| `scramble` | 2, 3, 4 | **yes** | no | **team** |
| `alternate_shot` | 2 | **yes** | no | **team** | *(unsavable — see §4)* |
| `stroke` | 1, 2, 3, 4 | no | no | individual |
| `thirty_ball` | 3 | **yes** | no | individual |
| `bingo_bango_bongo` | 1, 2 | **yes** | **yes** | individual |

- `inputMode: 'team'` means the side records ONE gross per hole; there is
  no per-player gross. Only match-play resolution is implemented for these.
- `requiresSingleFoursome` is true only for BBB, because its points are
  awarded by the group watching each other's shots — a split match is
  physically unplayable.
- 30 Ball and BBB are resolved by bespoke functions in `engine.ts`, not the
  generic engines. `recompute.ts` handles them before the `scoring` column
  is ever consulted.

### Handicap methods

- `group_low` — strokes vs the lowest handicap in the **foursome**. The
  house default and the original Cup convention.
- `match_low` — strokes vs the lowest handicap in the **match**.
- `course` — full course handicap per player; the trip handicap is treated
  as an index and converted through the tee's slope/rating.

---

## 6. Permission model

Resolution always cascades: **platform → trip → captain → self.**

| Role | Source | Can do |
|---|---|---|
| `platform_admin` | env `PLATFORM_ADMIN_EMAILS` | godmode across all trips |
| `trip_admin` | `trip_members.role = 'trip_admin'` | full control of own trip |
| Captain | `trip_members.is_captain = true` | edit own team, set TBD matchups, pick scramble teams |
| Player | `trip_members.role = 'player'` | view, enter own scores, edit own profile |
| Viewer | `trip_members.role = 'viewer'` | read-only |

Helpers in `lib/auth/permissions.ts`: `isPlatformAdmin`, `isTripAdminOf`,
`isCaptainOf`, `isAnyCaptainOnTrip`, `isSelfTripMember`, `membershipOn`,
`canViewTrip`, `canViewTripId`, `canEditTrip`, `canEditTeam`,
`canEditTripMember`, `canEnterScoreFor`, `requireAuth`,
`requirePlatformAdmin`, `requireTripAdmin`.

---

## 7. App surface

### Public / platform

`/` · `/about` · `/brand` · `/privacy` · `/documentation` · `/home` ·
`/home/past-trips` · `/me` · `/sign-in/[[...sign-in]]` ·
`/sign-up/[[...sign-up]]`

### Event creation — note there are two competing flows

**Multi-step wizard (original):** `/trips/new` → `/trips/new/course` →
`/trips/new/details`, continuing into `/trips/[slug]/setup/*`.

**Single-page form (new, see §9):** `/trips/new/event`

### Per-trip

`/trips/[slug]` · `/schedule` · `/scoreboard` · `/scoreboard/leaderboard` ·
`/feed` · `/me` · `/me/edit` · `/profile/[id]` · `/teams/[id]` ·
`/matches/new` · `/matches/[id]` · `/matches/[id]/edit` ·
`/matches/[id]/score` · `/matches/[id]/quick-result` ·
`/tee-times/[id]/score` · `/events/new` · `/events/[id]` ·
`/events/[id]/edit`

**Setup wizard (6):** `/setup/details` · `/setup/players` · `/setup/teams` ·
`/setup/groups` · `/setup/matches` · `/setup/review`

**Admin (14):** `/admin` · `/admin/details` · `/admin/players` ·
`/admin/players/new` · `/admin/players/[id]/edit` · `/admin/teams` ·
`/admin/rounds` · `/admin/rounds/new` · `/admin/rounds/[id]/edit` ·
`/admin/tee-times/new` · `/admin/tee-times/[id]/edit` · `/admin/courses` ·
`/admin/courses/new` · `/admin/courses/[id]/edit`

### API routes

`/api/course-db/search` · `/api/places/golf-courses` ·
`/api/places/golf-courses/[placeId]` · `/api/upload`

---

## 8. Pinehurst Cup 2026 — full data

Queried live on 2026-07-30. Slug **`pcup26`**, kind `trip`, not archived.

> *"Ryder-Cup-style match-play competition at Pinehurst, NC."*
> **19–22 August 2026.**

### Teams

| Team | Colour |
|---|---|
| **MachIans** | `#14532d` (green) |
| **Douchebags** | `#ca8a04` (gold) |

### Players (12, all claimed)

| Nickname | Hcp | Team | Role | Captain | Email |
|---|---|---|---|---|---|
| Andy | 16.1 | MachIans | player | | andrewcroyle@gmail.com |
| Carty | 13.2 | MachIans | player | | nickjcarty@gmail.com |
| Fran | 25.1 | MachIans | player | | fsedgwick18@gmail.com |
| **Ian** | 10.1 | MachIans | trip_admin | ★ | iancassl@gmail.com |
| Munley | 24.4 | MachIans | trip_admin | | smunley13@gmail.com |
| Truant | 16.9 | MachIans | player | | stevetruant@gmail.com |
| **DS** | 13.0 | Douchebags | trip_admin | ★ | dps1343@gmail.com |
| Kyle | 16.9 | Douchebags | player | | kyle.feiser@gmail.com |
| Lusty | 16.2 | Douchebags | player | | lusty.gregory@gmail.com |
| Mallon | 25.1 | Douchebags | player | | tmallon1014@gmail.com |
| Marino | 10.5 | Douchebags | player | | matt@kyndrealtors.com |
| Musket | 20.8 | Douchebags | player | | matthewmuscarella1@gmail.com |

Six a side. Team handicap totals: MachIans 105.8, Douchebags 102.5.

### Schedule

Times shown in **EDT (UTC-4)**, converted from the UTC values stored.

---

#### R1 — Wed 19 Aug · Pine Needles · Best Ball (2v2)

| Group | Tee | Players |
|---|---|---|
| 1 | 2:30 PM | Musket, Mallon, Carty, Andy |
| 2 | 2:40 PM | Marino, Fran, Truant, DS |
| 3 | 2:50 PM | Munley, Ian, Kyle, Lusty |

| Matchup | Status |
|---|---|
| Douchebags: Musket + Mallon **vs** MachIans: Carty + Andy | scheduled |
| MachIans: Truant + Fran **vs** Douchebags: DS + Marino | scheduled |
| MachIans: Ian + Munley **vs** Douchebags: Lusty + Kyle | **completed — 4 & 3** |

---

#### R2 — Thu 20 Aug · Tobacco Road · Best Ball (2v2)

| Group | Tee | Players |
|---|---|---|
| 1 | 8:00 AM | Carty, Mallon, Ian, DS |
| 2 | 8:12 AM | Truant, Kyle, Marino, Munley |
| 3 | 8:25 AM | Andy, Musket, Lusty, Fran |

| Matchup |
|---|
| MachIans: Ian + Carty **vs** Douchebags: DS + Mallon |
| MachIans: Truant + Munley **vs** Douchebags: Marino + Kyle |
| Douchebags: Musket + Lusty **vs** MachIans: Andy + Fran |

---

#### R7 — Thu 20 Aug · The Cradle · Stroke

| Group | Tee | Players |
|---|---|---|
| 1 | 3:20 PM | *(empty)* |
| 2 | 3:30 PM | *(empty)* |
| 3 | 3:40 PM | *(empty)* |

No players assigned, no matches. (The Cradle is a 9-hole short course.)

---

#### R3 — Fri 21 Aug · Pinehurst No. 2 · Best Ball (2v2)

| Group | Tee | Players |
|---|---|---|
| 1 | 7:00 AM | Kyle, DS, Munley, Carty |
| 2 | 7:10 AM | Marino, Truant, Andy, Musket |
| 3 | 7:20 AM | Fran, Mallon, Ian, Lusty |

| Matchup |
|---|
| MachIans: Carty + Munley **vs** Douchebags: DS + Kyle |
| MachIans: Truant + Andy **vs** Douchebags: Musket + Marino |
| MachIans: Ian + Fran **vs** Douchebags: Lusty + Mallon |

---

#### R6 — Fri 21 Aug · Pinehurst No. 1 · Scramble ("Fun Scramble")

| Group | Tee | Players |
|---|---|---|
| 1 | 3:04 PM | *(empty)* |
| 2 | 3:12 PM | *(empty)* |
| 3 | 3:20 PM | *(empty)* |

No players assigned, no matches.

> ⚠️ **Data inconsistency:** this round's `date` column says **Sat 22 Aug**,
> but its label says "Friday" and its tee times are on **Fri 21 Aug**. The
> `date` column is wrong.

---

#### R4 — Sat 22 Aug · Pinehurst No. 10 · Singles (1v1)

| Group | Tee | Players |
|---|---|---|
| 1 | 7:24 AM | Musket, Truant, DS, Munley |
| 2 | 7:36 AM | Fran, Mallon, Carty, Kyle |
| 3 | 7:48 AM | Andy, Marino, Lusty, Ian |

Six singles matches — everyone plays:

| Matchup |
|---|
| MachIans: Truant **vs** Douchebags: DS |
| MachIans: Carty **vs** Douchebags: Kyle |
| Douchebags: Mallon **vs** MachIans: Fran |
| MachIans: Ian **vs** Douchebags: Lusty |
| MachIans: Andy **vs** Douchebags: Marino |
| Douchebags: Musket **vs** MachIans: Munley |

---

#### R5 — Sat 22 Aug · Pinehurst No. 4 · Singles (captains pick)

| Group | Tee | Players |
|---|---|---|
| 1 | 2:00 PM | *(empty)* |
| 2 | 2:10 PM | *(empty)* |
| 3 | 2:20 PM | *(empty)* |

Deliberately empty — **captains pick these matchups manually** on the day.
An automated matchup generator for this slot was explicitly dropped from
scope.

---

#### R0 — Tue 12 May · Pinehurst No. 2 · Singles · **HIDDEN**

`is_hidden = true`. A test round, not part of the competition.
Group 1 @ 10:00 AM: Marino, Ian, Lusty, Andy, Munley, DS (6 players — note
this exceeds the 4-player cap the app now enforces). Three singles matches:
DS v Munley, Ian v Lusty, Andy v Marino.

### Summary

- **8 rounds** (R0 hidden, R1–R7 live), **7 courses**.
- **4 rounds fully built** with players and matchups: R1, R2, R3, R4.
- **3 rounds are shells** — tee times exist, no players, no matches: R5
  (captains pick, intentional), R6 (scramble), R7 (The Cradle).
- **15 matches** across R1–R4 (3 + 3 + 3 + 6), plus 3 more in the hidden
  R0 — 18 rows in `matches` for this trip. Exactly one has a result: R1's
  Ian + Munley over Lusty + Kyle, **4 & 3**.

Match points are 1 per match, front/back nines worth 0
(`points_overall=1, points_front_9=0, points_back_9=0`), handicap method
`group_low`, scoring `match_play` throughout.

---

## 9. What we tried to build

### The goal, stated repeatedly by the owner

> "A streamlined form to set up events."

One course, one day. Pick the course, pick the players, pick the game
type(s), assign teams and foursomes — with the game type inferring most of
the grouping. In the owner's words: *"if I pick 30 ball or scramble,
obviously all the same team members will be in the same group. If 2v2 then
obviously 2 team members have to be in one group."*

### Why it took ~30 hours and was never delivered

The setup surface was **23 routes** (6 setup + 3 creation + 14 admin).
Across 28 commits and 3 days, every commit repaired screens *inside* that
structure — four commits rebuilt individual wizard steps — while none
reduced the number of screens. The requested work is a **deletion** task;
each session treated it as an **improvement** task. Four of those commits
polished the very screens that were supposed to be removed.

Compounding it: there are **no app-layer tests**. All 149 tests target the
pure engine. Nothing catches a client and a server disagreeing, which was
the shape of most of the damage. See `docs/session-failures-2026-07.md`.

### What was actually built (2026-07-30, commit `9be087f`)

`/trips/new/event` — a single page with a single submit.

- **`packages/scoring/lineup.ts`** — `deriveLineup()`. Given a roster and
  the chosen games, it derives team split, foursomes, and matchups from
  `FORMAT_META`. Side size prefers whatever fills a physical foursome, so 8
  players on Best Ball becomes two 2v2s in two groups, not one 4v4.
- **`apps/web/tests/lineup.test.ts`** — 25 tests. Beyond named cases, two
  invariants across all 8 formats × rosters 1–24: no group exceeds 4 seats,
  and **every derived match passes the real `validateBuilderState`** — the
  same function the server runs before writing.
- **`apps/web/lib/trip-provision.ts`** — provisioning extracted so
  `createTrip` and the new action share one implementation of the slug and
  team rules.
- **`apps/web/lib/actions/create-event.ts`** — validates the whole payload,
  then writes trip → players → groups → matches. Neon's HTTP driver has no
  interactive transactions, so writes are ordered to leave an editable
  event on partial failure, and each failure names its stage.
- **`apps/web/components/setup/EventSetupForm.tsx`** — the page.

Trip kind is derived, never asked: one group = matchup, 2+ = outing.

**Nothing was written until submit**, which structurally eliminates the
"queued save died when the user navigated between steps" bug class —
three of the six bugs in the failure record.

### Status: unverified

Build green, typecheck clean, 149 tests pass, the route compiles and
renders. **But the form was never operated by a human or an agent, and no
event has ever been created through it.** Every DB write in
`create-event.ts` is unexercised. The old wizard is untouched and still
works.

**Group drag-and-drop was not built.** Groups derive from the game and
render read-only; pinning a player to a team works.

---

## 10. Known problems and open items

Ordered roughly by how much they'll hurt.

1. **UI inconsistency at repo scale.** There is a shared avatar component,
   `components/avatar/MemberAvatar.tsx` — **six files use it.** There are
   **five separate reimplementations** of "show a player's face":
   `CompactPortraitSlot` (schedule), `Avatar` (MatchBuilder), `PlayerAvatar`
   (PlayersStepClient), `Avatar` (FeedClient — which *also* imports
   MemberAvatar), and `HeaderAvatar`. `components/ui/` — the shared
   primitives folder — contains exactly **one** file. The component tree is
   organised by *screen* (`admin/`, `feed/`, `schedule/`, `setup/`…), not by
   concept, so every screen grows its own copy of everything. 28 files
   render a player, 5 different ways.
2. **`tee_times` doubling as the groups table.** A foursome can't exist
   without a tee-time row. This forces `matches.tee_time_id` to be nullable
   for cross-group matches (30 Ball), which forces special cases in the
   schedule renderer. A separate `groups` table would remove a whole class
   of bug.
3. **Two competing creation flows.** `/trips/new/*` (wizard) and
   `/trips/new/event` (single page) both exist. One should be deleted.
4. **`/setup` and `/admin` duplicate each other** — 6 and 14 routes covering
   overlapping jobs.
5. **`alternate_shot` is unreachable** — in the format registry but not the
   `round_format` DB enum. One-line migration.
6. **No app-layer tests.** Zero coverage of server actions, data loaders, or
   any flow. `apps/web/scripts/seed-scenarios.ts` runs real scenarios
   through real code but stops at scoring. Extending it through the setup
   path is the single highest-value piece of undone work — every bug in the
   failure record would fail in that harness.
7. **Pre-existing type error** in `apps/web/tests/formats.test.ts:22` —
   `.sort()` on a `readonly` array. Doesn't break the build (Next excludes
   tests) but `tsc --noEmit` reports it.
8. **R6's `date` column is wrong** (§8).
9. **The single-select format picker.** The round format is documented as a
   default, not a lock, but the setup UI permits one choice. Formats stack
   in this domain. The new form does allow multi-select; the old wizard
   doesn't.
10. **Test events in the database.** 33 trips exist; roughly 23 are
    disposable (14 named `mx-*`/`m2-*`, 4 named `claude-*`, plus
    `*-test` variants). `pcup26` and several real-looking events with real
    scores (`freedom-fairways-invitational`, 288 hole scores) are mixed in
    with them. `archiveTrip`/`unarchiveTrip` exist and are non-destructive.

---

## 11. Local development

```bash
npm install
npm run dev              # Next dev server (Turbopack)
npm run build            # production build — run before pushing
npm test                 # vitest, 149 tests
npm run lint
npm run db:generate      # drizzle-kit generate (does NOT apply)
npm run db:studio        # drizzle-kit studio
npm run seed:scenarios   # runs real scenarios through real scoring code
```

Scripts run via `tsx --env-file=.env.local`. One-offs live in
`apps/web/scripts/`. Two of them regenerate parts of this document and are
strictly read-only:

```bash
npx tsx --env-file=.env.local scripts/list-trips.ts      # every trip + score counts (§10.10)
npx tsx --env-file=.env.local scripts/dump-pinehurst.ts  # full Pinehurst dump (§8)
```

**Before pushing:** run `npm run build` locally. Turbopack's dev server
tolerates type errors the production build rejects.

**Applying a migration:** generate with `db:generate`, paste the SQL into
the Neon SQL editor, insert the row into `__drizzle_migrations` to track it,
*then* push the code that depends on it. Never `db:migrate`.
