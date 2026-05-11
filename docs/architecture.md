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

**Data is trip-scoped from day one. UI is Pinehurst-hardcoded for v1.**

- Every domain table (`teams`, `rounds`, `matches`, `messages`, `media`) has a `trip_id` FK.
- The Pinehurst trip is seeded as a single row at install time.
- v1 routes assume that trip — no trip slug in the URL, no trip switcher, no trip-creation form.
- v2 unlock: add `/cup/[slug]/...` routing, a trip-creation flow, and invite generation. Schema doesn't change.

This is the cheapest possible insurance against rewriting later.

## Role model

Two orthogonal axes:

**Platform role** — on `User`, enforced by `PLATFORM_ADMIN_EMAILS` env var (checked server-side):

- `platform_admin` — Sean / Munley. Godmode across all trips. Inherits all trip-level permissions automatically.
- regular user — everyone else.

**Trip role** — on `TripMember`, per trip:

- `trip_admin` — Dan. Full control of this trip's data.
- `player` — everyone else on the trip.

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

## Match-play scoring engine

The hardest piece of logic in the app. Lives in `lib/scoring/`. Pure functions, heavily unit-tested.

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

Same engine handles both 2v2 (best ball net) and 1v1 (singles net match play). Different round formats just pass different inputs.

## Offline considerations

Pinehurst cell coverage is famously spotty. The scorecard entry screen should:

- Cache scorecard state in localStorage or IndexedDB
- Queue score writes; retry on reconnect
- Show a clear connection-status indicator

Service worker via `next-pwa` or vanilla is the path. Not v0 of MVP, but in scope before the trip date.

## Project structure (proposed)

```
/app                          # Next.js App Router
  /(marketing)                # public-facing pages
  /(app)                      # auth-gated app
    /scoreboard
    /schedule
    /matches/[id]
    /profile/[handle]
    /admin
    /randomizer               # PERN module
/components
  /scoreboard
  /scorecard
  /matchcard
  /collider                   # ported from PERN
/lib
  /auth                       # permissions helpers
  /scoring                    # match-play engine
  /db                         # drizzle client
/db
  schema.ts                   # source of truth
  seed.ts                     # Pinehurst seed
/docs                         # this folder
```
