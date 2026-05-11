# Backlog (post-MVP)

Features parked during scoping, in rough priority order. Each notes dependencies / what unlocks it.

## High priority — likely v1.1, before the trip if time allows

### Hole-tagged media uploads
The **Trip Memoir foundation.** Lets players attach photos and short videos to specific holes (or to a match, or to the trip generally). Two views: chronological feed and per-hole gallery (browse the scorecard, tap a hole, see everyone's shots on that hole). The `media` table already exists in the schema; needs UI + upload pipeline (Vercel Blob or Cloudflare R2).

*Why it matters:* every other memoir feature downstream depends on having captured media during the trip.

### Trash talk feed / group chat
Trip-scoped feed. Posts, likes, captain-pinned highlights. Captains can author cross-team jabs that drop as system messages between matchups. The `messages` table already exists.

### AI nightly recap article
End of each day, an LLM ingests results + chat + match data and produces a punchy sports-blog post ("Day 2: D-Bags Claw Back at Tobacco Road"). Auto-posted to the trip feed; optionally emailed to all players. Tone: irreverent broadcast.

### Offline-first scorecard (PWA)
Service worker caches scorecard state; writes queued and retried on reconnect. Critical for spotty Pinehurst cell coverage. Should ship by trip date.

## Medium priority — likely v1.2

### AI hole commentary / course reference
Static or AI-written hole-by-hole previews stored per `course_hole`. Three flavors:

- Static reference scraped from official course pages
- AI-written hole previews in a chosen voice (tweedy CBS or D-Bags-irreverent)
- AI play-by-play that knows live match state ("Munley 2UP on Mallon, Hole 14 at No. 2…")

### Captain tools for live matchup picking
Drag-and-drop matchup builder for the Saturday PM round (alternative path to the PERN randomizer if captains want manual control). Same UI for picking scramble teams.

### Pairings reveal screen
Dramatic 1-by-1 reveal animation for matchups. Extends PERN theatricality to manual captain picks.

### GHIN integration
Auto-pull and refresh handicaps. No official public API — will require investigation. v2 "verified handicap" feature.

## Long tail — v2+

### Trip Memoir Engine (recap video)
End-of-trip pipeline:

1. Query DB for dramatic moments (biggest swings, MVP performances, walk-offs)
2. LLM generates a scene-by-scene narration script
3. ElevenLabs renders audio
4. Remotion composes a 3–5 minute video from media library + scene timeline
5. Delivered Sunday morning: *"Your Pinehurst Cup recap is ready"*

Cascades from media + chat + match data — all needs to be captured upstream.

### ElevenLabs audio narration for nightly recaps
Same engine as the recap video but standalone — daily 90-second "Pinehurst Cup Nightly" audio drop.

### Yearbook PDF
Same data pipeline as the recap video, different output format. Printable annual artifact.

### Trophy room / record book
Per-player career stats across all trips. "Most points contributed." "Biggest comeback ever." "Longest losing streak." Cheap to scaffold now (just an aggregation query on existing data); appeal compounds annually.

### Closest-to-pin AI camera measurement
Player takes a photo of the ball relative to the cup. Vision model (Claude, GPT-4V, Gemini) measures pixel distance, scales via known reference (regulation ball 1.68" or cup 4.25"), returns inches. Stretch: ARKit / WebXR for sub-inch LiDAR measurement on iPhones.

### Push notifications
Push or SMS when matches close, when scores flip, when a comeback is happening.

### Multi-tenant unlock
- Trip-creation flow
- Invite generation
- `/cup/[slug]/...` routing
- Per-trip subdomain option
- Onboarding wizard

Schema already supports it; this is pure UI work.

### Closing ceremony screen
Trophy reveal animation Saturday night. Losing captain has to do something cringe.

### Pre-trip module
Countdown clock, packing checklist, course preview videos, "scouting report" cards for each opponent (the `scouting_report` field on `trip_members` is reserved for this).
