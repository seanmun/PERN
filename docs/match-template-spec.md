# Match templates + foursome-first scoring

> Planning doc. ~~No code lands until the open decisions below are answered.~~ **All five decisions resolved 2026-06-13** — see the [Decisions](#decisions-to-make-before-any-code) section. Implementation order at the bottom is the to-do list.

## Goal

Today a tee time and a match are tangled together — the score-entry button is keyed to a match, and the schedule assumes every player in a tee time is in the round's primary match. That makes some real-world setups awkward (e.g. an outing with two foursomes where the admin wants both intra-group 1v1 singles *and* a 4v4 best ball across the whole field).

We want:

1. **Foursomes are the unit of score entry.** A tee time holds the 4 players who walk together and fill out a scorecard.
2. **Matches are pure result views.** A match is a format + a participant subset, computed from the canonical `hole_scores`. Any combo: 1v1, 2v2, 4v4, 1v1 across foursomes — anything.
3. **Admins assemble matches via a drag-and-drop template.** Pick a format → template renders empty slots (`teamA: 2, teamB: 2`) → drag players from the roster (grouped by foursome) into slots.
4. **Format-driven validation.** Formats that require physical proximity (scramble, alt shot, two-man aggregate) constrain drops to within a single foursome *per side*. Formats that don't (singles, best ball, stroke) allow any combination.

## Mental model shift

| Before | After |
|---|---|
| Tee time → match → score-entry button | Tee time → score-entry button (4-player individual scorecard) |
| Match defines the format of the round | Match is a result view; round only defines the entry mode |
| One match per tee time (with stacking workaround) | Many matches per round, free-shaped, decoupled from tee times |
| Team-input formats own their own scorecard | Team-input formats still own a team-line scorecard, but the team-line lives **inside the foursome's entry surface** (see "Team-input handling" below) |

## Data model deltas

### `match_formats` (new lookup / hardcoded enum metadata)

The current `match.format` is an enum. We add a per-format metadata table (or a constant in `lib/scoring/formats.ts` — see [Decision: format metadata location](#decision-format-metadata-location)) with the following shape:

```ts
type FormatMeta = {
  id: 'singles' | 'best_ball' | 'two_man_aggregate' | 'scramble' | 'alternate_shot' | 'stroke';
  label: string;
  // Slot template — how many positions on each side.
  template: { teamA: number; teamB: number };
  // Per-side same-foursome constraint. True = every slot on a side must
  // pull from one foursome. The two sides do NOT need to share a foursome.
  requiresSameFoursomePerSide: boolean;
  // Whether the format records a team-level gross per hole instead of (or
  // in addition to) per-player. Drives the entry surface — see below.
  inputMode: 'individual' | 'team';
};
```

Reference table:

| Format | Template | Same-foursome per side? | Input mode |
|---|---|---|---|
| `singles` | 1v1 | No | individual |
| `best_ball` (2v2) | 2v2 | No | individual |
| `best_ball` (4v4) | 4v4 | No | individual |
| `two_man_aggregate` | 2v2 | **Yes** | individual |
| `scramble` (2-man) | 2v2 | **Yes** | team |
| `scramble` (4-man) | 4v4 | **Yes** | team |
| `alternate_shot` | 2v2 | **Yes** | team |
| `stroke` | N-vN | No | individual |
| `thirty_ball` ("30 Ball") | 3v3 | **Yes** | individual |

`thirty_ball` ("30 Ball"): a house budget-selection game, NOT a
derived-aggregation format like everything else in this table. All 6
players (3v3) play their own ball every hole, full round. Each side has
a budget of `THIRTY_BALL_BUDGET` (30) scores — out of up to 3 players x
18 holes = 54 possible — that they choose to count toward their total.
Per hole a side can select 0, 1, 2, or 3 of its players' scores; any
combination. Selected nets are SUMMED (not best-of). The side with the
lower 18-hole cumulative total wins; equal totals halve. The budget
itself is NOT engine-enforced — captains self-police hitting exactly 30
by hole 18; the engine just sums whatever's marked counted and reports
the running count.

This needs a genuinely bespoke resolution (`computeThirtyBallMatch` in
`packages/scoring/engine.ts`) — it's the one format whose per-hole
"score" is a live human decision (which grosses count), not something
derivable from the grosses alone the way best-ball/aggregate/stableford
are. `hole_scores.counted` (boolean, default false) stores that
decision per player per hole per match; toggled via
`toggleHoleScoreCounted` in `lib/actions/scores.ts`, surfaced on the
match detail page (`ThirtyBallScorecard` — the one exception to that
page being read-only, since "which scores count" isn't the same
question as "what did you shoot").

> 2v2 vs 4v4 best ball: same format ID, different template size. The admin picks the size at match-create time. Same for scramble. We may model this as `format` + `sideSize` rather than baking sizes into the enum — see open Qs.

### `matches` table

Add:

- `entry_mode` ENUM `'group' | 'derived'` — derived matches compute from other matches' scores and don't show up in any tee time's entry surface. (Optional given the foursome-first refactor; see [Decision: do we still need entry_mode?](#decision-do-we-still-need-entry_mode).)
- `template_size_a INT NOT NULL`, `template_size_b INT NOT NULL` — denormalized side sizes so the validator doesn't have to recompute from participants.

`match_participants` stays as-is. We add a `side ENUM 'A' | 'B'` if it isn't there yet (today the engine derives side from team UUID sort — fine for v1, brittle for arbitrary cross-foursome combos).

### `tee_times` table

No structural change. A tee time *is* a foursome. We may want a `score_entry_locked_at TIMESTAMP` so that once admin marks scoring open, the foursome's roster can't change without an explicit override.

## Score entry shift

**Today:** Tee time card → "Enter scores" button → opens the *widest* match → renders rows for those participants.

**Tomorrow:** Tee time card → "Enter scores" button → opens the *tee time's* scorecard → renders rows for the 4 players in the tee time. Below that, if any *team-input* matches involve players in this tee time, a second section renders the team line(s):

```
Foursome 1 · Pine #4 · 8:42a
  Individual gross         Hole 1  2  3  ...
  Sean      (HCP 12)         5     —   —
  Eric      (HCP 18)         6     —   —
  Munley    (HCP  9)         4     —   —
  Dan       (HCP 14)         5     —   —

  Team line (Scramble, 2-man) — for the Sean/Eric vs Munley/Dan match:
  Sean+Eric                  5     —   —
  Munley+Dan                 5     —   —
```

Individual + team rows live in the same scorecard so the foursome only opens one screen. The team rows only appear if a team-input match's roster matches the foursome.

The fan-out engine stays — it just keys off the player + hole, not off the match. All in-group matches and any cross-foursome matches that include these players recompute on next read.

## Drag-and-drop match builder

Flow:

1. Admin lands on **Round → New match**.
2. Picks **format** (singles / best_ball / scramble / alt shot / two-man aggregate / stroke).
3. If the format has size variants (best ball, scramble), picks **side size** (1v1, 2v2, 4v4).
4. Right pane renders the **slot template** — empty cards labeled `Team A · 1`, `Team A · 2`, `Team B · 1`, `Team B · 2`, etc., with the team's color stripe.
5. Left pane renders the **player roster grouped by foursome**, each player chip showing their foursome number badge and team color dot.
6. Admin drags chips into slots. While dragging:
   - Slots that would violate the format's `requiresSameFoursomePerSide` rule render grayed/red with a tooltip ("Team A is locked to Foursome 2 for Scramble").
   - Slots that would violate team membership (Team A slot can't hold a Team B player without admin override) render the same way.
7. **Save** stays disabled until all slots are filled and validation passes. Failing reasons render inline above the button.

**Drag library:** `@dnd-kit/core` (already vetted, accessible, mobile-friendly). No new heavyweight dependency.

## Auto-fill presets

Off the foursomes, one-click templates for the common shapes:

- **Intra-foursome singles.** For each foursome, create a 1v1 match between the two players whose teams differ (assumes 2/2 split). 4 foursomes → 4 singles matches.
- **Intra-foursome 2v2 best ball.** Same shape, one match per foursome, Team A's 2 vs Team B's 2.
- **Field-wide 4v4 best ball.** One match, all Team A in slot A, all Team B in slot B, regardless of foursome.
- **Field-wide 4v4 aggregate.** Same as above with `two_man_aggregate` × however many.

Admin can drag to tweak after the preset fills. Presets are pure UI helpers — they call the same create-match endpoint as manual builds.

## Handicap methods

Every match carries a `handicap_method` (enum, default `group_low`)
deciding how strokes are computed — orthogonal to both format and
scoring. Resolved in one place: `apps/web/lib/scoring/handicap-method.ts`
(`resolveMatchHandicaps`), used by recompute, the match page, the cup
tab's live rows, both score-entry surfaces, and quick-result.

| Method | Strokes basis |
|---|---|
| `group_low` (default) | Differential vs the lowest handicap in the FOURSOME (tee-time roster; falls back to match participants for cross-foursome matches). The original Cup convention. |
| `match_low` | Differential vs the lowest handicap in the MATCH. |
| `course` | Full course handicap per player: trip handicap treated as a GHIN index, converted via the round tee's slope/rating — `round(Index × Slope/113 + (Rating − Par))` (`packages/scoring/handicap.ts`). Scratch baseline 0. Falls back to the raw handicap when the tee lacks slope/rating; the match builder warns and the course admin page has manual slope/rating inputs per tee (extraction also fills them from the scorecard photo). |

The **individual leaderboard** ignores per-match methods entirely — it
always uses the full course-handicap basis (net, stableford points, and
the "+N" chip all derive from one allocation per player per round), so
the season-long race is consistent regardless of how any given match
was handicapped.

The foursome score-entry card's stroke dots follow the PRIMARY match's
method (a physical card can't render two allocations at once); stacked
side matches with a different method still resolve their own strokes on
their own match pages.

## Cup-point overlap

Same 4 players, three overlapping matches: 1v1 singles + 2v2 best ball + 4v4 best ball. Each match's result wants to award Cup points off the same shots — that triples the round's points pool unless we decide otherwise.

Three stances to pick from:

1. **All matches award their own points.** Simple, transparent, but inflates point pools when admin layers many matches on one round. Burden is on the admin to choose carefully.
2. **Round has a points budget; matches split it.** Round admin assigns a weight per match (default equal split). More controllable, more config.
3. **One "primary" match per round.** The primary awards points, the rest are exhibition / bragging rights. Easy mental model, less expressive.

I'd default to **(1)** with a per-match `awards_cup_points: boolean` (default `true`) — admin can flip the 4v4 to exhibition if it shouldn't double-count. Cheap, expressive, doesn't force a budgeting system we don't need yet.

## Migration / Pinehurst compatibility

Pinehurst's existing rounds today use one match per tee time. After the refactor:

- All existing matches become regular matches with `entry_mode='group'` (or no `entry_mode` field at all if we drop it).
- Score entry routes change from `/matches/[id]/score` → `/tee-times/[id]/score`. The match-id route stays as a redirect to the tee time, for any links/bookmarks.
- The score-entry UI rendering doesn't change shape for existing rounds — same 4-player scorecard.
- Round's existing single `format` field becomes the *default* format pre-selected when admin clicks "New match" on that round. We keep the column so old rounds keep working but the UI no longer treats it as the source of truth for what's being played.

No data migration scripts needed beyond optional column adds.

## Decisions to make before any code

### Decision: format metadata location ✅

- [x] Hardcoded `const FORMAT_META` in `lib/scoring/formats.ts`
- [ ] ~~`match_formats` table in DB~~

**Resolved:** hardcoded. Formats change rarely and the engine is already pure functions in `lib/scoring/`. Promote to a table later only if "build your own format" ever becomes a feature.

### Decision: do we still need `entry_mode`? ✅

- [x] **Drop it.** All matches are derived. Score entry is per-tee-time, always.
- [ ] ~~Keep it.~~

**Resolved:** dropped. The team-input section of the foursome scorecard covers the scramble/alt-shot case. Less schema, fewer concepts.

### Decision: side size as enum vs scalar ✅

- [ ] ~~Bake side sizes into the format enum.~~
- [x] Keep formats abstract, add `template_size_a` / `template_size_b` columns on `matches`.

**Resolved:** scalar. The engine math is identical for 2v2 and 4v4 best ball — only roster size differs.

### Decision: team-input rendering in the foursome scorecard ✅

- [x] Render whichever rows have a live match consuming them.

**Resolved:**

- Live matches with `inputMode='individual'` (singles, best ball, two-man aggregate, stroke) → render all 4 player rows.
- Live matches with `inputMode='team'` (scramble, alternate shot) → render two team rows (one per side), no individual rows for that match's players.
- Foursome has both → render both sections so the admin enters each once.
- Foursome has no live match at all (rare — admin still building) → fall back to 4 individual rows.

### Decision: validation strictness on save ✅

- [x] Hard block save if validation fails.
- [ ] ~~Soft warning, allow save.~~

**Resolved:** hard block. Save button stays disabled, failing reasons render inline above the button. No broken matchups ever in the DB.

## Out of scope (for this spec)

- Cross-round matches (a "Cup-long best ball" running across every round). Same data model could support it by making `match.round_id` nullable + adding `match.trip_id`, but we don't need it for the upcoming outing.
- Skins / side bets as first-class entities. They're a derived view today and can stay that way.
- Auto-handicap recomputation when rosters shift. Handled by existing engine.

## Retrofit strategy

> Read this before opening any of the implementation-order PRs below. The headline is that **every existing match already fits the new model** — Pinehurst's rounds are all single-foursome, individual-input, which is the trivial case of foursome-keyed scoring. So this is mostly a routing + UI shift, not a data migration.

### 1. Build new route alongside old, no big-bang swap

`/trips/[slug]/tee-times/[id]/score` ships next to the existing `/trips/[slug]/matches/[id]/score`. Both work for a PR cycle. Once the new route renders correctly for Pinehurst's existing rounds, the old route becomes a 301 redirect to `/tee-times/{match.teeTimeId}/score`. Existing bookmarks and links survive. Delete the old route only after nothing in the codebase links to it (grep audit before removal).

### 2. `matches.tee_time_id` becomes optional, not load-bearing

Today it's how score entry locates the match. Tomorrow score entry reads from the **tee time's roster**, not the match. Keep the column — it's still useful as "this match's primary foursome" for in-group matches (so the schedule can group them under the right tee time card). **Cross-foursome matches** (4v4 best ball spanning two groups, 1v1 between two foursomes) set `tee_time_id = null` and render in a separate "Round rollups" lane on the schedule.

Required schema delta when we hit this step: `ALTER TABLE matches ALTER COLUMN tee_time_id DROP NOT NULL;` if it's NOT NULL today. Verify before the PR.

### 3. `round.format` stays as the round's display identity, not a constraint

"Round 1 · Best Ball day" is still the headline on the schedule. Matches under the round can have any format the admin picks. The default-from-round behavior in the New Match form stays — it's just a *suggestion* now, not a source of truth. No data change.

### 4. Leaderboard, Cup tab, fan-out engine — zero changes

All three are already match-keyed and read from `hole_scores`. As long as `hole_scores` stays the canonical input table (which it does), every match — old single-foursome or new cross-foursome — recomputes the same way. The 39 engine tests (`tests/engine.test.ts` + `tests/formats.test.ts`) already lock this in.

### 5. Validation + tests gate each step

Each new route lands with vitest tests that prove the existing Pinehurst data still scores correctly through the new path. We don't ship step 3 (new route) until "render every Pinehurst tee time's scorecard via the new route and confirm scores load identically to the old route" is green. The test fixture clones a Pinehurst round and asserts the leaderboard output is byte-identical across both code paths.

### Risk to design around

If a trip ever puts a player in two tee times of the same round (admin mistake, twosomes restructured mid-round, captain edit gone wrong), the foursome-keyed scorecard model becomes ambiguous about *which* tee time owns that player's gross. Pinehurst doesn't hit this today, but the admin UI for tee-time assignment should enforce **"one player ↔ one tee time per round"** with a hard constraint at the action layer (and ideally a partial unique index in Postgres). Cheap rule to add when we touch the tee-time admin UI; expensive bug to chase later if someone hand-edits prod.

### Backward-compat checklist (run before each PR)

- [ ] Existing match-keyed URL still loads or 301-redirects
- [ ] Existing rounds render their scorecard via the new route with identical scores
- [ ] Leaderboard for a known round matches pre-refactor output (snapshot test or screenshot diff)
- [ ] Cup-tab live state for an in-flight match matches pre-refactor
- [ ] All 39 engine/format tests still green
- [ ] `npm run build` green (no Turbopack-only success — full prod build)

## Implementation order (once decisions are locked)

1. ✅ Hardcode `FORMAT_META` in `lib/scoring/formats.ts` with the table above. — *shipped in `ea3b5e6`*
2. ✅ Add `template_size_a` / `template_size_b` to `matches` (migration via Neon SQL editor per house style). — *shipped in `187197d`*
3. Build the foursome scorecard route: `/trips/[slug]/tee-times/[id]/score`. Render individual rows for the 4 players. Existing match-keyed score route redirects here.
4. Add the team-line section to the scorecard (renders when a team-input match's roster matches the foursome).
5. Build the **New match** flow: format picker → side-size picker → drag-and-drop template with validation.
6. Build the auto-fill presets on top of the same create endpoint.
7. Update the schedule to render matches independently of tee times, with a cross-foursome match badge for the 1v1-across-groups / 4v4 cases.
8. Cup-tab and leaderboard adjust to read from any match, no special casing.

Each step is a separate PR. The score-entry route move (step 3) is the load-bearing one — everything else is additive.
