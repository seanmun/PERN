# BuddyCup — Golf Event Setup Milestone Spec

> **For Claude Code:** This is the authoritative spec for the event-creation and match-setup
> feature. Do **not** "simplify" the data model. The decoupling rules and the computed/override
> layering exist for golf-domain reasons and are non-negotiable. If a change seems to require
> collapsing two concepts listed here as separate, you are wrong — re-read the rule.

---

## 1. Domain primer (read this first)

Three rules cause every bug if violated:

1. **A match is NOT a tee group.** A *tee group* (foursome) is who physically plays together.
   A *match* is a competition between two *sides*. They are independent. One round can have
   tee groups AND matches that cut across those groups (e.g. two foursomes each with a singles
   match, plus a separate 4v4 best-ball drawing players from both foursomes).
2. **Raw scoring and match resolution are separate layers.** Every player always enters a gross
   score per hole — that is the source of truth. Match results, Stableford points, and standings
   are all *derived* from raw scores. Never store a match result as primary data.
3. **Computed values and admin overrides live in separate fields**, read as `override ?? computed`.
   The recalc engine writes only `computed`. The admin writes only `override`. They never touch
   each other's column. Collapsing them means every recalc wipes the admin's manual fixes.

---

## 2. Entity model

```
Event
  id
  type: "match" | "outing" | "trip"
  name
  status: "setup" | "active" | "final"
  courses: Course[]        // 1 for match/outing, many for trip
  players: Player[]        // event roster
  teams: Team[]            // optional; empty for plain singles match
  rounds: Round[]          // 1 for match, 1+ for outing, many for trip

Course
  id
  name
  holes: Hole[]            // exactly 18 (or 9)
Hole
  number: 1..18
  par: number
  stroke_index: 1..18      // difficulty rank; drives stroke allocation

Player
  id
  name
  email?
  handicap: number         // Course Handicap, IMMUTABLE source of truth — never mutated by allowance

Team
  id
  name
  member_ids: player_id[]

Round
  id
  course_id
  date
  default_scoring: "stroke" | "stableford" | "match_play"
  tee_groups: TeeGroup[]   // logistics
  matches: Match[]         // competition — decoupled from tee_groups

TeeGroup
  id
  name                     // "Group 1"
  player_ids: player_id[]  // cap 4

Match
  id
  format: "singles" | "2v2" | "scramble" | "alt_shot" | "best_ball"
  scoring: "stroke" | "stableford" | "match_play"
  side_size: number               // DERIVED from format — see §4, do not free-edit
  team_input_mode: "individual" | "single_score"  // DERIVED from format
  status: "scheduled" | "in_progress" | "final"
  handicap_allowance: number      // percent, e.g. 90 or 100; default-by-format, admin-overridable
  handicap_mode: "gross" | "net"
  relative_to_low: boolean        // true = subtract lowest playing handicap (standard match play)
  sides: Side[]                   // exactly 2

Side
  id
  member_ids: player_id[]         // 1 = individual; 2-4 = team
  // NO score stored here. Scores derive from HoleScore rows.

HoleScore                         // raw scoring layer — source of truth
  id
  round_id
  player_id
  hole_number
  gross: number

MatchPlayerHandicap               // override layer — ONLY created when admin overrides
  match_id
  player_id
  computed_strokes: number[18]    // engine-written, read-only to admin
  override_strokes: (number|null)[18]  // admin-written; null per index = use computed
  override_reason?: string
  // effective stroke for hole i = override_strokes[i] ?? computed_strokes[i]
```

---

## 3. Event type presets

One creation engine, three presets. Do **not** build three separate flows.

| | match | outing | trip |
|---|---|---|---|
| courses | 1 | 1 | many |
| rounds | 1 (locked) | 1+ | many |
| teams layer | hidden | optional | expected |

Type only sets defaults and which steps are shown/locked. The underlying model is identical.

---

## 4. Match format → derived fields (enforce in zod)

| format | side_size | team_input_mode | default allowance |
|---|---|---|---|
| singles | 1 | individual | 100 |
| 2v2 | 2 | individual | 90 (best-ball convention) |
| best_ball | 2–4 | individual | 90 |
| scramble | 2–4 | single_score | per-event default (low; admin sets) |
| alt_shot | 2 | single_score | 100 |

- `side_size` and `team_input_mode` are **derived from `format`** — the form recomputes them when
  format changes. The match cannot be submitted with a side whose member count violates `side_size`.
- `team_input_mode = single_score` → scorecard renders **one score row per side** (team treated as
  an individual). `individual` → one row per player.

---

## 5. Handicap pipeline (strict order, never merged)

```
Course Handicap   = player.handicap                       (immutable)
Playing Handicap  = round(Course Handicap × allowance%)    (per match)
Strokes Received  = allocate by hole stroke_index          (low SI gets strokes first)
if relative_to_low: subtract lowest Playing Handicap in match from all sides
Effective stroke per hole = override_strokes[i] ?? computed_strokes[i]
```

- Allowance lives on the **Match**, not globally (formats use different standard allowances).
- Allowance produces Playing Handicap; it **never mutates** `player.handicap`.
- Engine writes `computed_strokes`. Admin edits write `override_strokes`. Scorecard reads
  `override ?? computed`.

---

## 6. Match resolution (derived, never stored as primary)

- **stroke**: sum gross (minus strokes if net) per side; low total wins.
- **stableford**: per hole, points from net score vs par; sum per side.
- **match_play (points per hole won)**: per hole, compare each side's *effective* score
  (lowest ball for best_ball; the single team score for scramble/alt_shot; the player's net for
  singles). Lower wins the hole; tie = **halved**. Running tally as ± .
  - Display in golf notation: "2 UP", "AS" (all square), "3&2" when closed out (lead exceeds
    holes remaining).
- **Halved hole**: explicit outcome, awards no hole to either side, match score unchanged.

---

## 7. Standings / points-per-match-won (event-level rollup)

Separate layer ON TOP of match results. This is the Ryder-Cup team-points concept and is
**distinct** from "points per hole won" inside a match_play match. Do not conflate the two — the
name collision is a known source of confusion.

- Each completed match awards points to the winning side (win = 1, halve = 0.5, configurable).
- Roll up by Team for team standings, or by Player for individual.

---

## 8. Admin setup UX

### Shell
Persistent **stepper** (not a locked wizard): `Event → Course → Players → Teams → Rounds & Matches`.
Every step jump-clickable; shows completion state. Trip admins bounce around — don't fight it.

### Step: Players — bulk-first
Single paste/type `textarea` (one name or `name, email` per line) → parse on newline → roster chip
list. No one-at-a-time form. (No library — plain textarea split.)

### Step: Teams — two-column drag
Unassigned pool (left) ↔ team buckets (right). Drag to assign, drag between teams to rebalance.
Live team-size counts. Hidden entirely for plain singles match.

### Step: Rounds & Matches — the critical screen
Per round, two stacked zones:

**Tee Groups (top):** drag players into foursome cards. Cap 4 per card; warn (Sonner) on overflow.

**Matches (bottom):**
- Pre-fill **suggested** matches from each tee group (offer singles or 2v2 per foursome) — admin
  can accept, edit, or ignore.
- Each match card = a form: **format** select, **scoring** select, **Side A** drop-zone,
  **Side B** drop-zone, **allowance chip** (tap to override), **handicap_mode** toggle.
- Admin builds custom matches by **dragging players into the two Side zones independently of tee
  groups** — this is how the 4v4-across-two-foursomes case becomes the obvious action, not a
  power-user mystery.
- **Card reshapes on format change**: scramble/alt_shot collapse each side to a single score row
  and accept 2–4 players per side; singles locks sides to 1 each. The UI enforces `side_size` so an
  invalid match can't be created.

**Live scoreboard preview:** render the player-facing scoreboard (even empty) as matches are added,
so the admin catches mistakes before round day.

---

## 9. Scoreboard requirements

- **Always:** table of every individual's gross (+ Stableford if that round uses it). Derived from
  HoleScore. Non-negotiable.
- **1v1 / 2v2:** show match score + per-hole won/halved indicators.
- **scramble / alt_shot:** side shown as one row, one score (team treated as individual).
- **Outing dual-match:** a round may carry multiple matches over the same players simultaneously
  (per-group singles + a cross-group 4v4). Works because matches reference players, not tee groups.

---

## 10. Library stack

- **`@dnd-kit/react`** (drag and drop — tee groups, sides, teams). Use `DragOverlay` for the drag
  ghost; `@dnd-kit/helpers` `move` for reordering. Touch + keyboard support needed (admins on phones
  on the course). *Alternative if preferred: legacy `@dnd-kit/core` + `@dnd-kit/sortable`.*
- **`react-hook-form` + `zod`** (match card form; `watch('format')` drives conditional fields;
  zod enforces `side_size`-from-format so invalid matches can't submit).
- **`shadcn/ui`** (Card, Select, Badge for allowance chip, Sonner for warnings, Dialog, date picker).
  Stepper: community component or ~40 lines from primitives.
- **No extra libs** for bulk paste (textarea), scoreboard (styled table), or dates (shadcn picker).

---

## 11. Acceptance criteria

- [ ] Creating an event of each type shows the correct preset (locked rounds for match, course
      loop for trip, teams hidden for singles).
- [ ] A round can contain tee groups AND matches that reference players outside those groups.
- [ ] Two per-group singles matches and one cross-group 4v4 best-ball coexist in one round and all
      compute correctly from the same HoleScore rows.
- [ ] Changing a match's `format` automatically updates `side_size` and `team_input_mode` and
      reshapes the card; an invalid side count cannot be saved.
- [ ] scramble/alt_shot render one score row per side; best_ball/singles render one row per player.
- [ ] Setting allowance to 90% changes Playing Handicap but leaves `player.handicap` unchanged.
- [ ] An admin per-hole stroke override survives a subsequent recalc (engine only writes
      `computed_strokes`).
- [ ] match_play matches display "2 UP" / "AS" / "3&2" correctly, including halved holes.
- [ ] Event standings (points-per-match-won) roll up separately from in-match points-per-hole.
- [ ] Scoreboard always shows all individual gross scores regardless of match formats present.
- [ ] Tee group cards cap at 4 and warn on overflow.
