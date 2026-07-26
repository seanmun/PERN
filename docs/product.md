# Product

## What we're building

**BuddyCup** — a private golf trip app for any group: trips (multi-day cups), outings (one day, many foursomes), and single matches. The flagship first trip is the **Pinehurst Cup** — a 12-man, Ryder-Cup-style competition between two teams (MachIans vs. Douchebags), match play with handicaps across 6 rounds at Pinehurst-area courses.

Multi-tenancy is live: trip creation wizard, `/trips/[slug]/...` routing, invites. New features should be trip-agnostic by default.

## Who it's for

- **The 12 players** — view schedule, see live leaderboard, check matchups, enter their own scores
- **The captains** (Dan, Ian) — manage matchups for TBD rounds, pick scramble teams, edit team roster
- **The organizer / trip admin** (Dan) — set up rounds, tee times, fixed matchups, manage everything for this trip
- **The platform admin** (Sean / Munley) — godmode across all trips, for development and support

## Design principles

1. **Mobile-first.** Most usage is one-handed on a phone, on the course. Scorecard entry is the make-or-break screen.
2. **Broadcast aesthetic.** Ryder Cup graphics energy. Match-play language (DORMIE, AS, 3&2). Live leaderboard hierarchy puts the team score on top.
3. **Irreverent tone.** This is a group of friends with team names like "Douchebags." Voice and copy match.
4. **Cinematic moments.** Inherits the PERN particle-collider vibe — drama where drama belongs (matchup reveals, leaderboard flips, closing ceremony).
5. **Trip memoir, not just scoreboard.** Designed from day one to capture material (media tagged to holes, chat, match results) that fuels post-trip recaps. Every feature should feed the eventual Memoir Engine.

## Core features — shipped

1. **Auth via Clerk** — magic-link login. ✅
2. **Lazy-claim roster** — admin seeds player slots with email + nickname + handicap; slots claim on first login. ✅
3. **Roles** — platform_admin (env-var-based), trip_admin, is_captain flag, player, viewer. ✅
4. **Trip schedule** — rounds, courses, tee times, matchups, plus non-golf events (meals, flights, hotels). ✅
5. **Hole-by-hole scoring** — mobile scorecard with stroke allocation and live match status (DORMIE / AS / X UP / X&Y). Formats: singles, best ball, two-man aggregate, scramble, stroke, 30 Ball, Bingo Bango Bongo; match play / stableford / stroke resolution. ✅
6. **Live team scoreboard** — Ryder Cup-style team total with per-match status cards + individual leaderboard. ✅
7. **Player profiles** — photo, NBA-Jam arcade portrait, nickname, handicap, team, scouting blurb. ✅
8. **Admin / captain edit tools** — admin edits anything; captains get quick-result entry and their team's commits. ✅
9. **Trip creation + invites** — wizard (type → course → details → players → teams → groups → matches → review), Clerk-ticket invite emails. ✅
10. **Feed** — hole-tagged media, text posts, reactions, moderation. ✅
11. **Course library** — Google Places + GolfCourseAPI import, AI scorecard extraction, favorites, tees/yardages. ✅

Dropped from the original MVP list: the PERN particle-collider matchup randomizer — captains pick TBD matchups manually instead.

## Not built yet — see [`backlog.md`](./backlog.md)

- AI nightly recap articles
- AI hole commentary / course reference
- ElevenLabs audio narration
- Trip Memoir Engine (Remotion-based recap video)
- Closest-to-pin AI camera measurement
- GHIN integration
- Trophy room / record book
- Yearbook PDF

## Non-goals

- Real-time millisecond updates — polling is fine for golf
- GolfShot/18Birdies-style GPS mapping — proprietary, not worth licensing
- Public scoreboards / spectator mode — private, login-gated

(Native mobile is a *future maybe*, sketched in [`mobile-app-plan.md`](./mobile-app-plan.md) — the web app remains the product.)
