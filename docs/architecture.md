# Architecture

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | Server components, Vercel-native, modern React |
| Styling | Tailwind v4 | Fast, expressive, matches PERN |
| Auth | Clerk | Magic-link, roles via metadata, painless |
| DB | Neon Postgres | Serverless, branchable, no RLS tax |
| ORM | Drizzle | Type-safe, schema-as-code, fast |
| Realtime | Polling-first (TanStack Query) → SSE → Pusher | Golf doesn't need millisecond updates |
| Animation | Framer Motion | Inherited from PERN |
| Media | Vercel Blob or Cloudflare R2 | TBD when media features ship |
| Hosting | Vercel | Standard for the stack |
| Video composition (v2) | Remotion | React-based programmatic video — perfect for AI-generated recaps |
| Audio (v2) | ElevenLabs | Narration for recaps |

## Why not Supabase

Past projects have hit auth/RLS pain on Supabase at exactly the role complexity this app implies (platform_admin × trip_admin × captain × player across multiple trips). Clerk owns auth, Neon owns data, Drizzle owns the schema. Clean separation, no RLS policies to debug.

## Multi-tenant approach

**Multi-tenancy is live** (see [`multi-tenant-unlock.md`](./multi-tenant-unlock.md) for the original plan).

- Every domain table (`teams`, `rounds`, `matches`, `messages`, `media`, ...) has a `trip_id` FK — or chains to one.
- Routing is `/trips/[slug]/...`; `/trips/new` is the creation wizard; trip kinds are `trip` / `outing` / `match`.
- The Pinehurst Cup is the flagship first trip, not a hardcoded assumption. New features are trip-agnostic by default.

## Role model

Two orthogonal axes:

**Platform role** — on `User`, enforced by `PLATFORM_ADMIN_EMAILS` env var (checked server-side):

- `platform_admin` — Sean / Munley. Godmode across all trips. Inherits all trip-level permissions automatically.
- regular user — everyone else.

**Trip role** — on `TripMember`, per trip:

- `trip_admin` — full control of this trip's data.
- `player` — regular roster member.
- `viewer` — read-only spectator.

Plus a separate `is_captain: boolean` on `TripMember`. Captains are players with extras (edit own team roster, set TBD matchups, pick scramble teams). Captain is *not* a separate role — Ian is a captain but not an admin.

### Permission resolution

```
can(user, action, resource):
  if user.platform_admin                                       → allow
  if user.trip_admin_for(resource.trip)                        → allow
  if action is captain-scoped AND user.is_captain_of(team)     → allow
  if action is self-scoped AND resource.owner === user         → allow
  else                                                          → deny
```

Implement as middleware helpers in `lib/auth/permissions.ts`. Never scatter inline checks.

## Auth + lazy-claim flow

1. Admin seeds 12 `trip_members` rows. Each has `email`, `nickname`, `handicap`, `team_id`, optional `is_captain`. `user_id` is null.
2. Player visits the app, clicks login, gets a Clerk magic link to their email.
3. Clerk creates a `User`. A webhook (or server action on first authenticated request) looks for an unclaimed `trip_member` with that email and stitches in `user_id`.
4. Until claimed, admins/captains can edit the slot on the player's behalf. The scoreboard renders the slot regardless of claim status.

App is fully usable on day one even if half the players never log in.

## Realtime strategy

Neon doesn't have native realtime like Supabase. For a golf app, that's fine.

- **MVP:** TanStack Query polling — 15–30s on leaderboard, 5s during active hole entry.
- **Upgrade path 1:** Server-Sent Events for push events (match closed, hole entered, score flipped) — simple, one-way, no extra service.
- **Upgrade path 2:** Pusher Channels or Ably if true broadcast realtime becomes worth the cost.

Don't reach for WebSockets unless the use case actually demands it.

## Scoring engine

The hardest piece of logic in the app. The pure engine lives in **`packages/scoring/`** (`@buddycup/scoring` — engine, formats, handicap, team-split, match-builder validation), framework-free so a future mobile app can share it. App-side glue (recompute/persistence, handicap-method resolution) lives in `apps/web/lib/scoring/`. Heavily unit-tested in `apps/web/tests/`.

**Inputs:**

- Match (2v2 or 1v1)
- Players' handicaps
- Course hole-by-hole par + handicap stroke index (1–18 difficulty rating)
- Hole-by-hole gross scores as they're entered

**Computes:**

- Strokes given per player per hole (USGA: lowest handicap plays scratch, others receive strokes on hardest-rated holes)
- Net score per hole
- Hole winner (low net wins; tied = halved)
- Match status after each hole (`X UP with Y to play`, `AS`, `DORMIE`, closed at `X&Y`)

The engine covers singles, best ball, two-man aggregate, scramble/alternate-shot (team input), stroke play, stableford, 30 Ball, and Bingo Bango Bongo, with three handicap methods (group_low / match_low / course).

## Offline considerations

Pinehurst cell coverage is famously spotty. An offline-capable scorecard (cache + queued writes + connection indicator, service worker) is on the backlog — **not built yet**.

## Project structure

```
apps/web/                     # the entire Next.js app
  app/                        # App Router
    trips/[slug]/...          # all trip-scoped surfaces (schedule, scoreboard,
                              #   matches, tee-times, feed, admin, setup wizard)
    trips/new/...             # creation wizard
    home/, me/                # user-scoped
    api/                      # Places/course-db proxies, blob upload
  components/                 # by feature (admin, feed, schedule, score-entry, ...)
  lib/
    auth/                     # permissions + auth context helpers
    actions/                  # server actions (all mutations)
    data/                     # server-only data loaders
    scoring/                  # app-side glue over the engine
  db/
    schema.ts                 # source of truth
    migrations/               # applied by hand via Neon SQL editor
packages/scoring/             # pure-TS engine (@buddycup/scoring)
docs/                         # this folder
```
