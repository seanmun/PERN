# Schema

Data-model reference. **The source of truth is [`apps/web/db/schema.ts`](../apps/web/db/schema.ts)** — this doc summarizes intent per table; don't copy code from here. Update this file in the same PR as any schema change (house rule in CLAUDE.md).

## Conventions

- All IDs are `uuid` (default random).
- All timestamps are `timestamp with timezone`, defaulting to `now()`.
- Soft deletes are deliberately avoided — hard delete + FK cascades.
- `users`, `courses` (+ tees/holes/favorites), and `reactions` are platform-level. Everything else is trip-scoped via `trip_id`.
- Handicaps stored as `numeric(4,1)` — Drizzle returns these as strings to preserve precision. Do not naively `parseFloat`; route them through the scoring engine.

## Enums (10)

| Enum | Values |
|---|---|
| `trip_role` | trip_admin, player, viewer |
| `trip_kind` | trip, outing, match |
| `round_format` | best_ball, singles, scramble, stroke, two_man_aggregate, thirty_ball, bingo_bango_bongo |
| `match_status` | scheduled, in_progress, completed |
| `match_scoring` | match_play, stableford, stroke |
| `handicap_method` | group_low, match_low, course |
| `media_type` | image, video |
| `moderation_status` | approved, flagged |
| `trip_event_type` | flight, shuttle, meal, social, hotel_checkin, hotel_checkout, other |
| `reaction_target_kind` | score, media, text |

## Tables (21)

### Platform-level

- **`users`** — one row per Clerk account. `clerkId`, `email`, display/full name, `username` (unique), avatar, GHIN, default `handicap`, city/state/club, arcade-portrait columns (`arcadePortraitUrl` / source / generatedAt), `defaultTripId` (self-referential FK → trips, set-null).
- **`courses`** — shared course library. Name, location, address, `latitude`/`longitude`, `externalSource`+`externalId` (unique pair — GolfCourseAPI dedupe), landscape image, scorecard image + extraction timestamp.
- **`course_holes`** — 18 rows per course: par, denormalized default-tee yardage, `handicapIndex` (stroke index). Unique (courseId, holeNumber).
- **`course_tees`** — per-course tee sets: name, color, `rating`, `slope`, total yardage, `displayOrder`, `isDefault`. Unique (courseId, name).
- **`course_tee_yardages`** — per-tee per-hole yardage. Composite PK (courseTeeId, holeNumber).
- **`course_favorites`** — personal course stars. Unique (userId, courseId).
- **`reactions`** — emoji reactions. Polymorphic target: `targetKind` + bare-uuid `targetId` (**no FK** — no cascade when the target row is deleted). Unique (userId, kind, targetId, emoji).

### Trip-scoped

- **`trips`** — `slug` (unique), name, `kind` (trip/outing/match), dates, description, image, `defaultHandicapMethod`, `archivedAt` (null = live; set = hidden from home, restorable), createdBy.
- **`teams`** — name, color, `captainUserId`.
- **`trip_members`** — the roster. Nullable `userId` (lazy-claim: shell rows claim on first matching login) and nullable `email` (shell players). Nickname, avatar, `role`, `isCaptain`, `tripHandicap`, scouting report, flight details.
- **`trip_events`** — non-golf itinerary (meals, flights, hotels). Type, title, location, address, start/end.
- **`trip_invites`** — invite codes table (schema exists; the shipped invite flow uses Clerk-ticket emails instead — no `/join/[code]` UI yet).
- **`messages`** — text feed posts. `pinnedByCaptain`.
- **`media`** — feed photos/videos, optionally tagged to match/round/hole. Moderation columns (Sightengine).

### Golf structure

- **`rounds`** — per trip: course, optional explicit `courseTeeId` (else course default), date, `format`, `order`, label, `countsTowardCup`, `isHidden`.
- **`tee_times`** — foursome groups within a round: time, `groupNumber`.
- **`tee_time_participants`** — explicit foursome roster, decoupled from match participation. Composite PK (teeTimeId, tripMemberId).
- **`matches`** — the scoring unit. `roundId`; nullable `teeTimeId` (null = round-wide / cross-foursome). Per-match `format` (stacked mixed-format matches per tee time are supported), `templateSizeA/B`, `scoring` (match_play/stableford/stroke), `handicapMethod`, stableford point overrides (`ptsEagle`…`ptsDoublePlus`), match points (`pointsOverall`/`pointsFront9`/`pointsBack9`), `status`, result columns (`resultText`, `winningTeamId`, `front9WinningTeamId`, `back9WinningTeamId`, `isHalved`).
- **`match_participants`** — composite PK (matchId, tripMemberId) + `teamId`.
- **`hole_scores`** — per player per hole per match: gross, net, `strokesReceived`, `counted` (30 Ball selection flag), `committedAt` (30 Ball lock), enteredBy/At. Unique (matchId, tripMemberId, holeNumber). Score writes fan out round-wide (one ball per player per round).
- **`bbb_hole_points`** — Bingo Bango Bongo: one row per (matchId, holeNumber) = the committed judgment; bingo/bango/bongo winner FKs, all nullable (null = washed point). Row existence = commit.

## Notes

- No Drizzle `relations()` helpers — FK-only; relational query API (`db.query.x.with`) is not used.
- DB driver is `neon-http` — no interactive transactions available.
- Permission checks live in the app layer (`apps/web/lib/auth/permissions.ts`), never RLS.

## Migrations

32+ SQL files in `apps/web/db/migrations/` (0000–0031, plus `0029a` recording hand-applied 30 Ball prereqs). **Applied by pasting SQL into the Neon SQL editor — never a migration runner** — and always applied BEFORE pushing code that depends on them (main auto-deploys). The Drizzle journal/snapshots stop at 0018; the folder is hand-maintained past that point, so don't trust `drizzle-kit generate` diffs without checking.
