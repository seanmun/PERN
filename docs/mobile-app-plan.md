# BuddyCup — Mobile + Watch app plan

> Planning doc. **Code lands in phases**, each one ship-ready on its own. See [Implementation order](#implementation-order) at the bottom.

## Goal

Ship iOS + Android native apps for BuddyCup that match the current web feature set, plus a focused Apple Watch companion for live scoring on the course. Reuse as much of the existing TypeScript codebase as possible — the scoring engine, validation, types, and FORMAT_META are pure functions that should live in one place across web, mobile, and any future surface.

## Stack — non-negotiable

- **Mobile (iOS + Android): React Native + Expo (SDK 53+)**
  - Reuses TypeScript modules verbatim with `apps/mobile/tsconfig.json` path aliases
  - Hot-reload to a physical phone via Expo Go (free, no Xcode setup) during dev
  - EAS Build for store-ready binaries — no manual Xcode archive for daily work
  - Clerk has a first-class Expo SDK (`@clerk/clerk-expo`)
- **Watch: native SwiftUI app (watchOS 10+)**
  - Separate Xcode project, HTTP client only — no JS sharing
  - Talks to the same `/api/*` REST endpoints as the mobile app
  - Tight scope: live cup score + current-hole score entry (see [Watch scope](#watch-scope))
- **Workspace: pnpm workspaces**
  - Simpler than Turborepo for two apps; can promote to Turbo later if build caching becomes a need
- **Auth: Clerk** (already in use on web — same dashboard, same users)

## What's reusable (lifts straight over)

These modules are pure TypeScript with no Next.js / DOM dependencies. They move into a shared `packages/scoring` workspace and both `apps/web` and `apps/mobile` import from there with zero modification:

| Module | Path today | What it gives mobile |
|---|---|---|
| `engine.ts` | `lib/scoring/engine.ts` | computeMatch, computeStableford, computeTeamMatch, formatStatus |
| `recompute.ts` | `lib/scoring/recompute.ts` | server-side recompute (lifted later when mobile needs offline) |
| `formats.ts` | `lib/scoring/formats.ts` | FORMAT_META, isOneSided, isTwoSided, isSideSizeAllowed |
| `match-builder.ts` | `lib/validation/match-builder.ts` | validateBuilderState, canDropOnSide, getMatchTeeTimeId |
| Drizzle inferred types | `db/schema.ts` (subset) | shared `TripMember`, `Match`, `Team` types for API responses |

**Roughly 35% of the current TS lines are reusable.** The remaining 65% (UI components, routes, server actions) gets rebuilt — but with the heavy math already locked down and tested.

## What gets rebuilt (mobile-specific)

| Concern | Web today | Mobile equivalent |
|---|---|---|
| Routing | Next.js App Router | **Expo Router** (file-based, same mental model) |
| Server-rendered pages | RSC + server actions | **API routes hit from React Native** (existing web routes) |
| Forms / inputs | HTML + Tailwind | RN `TextInput` + NativeWind (Tailwind for RN) |
| Drag-and-drop builder | `@dnd-kit/core` | **`react-native-gesture-handler` + `react-native-reanimated`** |
| Bottom nav | `BottomNav.tsx` | RN `Tab.Navigator` |
| Theming (light/dark) | Tailwind dark class | RN Appearance API + NativeWind |
| Images / file upload | `<ImagePickerInput>` | `expo-image-picker` + same Vercel Blob upload route |
| Auth UI | Clerk components | `@clerk/clerk-expo` components |
| Cup tab data fetching | Server component awaits db | RN `useEffect` + `fetch` against `/api/*` |
| Score entry | Server action `upsertHoleScore` | POST to `/api/scores` (we expose it) |

## API surface — exposing the server actions

Every server action that mobile needs gets a parallel REST route. The action body lifts unchanged; the route wrapper just adapts inputs/outputs.

Mobile-required endpoints (Phase 1 list):

| Endpoint | Method | What it does |
|---|---|---|
| `/api/trips/[slug]` | GET | trip header + schedule |
| `/api/trips/[slug]/scoreboard` | GET | cup tab data (matches, team totals, leaderboard) |
| `/api/matches/[id]` | GET | match detail (showdown card, hole-by-hole, stableford) |
| `/api/tee-times/[id]/scoring` | GET | foursome scorecard data |
| `/api/scores` | POST | upsert a hole score (mirrors `upsertHoleScore`) |
| `/api/scores/team` | POST | upsert a team-input hole score |
| `/api/matches` | POST | create a match from the drag-and-drop builder |
| `/api/players/buddies` | GET | buddy list for the current user |
| `/api/places/golf-courses` | GET | already exists — Google Places autocomplete |

The existing server actions stay so the web app keeps working. Each REST route is a thin wrapper:

```ts
// app/api/scores/route.ts
export async function POST(req: Request) {
  const body = await req.json();
  const fd = new FormData();
  for (const [k, v] of Object.entries(body)) fd.set(k, String(v));
  await upsertHoleScore(fd);  // existing server action
  return NextResponse.json({ ok: true });
}
```

This lets us evolve a single source of truth on the server while mobile + web share it. **No new business logic in the routes.**

## Watch scope

This is the smallest useful watchOS app. Resist scope creep — anything more than this turns the Watch app into a year-long project.

**Day-of-round screens:**

1. **Cup live score** — full-screen complication showing "Chunkers 4 · Hacks 3" pulled from `/api/trips/<slug>/scoreboard` every 30s while on-wrist.
2. **Current foursome scorecard** — your current foursome's roster + a hole picker. Tap a hole → tap a number 1-9 → submit.
3. **My matches** — list of matches you're a participant in for today, with their live status ("MachIans 2 UP through 7").

**Out of scope for v1:**
- Match builder, admin pages, player edit, photo upload
- Multi-trip switching
- Hole-by-hole scorecard with strokes overlay
- Push notifications (Phase 3)

**Distribution:** the Watch app is bundled inside the iPhone app via a Watch App target in the same Xcode project. The user installs it from the Watch app on their phone. No separate App Store listing.

## Auth

Clerk handles this cleanly on every surface:

- **Web:** `@clerk/nextjs` (already shipped)
- **Mobile:** `@clerk/clerk-expo` — same Clerk Project, same dashboard, same users. The Expo SDK provides hooks (`useAuth`, `useUser`) and pre-built sign-in screens.
- **Watch:** uses the iPhone's Clerk session via `WatchConnectivity` (preferred) or independent auth via a 6-digit code flow if the watch is paired but the phone isn't around.

A user signing in on the web is automatically signed in on mobile when they download the app and sign in (same email → same Clerk user).

## Drag-and-drop on mobile

The match builder is the most complex screen to port. RN doesn't have `@dnd-kit`. The Expo-native combo is:

- **`react-native-gesture-handler`** — touch gestures, including drag detection
- **`react-native-reanimated`** — JS-thread-free animations
- **`react-native-draggable-flatlist`** for the roster + slot interactions

Plan: rebuild `MatchBuilder.tsx` as `apps/mobile/screens/MatchBuilderScreen.tsx`. The **validation logic** (`validateBuilderState`, `canDropOnSide`) imports directly from `packages/scoring/validation` — no rewrite. Only the touch + render layer is new. About 3 days of focused work.

## Repo structure

After the migration (Phase 0 below):

```
buddycup/                      ← repo root (renamed from "pern")
  apps/
    web/                       ← current Next.js app
      app/
      components/
      lib/                     ← Next.js-only helpers stay here
      ...
    mobile/                    ← new Expo app
      app/                     ← Expo Router file-based routing
      components/
      ...
  packages/
    scoring/                   ← lib/scoring + lib/validation
      engine.ts
      formats.ts
      match-builder.ts
      package.json
    types/                     ← shared TypeScript types
      package.json
  ios-watch/                   ← native Watch app (separate Xcode project)
    BuddyCupWatch.xcodeproj
    Sources/
  package.json                 ← pnpm workspace root
  pnpm-workspace.yaml
  tsconfig.base.json           ← shared TS settings
```

The workspace package.json declares:

```json
{
  "private": true,
  "workspaces": ["apps/*", "packages/*"]
}
```

And each app's tsconfig adds path aliases:

```json
{
  "compilerOptions": {
    "paths": {
      "@buddycup/scoring/*": ["../../packages/scoring/*"],
      "@buddycup/types/*": ["../../packages/types/*"]
    }
  }
}
```

Edit `packages/scoring/engine.ts`, save, and **both web + mobile pick it up instantly**. No `npm publish`. No version bumping.

## Daily workflow

**Web:**
```
cd apps/web
npm run dev          # localhost:3000
```

**Mobile (daily dev):**
```
cd apps/mobile
npx expo start       # spawns QR code
```
Scan QR with the Expo Go app on your phone → the app launches → file saves hot-reload onto the phone in <1s.

**Mobile (production build for TestFlight):**
```
cd apps/mobile
eas build --platform ios --profile production
eas submit --platform ios
```
EAS Build runs on Expo's servers (no Xcode UI needed). The output IPA goes straight to TestFlight via `eas submit`. Same flow for Android.

**Watch:**
```
open ios-watch/BuddyCupWatch.xcodeproj
```
Run in Xcode → choose your Apple Watch from the device list → app deploys to watch via paired iPhone. Use the Watch Simulator for everything except gesture testing.

**Tests:**
```
npm test             # from root — runs vitest across packages/scoring + apps/web tests
```

## Distribution

| Target | Service | Cost | Cadence |
|---|---|---|---|
| Web | Vercel auto-deploy on push to `main` | free tier covers buddy-app usage | every push |
| iOS (TestFlight) | EAS Build + EAS Submit | $0 — Apple Dev account already paid | manual `eas submit` per release |
| iOS (App Store) | EAS Submit | $0 — same Apple Dev account | manual per release |
| Android (Play Store) | EAS Build + EAS Submit | $25 one-time Play Console registration | manual per release |
| Watch (TestFlight + App Store) | Xcode → Organizer → upload | $0 — bundled with iOS app | manual per release |

**TestFlight invites** are how your buddies install the app pre-launch — you add their Apple ID emails in App Store Connect, they get an invite to install via the TestFlight app.

## Costs (full picture)

- **Apple Developer Program** — $99/yr — required for TestFlight + App Store + Watch
- **Google Play Console** — **$25 one-time** — required for Play Store distribution (this one you haven't done yet)
- **Expo** — $0 — EAS Build free tier (30 iOS builds/month, plenty)
- **Clerk** — $0 — free tier covers small apps
- **Vercel** — $0 — Hobby tier
- **Neon** — $0 — current free tier

Total annual: ~$99/yr after the $25 Play setup.

## Implementation order

### Phase 0 — Monorepo migration (~½ day)

- [ ] Move current root contents to `apps/web/`
- [ ] Hoist `lib/scoring/` + `lib/validation/` into `packages/scoring/`
- [ ] Update path aliases in `apps/web/tsconfig.json`
- [ ] `pnpm-workspace.yaml` + root `package.json` workspaces field
- [ ] Verify `npm run dev`, `npm test`, `npm run build`, `npm run seed:scenarios` all still work from the new structure

**No app changes**, just a refactor. Web app keeps shipping as normal after this.

### Phase 1 — Mobile app shell + auth (~1 week)

- [ ] `npx create-expo-app apps/mobile`
- [ ] Install `@clerk/clerk-expo`, `nativewind`, `react-native-gesture-handler`, `react-native-reanimated`
- [ ] Sign-in / sign-up screens via Clerk
- [ ] Bottom-tab navigation matching web's BottomNav (Home, Schedule, Cup, Me)
- [ ] Test on Expo Go on your phone

### Phase 2 — Read-only views (~1 week)

- [ ] Trip header + schedule list (matches `/trips/[slug]/schedule`)
- [ ] Cup tab (matches `/trips/[slug]/scoreboard`)
- [ ] Match detail (NBA-Jam showdown + per-hole scorecard + stableford table)
- [ ] Profile + buddies tabs

API routes to add: `/api/trips/[slug]`, `/api/trips/[slug]/scoreboard`, `/api/matches/[id]`, `/api/players/buddies`.

**At this point** the mobile app is useful — everyone in the trip can watch live scores from their phone without opening a browser.

### Phase 3 — Score entry (~1 week)

- [ ] Foursome scorecard (matches `/trips/[slug]/tee-times/[id]/score`)
- [ ] Hole-by-hole +/− buttons
- [ ] Auto-jump-to-current-hole + dead-hole lock (same logic as web)
- [ ] Optimistic updates with rollback on save failure

API route: `POST /api/scores`.

### Phase 4 — Admin (~1 week)

- [ ] Admin home with setup checklist (mirrors round-edit progress bar)
- [ ] Player edit (inline edit pattern from web → RN equivalent)
- [ ] Foursome roster picker
- [ ] Match builder with drag-and-drop (the hardest screen)
- [ ] New course form with Google Places autocomplete

API routes: `/api/matches` (POST), `/api/tee-times/[id]/roster` (PUT), `/api/courses` (POST), etc.

### Phase 5 — TestFlight ship (~½ day)

- [ ] `eas build --platform ios --profile production`
- [ ] `eas submit --platform ios`
- [ ] Add buddy emails as TestFlight testers in App Store Connect
- [ ] Buddies install via the TestFlight app

### Phase 6 — Android / Play Store (~½ day)

- [ ] Register Google Play Console ($25)
- [ ] `eas build --platform android --profile production`
- [ ] `eas submit --platform android`

### Phase 7 — Apple Watch companion (~2 weeks)

- [ ] New Xcode project at `ios-watch/`
- [ ] SwiftUI app with three screens (cup live score, current foursome scorecard, my matches)
- [ ] `WatchConnectivity` for token relay from iPhone Clerk session
- [ ] Complication for cup score on the watch face
- [ ] TestFlight via Xcode → Organizer

## Open decisions

### Decision: pnpm vs npm workspaces

- [ ] **pnpm workspaces** — faster installs, stricter dependency resolution, common in monorepo land
- [ ] npm workspaces — already familiar, no new CLI

**Recommendation:** pnpm. The strictness saves real time when adding deps.

### Decision: Expo Router vs React Navigation

- [ ] **Expo Router** — file-based routing, matches Next.js App Router mental model
- [ ] React Navigation — older, more docs, more flexible

**Recommendation:** Expo Router. The mental model overlap with Next.js is too useful to give up.

### Decision: NativeWind vs StyleSheet

- [ ] **NativeWind** — Tailwind className syntax for RN, lets you copy web styles ~80%
- [ ] RN `StyleSheet.create` — native idiom, faster runtime

**Recommendation:** NativeWind. Tailwind copy-paste from web is worth the small perf hit.

### Decision: Watch app or skip entirely for v1

- [ ] **Build it** — Apple Watch + golf is a real use case; you have an Apple Watch
- [ ] Skip — focus on iOS + Android, ship watch in v2

**Recommendation:** Build it AFTER iOS + Android are live. Don't let Watch block the buddy-friendly TestFlight launch.

## Risks

1. **Drag-and-drop on mobile.** The web `@dnd-kit` solution doesn't port. RN gesture handlers are powerful but the learning curve is real. Budget extra time for the match builder screen.
2. **Image upload latency.** Mobile photos are bigger than web uploads. Existing Vercel Blob route should still work but expect 2-3s upload time on a 12MP camera shot.
3. **Watch authentication.** `WatchConnectivity` relay is well-documented but is a real Swift task; expect 2-3 days of "why isn't my session token reaching the watch" debugging.
4. **TestFlight review wait.** Apple takes 24-48h for the first build review even for TestFlight. Plan for it before your outing.
5. **Offline scoring.** Phase 1-6 assumes always-online. The course has spotty cell. Plan for an offline queue + sync pattern in Phase 8 if buddies complain.

## Out of scope (for this plan)

- Push notifications for live score updates (Phase 8)
- Offline-first scoring with local SQLite + sync (Phase 9)
- Live activity / Dynamic Island integration on iPhone (Phase 10)
- In-app purchases / paid tiers (way out of scope)
- Social features beyond buddies (DMs, comments, etc.)
