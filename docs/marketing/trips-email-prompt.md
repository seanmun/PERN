# Prompt — kinetic promo email for BuddyCup Trips

Use this prompt to generate an animated marketing email promoting the **Trips** event type on BuddyCup.

---

## The prompt

You are an email designer building a **kinetic (animated) HTML email** for **BuddyCup** — a private golf-trip companion app. The email promotes the **Trips** feature: BuddyCup's multi-day, multi-round, Ryder-Cup-style event format. Your audience is a group organizer (the friend who runs the annual buddy trip) who is *currently* tracking matches in Google Sheets and texting team-point totals to a group chat.

### Brand voice

Confident, dry-humored, golf-literate. Lightly mocks Google Sheets without being mean. Never uses corporate phrases like "supercharge" or "level up." Sounds like a smart group chat message, not a brochure.

### Brand visuals

- Colors: deep green (`#16a34a`), gold (`#eab308`), near-black (`#0a0a0a`), warm off-white (`#f4f4f5`)
- Typography: bold sans-serif headlines, monospace small caps for tag lines / labels
- Aesthetic: scoreboard-inspired, faintly NBA-Jam arcade, polished not garish

### Required structure

**1. Subject line + preheader.** Make the subject scoreboard-style — concrete, not generic. Preheader sets up the carousel tease.

**2. Hero (above the fold).** Animated headline like a flipboard / scoreboard splat. Subhead explains what Trips are in **one sentence**:

> "Trips are multi-day buddy golf events — many rounds, many foursomes, cup-style team scoring that updates the moment a 9 closes."

Include a single primary CTA button ("Start your trip").

**3. Animated carousel (the meat of the email).** A horizontally-scrolling auto-advancing card carousel with **6 slides**, one feature per card. Each card animates in independently (slide + fade, ~400ms). Use CSS keyframes — no JavaScript. Each card layout: bold feature name + a 1-line subtitle + a stylized illustration or screenshot mockup. The 6 slides:

  1. **Multi-day Schedule** — itinerary view with rounds across days, tee times, and side events.
     *Subtitle:* "Wednesday Pine Needles, Thursday No. 2, Friday cross-grain. All in one place."
  2. **Stack any matches you want** — 1v1 singles + 2v2 best ball + a 4v4 best ball across both foursomes, all in the same round. The math just works.
     *Subtitle:* "Best Ball + Singles + Aggregate. Same foursome. Same scorecard."
  3. **Cup-style team points** — every match awards points; segment splits (front 9 / back 9 / overall) post the moment a side closes the hole count.
     *Subtitle:* "Team score updates the second a 9 closes — no end-of-day tabulation."
  4. **One scorecard per foursome** — every player enters their gross; the engine handles strokes given, best-ball math, stableford points, and match-play notation.
     *Subtitle:* "Walk the card together. The math figures itself out."
  5. **Stableford alongside Match Play** — flip a switch per match. Standard 4/3/2/1/0 or modified scales. Lives on the same scorecard.
     *Subtitle:* "Two scoring modes, one entry surface."
  6. **Buddies** — after every trip, the people you played with get auto-saved to your buddy list. One tap to add them to next year's roster.
     *Subtitle:* "Skip the email-and-handicap re-typing. They're already there."

Cards auto-advance every ~5 seconds with subtle progress dots underneath. Hover (desktop) pauses the carousel.

**4. End cap (below the carousel).** Short — 3 lines max. The vibe:

> "You don't need another spreadsheet.
> Your trip deserves a scoreboard.
> Ditch Google Sheets — BuddyCup tracks the whole thing live."

Followed by a secondary CTA button ("Try it for your next trip").

**5. Footer.** Minimal — BuddyCup wordmark, social row, unsubscribe link. No legal wall.

### Animation constraints

- Pure HTML + inline CSS. No `<script>`, no external CSS files.
- All animations use `@keyframes` + `animation` shorthand, scoped via attribute selectors.
- Keep it under 102KB total (Gmail clipping threshold).
- Provide a "lite mode" fallback (`@media (prefers-reduced-motion)`) that disables the carousel auto-advance and shows the first slide statically.
- Gmail / Outlook on mobile, iOS Mail, Apple Mail, Yahoo all support CSS keyframes — but Outlook desktop on Windows does not. For Outlook desktop, gracefully degrade the carousel to a vertical stack of all 6 cards.

### Output format

A **single self-contained HTML file**. Inline all styles. Test rendering at 600px width (typical email client). Use placeholder image URLs (`https://placehold.co/...`) for the per-slide illustrations — the user will swap in real images later.

Include a brief comment block at the top of the file that explains:
- Which animations are in use
- The mobile breakpoint (~ 480px)
- The Outlook fallback strategy

Return only the HTML. No prose summary.
