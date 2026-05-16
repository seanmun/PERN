# BuddyCup marketing page — spec

Single-page marketing site for signed-out visitors at `/` ([app/page.tsx](../app/page.tsx)). Signed-in visitors should still redirect to `/me` (already wired up).

## Visual direction

- **Palette:** dark background (`#0a0a0a`), gold accent (`#eab308`), green accent (`#16a34a`), zinc neutrals.
- **Type:** Geist Sans body, Geist Mono for uppercase labels with `tracking-[0.35em]`.
- **Tone:** irreverent, broadcast-energy, Ryder-Cup-adjacent. Not corporate. Not cute.
- **Mobile-first.** Single-column flowing sections; desktop layouts can use two-column at `md:` breakpoint, but the mobile view is the canonical one.
- **No bullshit "5-year-old" output.** Every button must have real padding (`px-6 py-3` minimum). Cards must have visible borders and padding. Sections must be center-constrained (`mx-auto max-w-3xl` or `max-w-5xl`). No content flush-left against the viewport edge.

## Sections (in order, top to bottom)

### 1. Hero
- Reuse the existing `<HomeBgVideo src="/golfball-test.mp4" loopAt={11} />` as background video
- Top decorative divider: thin horizontal lines bracketing a small uppercase mono kicker ("The cupboard" or similar)
- Big two-line wordmark: **BUDDY** (zinc-100) over **CUP** (gradient gold)
- Tagline: "Run your trip. Crown your champion." (or similar — short)
- Body paragraph: one sentence explaining what it does
- Two CTAs: primary "Sign in" → `/sign-in`, secondary anchor "How it works ↓" → `#how-it-works`

### 2. How it works (5 steps)
Section ID: `how-it-works`. Centered kicker + h2 + intro paragraph at top.

Then a vertical list of 5 steps. Each step is a horizontal card with:
- Left: step number (01–05) in mono + icon below it in a 9x9 zinc-900 box
- Right: title (h3, semibold) + body (sm, zinc-400)

Steps:
1. **Create your trip** — Name it. Pick the dates. Set your two team colors. Done in 30 seconds — you're the trip admin.
2. **Invite your buddies** — Drop in emails or share a join link. Players claim their slot the first time they log in. The app stays usable even if half of them never sign in.
3. **Add your courses** — Snap a photo of the scorecard, AI reads the par, yardage, and stroke index for all 18 holes. Edit anything that doesn't look right.
4. **Schedule your cup** — Five rounds, six rounds, whatever you want. Pair tee times, assign matchups, mark the format (2v2, singles, scramble).
5. **Plan the surrounding chaos** — Flights, shuttles, group dinners, the post-round bar stop. Everything lands on one shared schedule next to the golf.

### 3. Feature showcase — Scoreboard
Two-column on desktop, copy left, mock right. Stacked on mobile (copy first).

**Copy:**
- Kicker: "Feature · Live scoring"
- H2: "The leaderboard that fits in your back pocket."
- Body: Real match-play math. DORMIE, AS, 3&2, all of it. Handicap strokes auto-allocated to the hardest holes. Cup score on top, individual leaderboard below.
- Bullet list with `Trophy` icons:
  - Team total updates the second a hole is entered
  - Net match-play scoring, even for 2v2 best ball
  - Closeouts (3&2, 4&3) computed automatically

**Mock visual:**
- Bordered black card with "Cup standings" kicker + "Pinehurst Cup 2026" h-line
- Two team boxes side-by-side: MachIans 8½ (green) vs Douchebags 6½ (gold), with `vs` between
- Small "9 of 15 matches in the books · 6 pts left" footnote
- Below: 4-row individual leaderboard (Dan, Ian, Munley, Sean) with team color stripe on left edge and points right-aligned

### 4. Feature showcase — Feed
Two-column. Mock LEFT, copy RIGHT (alternates with previous section). Stacked on mobile (copy first via order classes).

**Copy:**
- Kicker: "Feature · The feed"
- H2: "Trash talk, photos, and receipts."
- Body: A team chat built for the trip — not for productivity. Post brags, drop photos, react with whatever you want. Auto-moderated for the obvious stuff so admins don't have to babysit.
- Bullet list with `Flame` icons:
  - Hole-tagged photos and videos
  - Emoji reactions on every post
  - Becomes the source material for your post-trip recap

**Mock visual:** Three mock feed posts stacked vertically. Each post is a bordered dark card with team-color left edge:
- **Ian** (Douchebags / gold): "Birdied 12 from the bunker. Adjust your scouting reports accordingly. 🐐" — reactions: 🔥 7, 🤡 3
- **Dan** (MachIans / green): "Photo of the day: Munley's tee shot finding a tree it had no business being near." — reactions: 😂 11
- **Sean** (Douchebags / gold): "MACHIANS DORMIE 3 — but we're not done yet." — reactions: 🍿 5, 💀 4

### 5. Feature showcase — NBA Jam portraits
Two-column. Copy LEFT, mock RIGHT.

**Copy:**
- Kicker: "Feature · Arcade portraits"
- H2: "NBA Jam-style player portraits."
- Body: Upload a photo. The AI turns it into a 16-bit Sega arcade portrait — the same look as the one and only NBA Jam. Used in matchup reveals, leaderboards, and the closing ceremony.
- Bullet list with `Users` icons:
  - One portrait per player, locked once approved
  - Animated "He's on fire" treatment on win streaks
  - Coming with the matchup reveal cinematic

**Mock visual:** 2x2 grid of mock arcade portraits. Each tile is a `aspect-[3/4]` bordered box with:
- Team color glow (`boxShadow: 0 0 24px <color>55`)
- Linear gradient background from team color to black
- CRT-style scanline overlay (repeating horizontal lines via `repeating-linear-gradient`)
- Bottom-aligned text: team name (small mono) + player name (big bold mono with text-shadow glow)

Players: DAN (MachIans/green), IAN (Douchebags/gold), SEAN (Douchebags/gold), MUNLEY (MachIans/green).

### 6. Closing CTA
Centered, max-w-2xl. Kicker + h2 + small body + sign-in button. Same gold button as hero CTA.

- Kicker: "Ready to run yours?"
- H2: "Sign in and create your cup."
- Body: Built for buddy trips. Free while we figure it out.
- Button: "Sign in" → `/sign-in`

## Implementation notes

- Use Tailwind v4 (project already configured via `@import "tailwindcss"` in `app/globals.css`).
- Use `lucide-react` icons (`Calendar`, `Flag`, `Flame`, `Mail`, `MapPin`, `Sparkles`, `Trophy`, `Users`).
- Each section gets `border-t border-zinc-900` to separate.
- Sections use `py-20 sm:py-28` for vertical breathing room.
- Content containers use `mx-auto max-w-3xl px-4` (or `max-w-5xl` for two-column features).
- Buttons MUST have explicit padding — primary buttons: `px-7 py-3`, secondary `px-6 py-2.5`.
- All cards/borders: `rounded-sm border border-zinc-800 bg-zinc-950/40 p-5` (minimum).
- Do not skip the `px-4` on the outer container — that's what prevents the "everything margin-left" look on mobile.

## File location

Replace contents of [app/page.tsx](../app/page.tsx). Server component. Must keep the `getAuthContext` check at the top that redirects signed-in users to `/me`.

## Don't

- Don't use external image services — there are no real screenshots yet. All visuals are CSS mocks.
- Don't use 3rd-party UI libraries (no shadcn imports, no MUI).
- Don't add JavaScript-driven scroll animations.
- Don't drop fonts other than the existing Geist family.
