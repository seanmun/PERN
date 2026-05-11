# Product

## What we're building

A private golf trip app for the **Pinehurst Cup** — a 12-man, Ryder-Cup-style competition between two teams (MachIans vs. Douchebags). Match play scoring with handicaps across 6 rounds at Pinehurst-area courses.

Built for *this trip*. Architected so it can host any group's trip later.

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

## MVP — must ship for the Pinehurst trip

1. **Auth via Clerk** — magic-link login.
2. **Lazy-claim roster** — admin seeds 12 player slots with email + nickname + handicap. Slots become claimed on first login. App is fully usable on day one even if half the players never log in.
3. **Roles** — platform_admin (env-var-based), trip_admin (Dan), is_captain flag (Dan + Ian), player.
4. **Trip schedule** — read-only view of rounds, courses, tee times, matchups for all 6 rounds.
5. **Hole-by-hole match play scoring** — mobile scorecard with stroke-given allocation, hole-by-hole win/loss tracking, real match-play status (DORMIE / AS / X UP / X&Y closeout).
6. **Live team scoreboard** — top-level Ryder Cup-style total (e.g., "MachIans 8½ — D-Bags 6½") with per-match status cards underneath.
7. **Public player profiles** — image, nickname, handicap, team affiliation, scouting blurb.
8. **Admin / captain edit tools** — admin edits anything in the trip; captains edit their own team + TBD matchups + scramble teams.
9. **Matchup Randomizer (PERN module)** — particle-collider matchup picker, ported from the existing repo, available as a module for the Saturday PM TBD round.

## Out of MVP — see [`backlog.md`](./backlog.md)

- Hole-tagged media (Memoir foundation)
- Trash talk feed / group chat
- AI nightly recap articles
- AI hole commentary / course reference
- ElevenLabs audio narration
- Trip Memoir Engine (Remotion-based recap video)
- Closest-to-pin AI camera measurement
- GHIN integration
- Trophy room / record book
- Yearbook PDF
- Trip-creation / onboarding UI (multi-tenant unlock)

## Non-goals

- Real-time millisecond updates — polling is fine for golf
- Native mobile apps — PWA-first
- GolfShot/18Birdies-style GPS mapping — proprietary, not worth licensing
- Public scoreboards / spectator mode — private, login-gated
