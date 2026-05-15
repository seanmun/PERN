# Multi-tenant unlock

> Planning doc. **No code lands until the open decisions below are answered.** This is a large refactor with breaking changes — better to over-spec than to fumble it.

## Goal

Today the app is a private tool for the **Pinehurst Cup** trip. We want any signed-in user to be able to **create a new trip** and become its admin, mirroring everything Pinehurst Cup has today: courses, players, rounds, schedule, teams, captains, feed, scoring.

## How much of this is already done

A lot — by design. From day one ([docs/architecture.md](architecture.md)):

- Every domain table is **trip-scoped** via `trip_id` (teams, tripMembers, rounds, teeTimes, matches, courseHoles, holeScores, media, messages, reactions targets, tripEvents).
- The `trips` table already exists with `slug`, `name`, `startDate`, `endDate`, `createdBy`.
- The `tripMembers` join table is the per-trip identity layer — a `User` can be Munley on Pinehurst Cup and "Captain" on another trip with no schema change.
- Permissions ([lib/auth/permissions.ts](../lib/auth/permissions.ts)) already key on a `tripId` parameter. They're already multi-trip-aware.

**The schema barely changes.** This is almost entirely a UI / routing / context refactor.

## Single-trip assumptions to remove (catalog)

Every place we touch should be auditable. Listing the load-bearing assumptions:

| Where | What | How it gets fixed |
|---|---|---|
| `eq(trips.slug, 'pinehurst-cup-2026')` | Hardcoded slug lookup in page components + server actions | Replace with resolved tripId from URL/context |
| `const [trip] = await db.select().from(trips).limit(1)` | "There's only one trip" assumption | Replace with explicit tripId lookup |
| `getAuthContext()` returns single `tripMember` | Assumes one trip per user | Either take a `tripId` arg, or return all memberships and let caller pick |
| Routes are flat (`/schedule`, `/feed`, `/scoreboard`) | No trip namespace | Move under `/trips/[slug]/...` |
| `Pinehurst Cup` wordmark in header | Hardcoded trip name | Derive from current trip context |
| Home page video + tagline | Pinehurst-themed | Move to per-trip marketing page; root becomes "your trips" |
| `PLATFORM_ADMIN_EMAILS` | Platform-wide godmode | Stays platform-level — unchanged |
| `MEMORY.md` entries | Multiple memories reference single-trip nature | Update once we ship |

A grep audit before we ship will catch the long tail.

## Decision: URL strategy

Four options. Recommended one is checked.

### ✅ A. Path-based: `/trips/[slug]/...`

```
/trips/pinehurst-cup-2026/schedule
/trips/pinehurst-cup-2026/feed
/trips/pinehurst-cup-2026/me
```

- **Pros:** no DNS/Vercel wildcard config; sharable links work as-is; works in dev locally; multiple trips can be open in different tabs.
- **Cons:** every existing route gets a slug param — biggest refactor surface.
- **Default landing logic:** `/` resolves to:
  - If user is on **one** trip → redirect to that trip's home
  - If user is on **multiple** trips → trip picker at `/trips`
  - If user is on **zero** trips → marketing/landing with "Create a trip" CTA

### B. Subdomain-based: `pinehurst.cup.app/schedule`

- **Pros:** clean per-trip URLs; each trip feels like its own product.
- **Cons:** wildcard DNS + Vercel config; harder to share dev preview links; slug conflicts (e.g. `www`, `api`).
- Probably overkill until the platform actually scales.

### C. Session-scoped: user has an "active trip" cookie/setting; URLs stay flat

- **Pros:** smallest refactor (current code mostly works as-is).
- **Cons:** can't share trip-specific URLs (`/schedule` means different things to different users); breaks when a user is in two trips.

### D. Hybrid: path-based canonical, default-trip cookie for `/` redirects

- Same routes as A, plus a "default trip" preference per user so we don't always show a picker.
- **Recommended layer on top of A.**

## Lazy-claim, revisited

Currently: user signs in → look up an unclaimed `trip_member` row whose `email = currentUserEmail` (case-insensitive) → set `user_id`.

For multi-trip, a single email can correspond to **multiple unclaimed slots across trips**. On sign-in we should:

1. Find every `trip_member` row across all trips with matching email and `user_id IS NULL`.
2. Stitch each one's `user_id` in a single transaction.
3. Set the user's `default_trip_id` to the most recently created trip among them (or first by createdAt — open question).

No schema change required — the existing `(user_id, email)` columns already support this.

## Trip creation flow

A new route `/trips/new` (auth-gated, available to any signed-in user):

1. **Trip basics form** — name, slug (auto-suggested from name, editable, uniqueness checked), startDate, endDate, description.
2. On submit: insert `trips` row with `createdBy = currentUserId`, insert two starter `teams` rows (named "Team A" / "Team B" with default green/gold colors — editable), insert a `tripMember` row for the creator with `role = 'trip_admin'`, `is_captain = false`.
3. Redirect to `/trips/[slug]/admin/players` so they can start adding the roster.

Optional: a "Use Pinehurst Cup as template" toggle that copies the round/format pattern.

## Trip listing / picker `/trips`

Lists every trip the current user is a member of, sorted by `startDate`. Each card shows: name, dates, role (player/admin/captain), countdown to trip start, latest activity timestamp. Tap a card → that trip's home.

A "+ Create new trip" tile at the top.

## Permissions, revisited

`lib/auth/permissions.ts` already takes a `tripId` and walks the cascade. The only thing to wire is the **resolved trip context** for each request. Two implementation styles:

- **Per-page resolution:** every server page reads `params.slug`, queries the trip, passes its `id` to permission helpers. Explicit but repetitive.
- **Layout-level context:** a layout at `app/trips/[slug]/layout.tsx` resolves the trip once and exposes it via a server component context (`react.cache`) so descendants don't re-query. Less boilerplate.

Recommended: **layout-level**, cached via `react.cache(getTripBySlug)`.

## Phased migration plan

To keep the deploy on its feet while we cut over, phase it:

### Phase 1 — Schema soft additions (zero breakage)
- Add `users.default_trip_id` (nullable FK to trips) so we can remember a user's preferred trip.
- That's it. No routes change yet.

### Phase 2 — Introduce `/trips/[slug]/*` alongside existing routes
- Duplicate every existing page under `app/trips/[slug]/...`.
- The new routes resolve `slug → tripId` via layout context.
- Old routes (`/schedule`, etc.) keep working — they read the single trip as before.
- New routes are fully trip-aware.
- Internal verification only — no public link changes.

### Phase 3 — Flip canonical URLs
- `/schedule` etc. become 301 redirects to `/trips/[default-slug]/schedule` (using `default_trip_id`, falling back to "the trip the user is most active in").
- Bottom nav, all internal `<Link>`s rewritten.
- Header wordmark + colors driven by current trip.
- Delete the old non-trip-scoped route files.

### Phase 4 — Trip creation UX
- `/trips` (picker) + `/trips/new` (creation form).
- Marketing/landing page at `/` for signed-out users.

### Phase 5 — Multi-trip lazy-claim
- `getAuthContext` stitches all matching `tripMembers` on sign-in.
- Picker shows after sign-in if the user has multiple trips and no default.

### Phase 6 — Cleanup
- Grep for hardcoded `'pinehurst-cup-2026'`. There should be zero left.
- Remove `getTripId()`-style single-trip helpers.
- Update [docs/architecture.md](architecture.md) and CLAUDE.md to reflect multi-trip-live.
- Update relevant memories.

## Breaking changes / risks

- **URLs change.** Anyone who's bookmarked `/schedule` or `/me` will hit redirects. 301s preserve SEO and link sharing.
- **Existing sessions stay valid.** Clerk users don't need to re-auth.
- **Pinehurst data unchanged.** Migration is purely additive at the schema level.
- **Bottom nav refactor.** Every nav link gets a slug. Risk of forgetting one — full grep pass needed before merge.
- **Permission edge cases:** Sean (platform_admin) needs to be able to drop into any trip from `/trips`, even ones he's not a member of. Already supported by the cascade — just exercise it.
- **Server actions** like `createMediaPost`, `updatePlayer`, etc. that currently call `getTripId()` need an explicit `tripId` arg, ideally derived from the URL or from the resource being mutated.

## Decisions (locked 2026-05-14)

1. **URL strategy:** ✅ **Path-based** (`/trips/[slug]/...`) with a per-user **default-trip cookie** so `/` auto-routes after sign-in. No subdomains for now.
2. **Trip creation gate:** ✅ **Any signed-in user can create a trip.** `/trips/new` is open to all authenticated users.
3. **Templates:** ⏸️ **Deferred.** Curated trip templates (Bandon, Pinehurst, etc.) were briefly considered but parked — every creator builds from scratch in v1. Revisit once basic multi-tenant ships.
4. **Course creation during trip setup:** ✅ Inside trip setup, the admin can either **pick from the existing course catalog** or **"+ Add new course"**. The new-course form takes **Name, Address, and a scorecard image upload**. The course row is added to the platform-wide catalog so future trips can reference it.
5. **Invite system:** ✅ **Shareable invite links/codes.** Trip admin generates a URL like `cup.app/join/xyz123` that pre-seeds a `tripMember` slot when visited. Manual email-typing stays as a fallback.

### Course-creation flow (Decision 4 expanded)

Small schema additions on the existing `courses` table (which is already platform-wide — no `trip_id`):

```
courses.address                text (nullable)  -- street address for map deep-link
courses.scorecard_image_url    text (nullable)  -- the uploaded scorecard photo
courses.scorecard_extracted_at timestamptz      -- when the AI extraction was run
```

**Scorecard → hole data via AI vision (✅ decided):** when the admin uploads a scorecard image, we send it to **Claude (vision)** with a structured-extraction prompt and write the result straight into `course_holes` for that course.

Sketch:

1. Admin uploads scorecard JPEG/PDF page through the course form.
2. Server action calls Anthropic's API with `claude-opus-4-7` (or a smaller vision-capable model) and a prompt like:
   > _"This is a golf scorecard. For each of the 18 holes, return JSON of the form `{ holeNumber, par, yardage, handicapIndex }`. Use the white/middle tees for yardage when multiple are shown. handicapIndex is the stroke-index column (1=hardest, 18=easiest). Return only the JSON array, nothing else."_
3. Parse the response, validate (18 rows, par 3–6, SI a permutation of 1–18). If validation fails, surface the raw output to the admin for manual fix instead of writing garbage.
4. `INSERT … ON CONFLICT (course_id, hole_number) DO UPDATE` into `course_holes` so re-running the extraction overwrites cleanly.
5. Stamp `scorecard_extracted_at`. Admin can edit any cell afterwards via the existing hole editor.

The scorecard image stays on the course row regardless of extraction success — useful for sanity-checking the data later.

**This feature can ship independently of multi-tenant unlock.** It's a strict improvement to the existing `/admin/courses/[id]/edit` flow. No routing changes required.

This composes with the multi-tenant plan: course catalog stays shared across the platform, and any trip's admin can contribute by adding new courses.

### Still open (lower-stakes, deferred)

- **Default trip on sign-in when user has multiple** — remember last-used vs. always show picker. Punt to Phase 5.
- **Marketing/landing page at `/`** for signed-out visitors. Punt to Phase 4.
- **Platform rename** — "Cup" is currently the app and the trip class. For multi-tenant we should distinguish: the platform is X, individual trips are Cups. Punt to Phase 4.
- **Scorecard → hole data via vision model** — auto-extract par/yardage/SI from the uploaded scorecard. Separate decision; the scorecard image gets stored either way.

## What the invite-link flow looks like (Decision 4 expanded)

Since invites are shareable links, a couple of pieces get added:

- New table `trip_invites`: `id`, `tripId`, `code` (short random), `createdBy`, `usesAllowed` (nullable; null = unlimited), `usesCount`, `expiresAt` (nullable), `createdAt`.
- Trip-admin UI under `/trips/[slug]/admin/invites` to generate, list, expire, and revoke codes.
- Public route `/join/[code]`:
  - **Signed out:** shows trip name + creator + a "Sign in to join" CTA.
  - **Signed in:** creates (or claims) a `tripMember` row for the current user on the invite's trip, sets that trip as their `default_trip_id`, redirects into the trip.
- Invite codes are case-insensitive and rate-limited to deter brute force.

This adds **one new table** to the otherwise schema-stable plan. Caught early before code; cheap to slot in.

## Out of scope (for v1 multi-tenant)

- Per-trip subdomains
- Payments / billing
- Public spectator mode
- Cross-trip leaderboards (career stats)
- Trip cloning between users

These can come once the basics ship.
