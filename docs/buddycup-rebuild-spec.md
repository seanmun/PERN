# BuddyCup — Rebuild Specification

**This is the target architecture.** It is not a suggestion, a starting point, or a
brainstorm. Deviation from the contracts in §2–§8 is a bug, even if your deviation
"works." The previous 30 hours of failure came from an agent improvising structure;
this document exists so that never happens again.

One spec body, two preambles. Read the preamble that applies to you, then read
everything else.

---

## Preamble A — In-place reconstruction (repo `seanmun/PERN`)

You are working in the existing repo. Your job is a **migration to this spec**, not
a repair of what exists.

- Read `docs/session-failures-2026-07.md` before touching anything.
- **Reuse what already matches this spec**: `packages/scoring/` (engine, formats,
  lineup, validation — all 149 tests), `db/schema.ts` + migrations,
  `lib/auth/permissions.ts`, `lib/trip-provision.ts`. These are trustworthy.
- **Delete what this spec deletes** (§10). Deleting routes is the work. Do not
  polish, refactor, or "improve" any screen on the kill list. If you find yourself
  editing a file scheduled for deletion, stop.
- The database is production and shared. **You may not run seed scripts, test
  scripts, or any write of fabricated data against it. Ever. No exceptions.**
  Verification happens through the harness (§11) against a Neon branch, never main.
- `main` auto-deploys. Nothing merges until the harness passes.

## Preamble B — Greenfield rebuild (new repo)

You are building this app from zero against the **existing** Neon database.

- The database schema is inherited, not yours to design. Copy `db/schema.ts` and
  the migrations folder from `seanmun/PERN` verbatim. The schema is the source of
  truth; never regenerate it from the DB; never alter existing tables except via
  the additive migrations listed in §12.
- Copy `packages/scoring/` verbatim, including tests. Do not rewrite it.
- Copy `lib/auth/permissions.ts`. All permission checks route through it, never
  inline.
- Same env vars, same services (Clerk, Neon, Vercel, Blob, Anthropic, OpenAI,
  Resend, Google Places, golfcourseapi). Reuse `.env.example` from the old repo.
- npm workspaces, not pnpm (Vercel builds fail with pnpm in this setup).
- Production data (`pcup26` and other real trips) must load and render correctly
  in your rebuild. That is an acceptance criterion, not a nice-to-have.
- Same production-DB prohibition as Preamble A: no seeds, no test writes. Harness
  runs against a Neon branch.

---

## 1. What the app is

Groups of friends set up golf competitions and score them hole by hole. Three
event kinds, which are the **same structure at different depths** (§6):

| Kind | Definition |
|---|---|
| **Match** | One round, one foursome (2–4 players), one or more matchups |
| **Outing** | One round, two or more foursomes, teams, matchups |
| **Trip** | One roster, multiple rounds (each round = one Match/Outing-shaped unit) |

The flagship live event is **Pinehurst Cup 2026** (`pcup26`, 12 players, 19–22 Aug
2026). The rebuild must not damage it. The trip is in ~3 weeks.

---

## 2. The layering rule (the one law)

Every subsystem in this app follows one pattern: **a stable foundation, plus
override/derivation layers that sit on top and can never mutate the foundation.**

| Foundation | Layer on top |
|---|---|
| Player's individual gross score per hole | 30 Ball attribution, net scores, match resolution |
| Global user record | Per-event membership overrides (avatar, handicap) |
| Course data from API | Nothing — course facts are immutable inputs |
| Trip-level defaults | Per-round settings that inherit them |

The July failure was this rule being violated: format-specific logic was pushed
down into shared score storage, so adding 30 Ball corrupted singles and 2v2.
**If a change to one format can break another format, the layering has been
violated and the change is wrong.**

---

## 3. Players and identity

### 3.1 Global person (`users`)

One row per human. Real name, email, real handicap, main avatar. This is what
follows a person across all events and is the default source for everything.

### 3.2 Event membership (`trip_members`)

The same person inside one event. This layer may **override** without touching
the global record:

- `trip_handicap` — event-specific handicap, admin-editable
- `avatar_url` — event-specific photo (the "funny profile pic" feature). Global
  avatar is untouched and used by default in any new event.

**Avatar resolution is one function, used by every screen:**
`membership.avatar_url ?? user.avatar_url ?? initials`. There is exactly one
avatar component in the codebase (§10). The "half the guys have pictures" bug was
five components resolving avatars five different ways.

### 3.3 Ghost players and claiming

- Admin creates a player with **name + email (+ optional handicap)**. This is a
  full `trip_members` row with `user_id = null` — a *ghost*. Ghosts participate
  completely: teams, groups, matchups, scores.
- Invite email goes out (Resend). When someone signs in via Clerk with that email,
  claiming binds the ghost to their new `users` row. Nothing else about the player
  changes.
- **Collision rule:** if the entered email already matches an existing `users`
  row, attach that user — never create a duplicate ghost. This check is mandatory
  at creation time.
- **Edge policies:** (a) email already belongs to a member of *this* trip →
  reject with a message, never a second membership; (b) ghost name differs from
  the claimer's Clerk name → the membership `nickname` stays as the admin set
  it, the global `users` name comes from Clerk; (c) user signs up under a
  different email → no auto-claim; the admin edits the ghost's email or the user
  joins via the trip invite link, which binds the ghost regardless of email.
- An admin can build an entire trip — all 12 players, teams, matchups — before
  anyone has logged in.

### 3.4 Player picker UX

When adding players: show **recently played with** first (last ~20 people who
shared an event with the admin) as one-tap chips, then search-by-name/email
against existing users, then "create new" (ghost) as the fallback. Tap, don't
type.

---

## 4. Courses and handicaps

### 4.1 Course data

Courses come from golfcourseapi (one-tap import) or Google Places + manual entry.
Per-hole par/yardage/handicap-index, per-tee slope/rating. If the API lacks
slope/rating, prompt for a scorecard photo and run the existing Claude extraction
flow. Course facts are immutable foundation data.

### 4.2 The handicap pipeline (three stages, strictly ordered)

```
(raw handicap: membership override ?? user handicap)
  + (course tee: slope, rating)
  + (round's allocation rule)
        → strokes received per hole            [stage 1: allocation]
strokes per hole + gross scores → net per hole  [stage 2: net]
net per hole → match resolution                 [stage 3: resolver, §7]
```

Each stage only knows its own job. The resolver never sees a raw handicap; the
allocator never sees a matchup.

### 4.3 Allocation rule placement

The rule (`group_low` vs `match_low` vs `course`) **lives on the round**. The
trip carries a default; every round inherits it unless overridden. A single-round
match/outing is just one round holding one rule — no special case.

---

## 5. Scoring: exactly three input shapes

All score entry reduces to three shapes. No fourth shape may be introduced.

| Shape | Formats | Storage |
|---|---|---|
| **Individual** | singles, best ball, 2v2, stroke, two-man aggregate, 30 Ball, BBB | `hole_scores`: one gross per player per hole. **Always written, for every format that has per-player play.** |
| **Attribution** | 30 Ball | A pointer layer (`counted` / `committed_at` on `hole_scores`) marking which already-entered strokes count toward the side's 30. **References individual scores; never replaces or restructures them.** After each hole, the side commits which of its scores count; commitment locks the hole. |
| **Team score** | scramble, alternate shot | One gross per **side** per hole. No per-player scores exist for these formats. **V1: team formats play gross** — no handicap allocation (Pinehurst's scramble is a "Fun Scramble"). Handicapped team play is out of scope; do not design it. |

BBB additionally records per-hole point awards (`bbb_hole_points`) — row
existence is the commit; that table is already correct.

### 5.1 The fan-out rule (stacked formats)

`hole_scores` is keyed per **match**, but reality has one gross per player per
**round**. When formats stack (one foursome carrying Best Ball + a Singles side
bet), score entry is per-group: **one input per player per hole, and the write
fans out to a `hole_scores` row in every match containing that player in that
round.** Edits fan out identically. Each format's resolver reads only its own
match's rows. No entry screen is ever per-format; the designated scorer belongs
to the foursome, not to a format.

### 5.2 30 Ball attribution state machine

- After a hole's grosses are entered, the side commits which of its scores
  count. Commit sets `counted`/`committed_at` and **locks that hole for that
  side**.
- A committed hole can be un-committed only by a captain of that side or a trip
  admin, and only while the match is not `completed`.
- Editing a gross on a committed hole is rejected; un-commit first, edit,
  re-commit.

The scorecard entry screen supports: one designated person per foursome (or per
side) entering everyone's scores; players entering their own. `canEnterScoreFor`
in the permissions layer decides — never inline checks.

---

## 6. Admin setup: one round-builder, nested

**Do not build three forms. Build one atom and wrap it 0, 1, or N times.**

### 6.1 The atom: the round-builder

One well-designed unit that asks three questions:

1. **Where** — course picker (API search → auto-fill slope/rating → scorecard-AI
   fallback), date, tee.
2. **Who** — player picker (§3.4). At outing/trip level, players are set once
   above the round and the round only handles grouping.
3. **What** — game(s), multi-select. Formats stack (a foursome can carry Best
   Ball + a Singles side bet). From the chosen games, **`deriveLineup()` derives
   teams, foursomes, and matchups automatically** from `FORMAT_META` — scramble/30
   Ball put teammates together, 2v2 pairs teammates, etc. Derived groups render
   with a preview; admin can pin a player to a team; full drag-and-drop is not
   v1.

### 6.2 The wrappers

- **Match** = the atom, alone. Course, 2–4 players, game(s), submit.
- **Outing** = one team-split step (auto snake-draft by handicap, `autoSplitByHandicap`,
  with pin-to-team) + the atom.
- **Trip** = trip header (name, dates, roster once, handicap-rule default) + the
  atom repeated per round. Rounds may be left as **shells** (course + tee times,
  no players/matchups) and filled later — shells are a first-class state
  (Pinehurst's captains-pick round depends on this), not an error. Shell rules:
  scores cannot exist on a shell (scores hang off matches, which don't exist —
  structural, not a validation); promoting a shell = adding groups/matches later
  through the same round-builder, touching nothing else; the scoreboard **omits**
  rounds with no resolved matches — never renders them as zeros.

Ask each question once, at the highest level where it's true. Never re-ask below.

### 6.3 Submission contract

- **Nothing writes until submit.** No queued saves, no per-step persistence. This
  structurally eliminates the dominant July bug class.
- On submit: validate the entire payload with `validateBuilderState` (the same
  function the client used to grey out illegal states), then write in order
  trip → players → teams → groups → matches, so a partial failure leaves an
  editable event and each failure names its stage (Neon HTTP driver has no
  interactive transactions). Incompleteness is **derived, not stored**: an event
  with zero matches renders a "finish setup" state that reopens the builder — no
  new status column.
- Event kind is **derived, never asked**: one group = match, 2+ groups one round
  = outing, 2+ rounds = trip.

---

## 7. Resolution and the scoreboard contract

### 7.1 The resolver

Every format ships one resolver function. Input: the round's data for one match.
Output, per hole: **side A's number, side B's number** (net, per the pipeline in
§4.2). The generic match-play engine then produces hole winner → running match
state → final result.

- Individual formats: side number = player's net (singles) or best net across the
  side (best ball) or sum (aggregate).
- 30 Ball: side number = sum of attributed strokes; bespoke resolver
  (`computeThirtyBallMatch`) already exists.
- Scramble/alt-shot: side number = the team gross/net.
- BBB: bespoke (`computeBingoBangoBongo`), already exists.

### 7.2 The contract every match resolves to

Regardless of format **and of `scoring` mode**: `{ points available
(overall/front/back), winning side | halved, status, result text }`. The schema
already encodes this (`points_overall`, `winning_team_id`,
`front_9_winning_team_id`, `is_halved`, `result_text`). Stroke-scored matches
conform: lowest side total wins, tie = halved, nine-totals decide front/back if
those carry points. There is **one** result shape — do not introduce a
discriminated union of match vs stroke results; two shapes is how format
knowledge leaks into display.

### 7.3 The hard rule

**The scoreboard and Cup page contain zero format branches.** They sum the §7.2
contract by team and read `hole_scores` for the individual leaderboard. Rounds
played under team-score formats produce no `hole_scores` rows and are therefore
**absent** from the individual leaderboard — omitted, never zeroed. That falls
out of the data shape; do not special-case it. If a
scoreboard file contains `if (format === ...)`, the change is rejected. Formats
may differ at entry (§5) and resolution (§7.1) — never at display.

---

## 8. Format registry

`FORMAT_META` in `packages/scoring/formats.ts` remains the single source of truth
for side sizes, foursome constraints, and input mode:

| Format | Sides | Same-foursome per side | Input |
|---|---|---|---|
| singles | 1v1 | no | individual |
| best_ball | 2–4 per side | no | individual |
| two_man_aggregate | 2v2 | yes | individual |
| scramble | 2–4 | yes | team |
| alternate_shot | 2v2 | yes | team |
| stroke | 1–4 | no | individual |
| thirty_ball | 3v3 | yes | individual + attribution |
| bingo_bango_bongo | 1–2, one foursome | yes | individual |

All eight are in scope for v1. `alternate_shot` requires the enum migration
(§12) before it can be saved.

---

## 9. Permissions

Unchanged from the existing model, resolution cascades platform → trip → captain
→ self:

| Role | Can |
|---|---|
| platform_admin (env) | everything |
| trip_admin | full control of own trip |
| captain | edit own team, set TBD matchups, pick scramble teams |
| player | view, enter own scores (or scores they're designated for), edit own profile |
| viewer | read-only |

Every check goes through `lib/auth/permissions.ts`.

**`canEnterScoreFor(actor, target)` predicate, in full:** true iff actor is the
target, OR actor and target share a foursome in that round, OR actor is a
captain of the target's team, OR actor is trip_admin/platform_admin. Nothing
else, and never re-implemented inline.

---

## 10. Kill list / keep list

**Keep (port or reuse verbatim):** `packages/scoring/` + all tests, `db/schema.ts`
+ migrations, `lib/auth/permissions.ts`, `lib/trip-provision.ts`,
`create-event.ts` (as a starting point — unverified, not wrong), scorecard-AI
extraction, invite email flow, docs folder.

**Kill (do not port, do not polish):**

- All 6 `/setup/*` wizard routes and all 3 `/trips/new/*` wizard routes. Replaced
  by §6. One creation flow exists when this is done.
- The `/admin/*` route sprawl (14 routes) collapses into the same round-builder
  used in edit mode. Admin ≠ a second app.
- Four of the five avatar implementations. `MemberAvatar` (or its rebuilt
  equivalent) is the only one, resolving per §3.2 — enforced with an ESLint
  `no-restricted-imports`/`no-restricted-syntax` rule so a sixth implementation
  fails lint, not review.
- Screen-based component organization. Components organize by **concept**
  (`components/player/`, `components/match/`, `components/scoreboard/`,
  `components/ui/`), so screens cannot grow private copies of shared things.

---

## 11. Verification (build this FIRST)

**The harness precedes the form.** The July failure survived 30 hours because
nothing could catch a client and server disagreeing.

1. Extend `seed-scenarios.ts` into an end-to-end harness that runs against a
   **Neon branch** (never production): create event through the real server
   action → assert DB rows (trip, members, teams, groups, matches) → enter
   scores through real actions → assert resolver output → assert scoreboard
   totals. Every format, match/outing/trip shapes, ghost + claimed players,
   email-collision case, the **partial-write recovery path** (§6.3), and the
   **fan-out rule** (§5.1: one entry lands in every stacked match). The
   `alternate_shot` enum migration (§12) is a prerequisite for its harness
   case — the harness must fail loudly, not skip, if the enum value is absent.
2. Keep the two lineup invariants running across all formats × roster sizes:
   no group exceeds 4 seats; every derived match passes `validateBuilderState`.
3. `npm run build` + `tsc --noEmit` clean before any push (fix the `readonly`
   sort in `tests/formats.test.ts`).
4. Acceptance: `pcup26` renders correctly — schedule, all 15 matches, the one
   completed result (4&3), scoreboard — untouched.

No UI work merges before the harness exists and passes.

---

## 12. Cleanup and migrations (additive only, applied via Neon SQL editor before dependent code ships)

1. **`groups` table** — decouple foursomes from `tee_times` (tee time becomes an
   optional attribute of a group, not its container). Removes the nullable
   `matches.tee_time_id` special-casing for cross-group formats.
2. **`alternate_shot`** added to the `round_format` enum.
3. **Fix R6's `date`** (says Sat 22 Aug; tee times and label say Fri 21 Aug).
4. **Archive the ~23 test trips** (`mx-*`, `m2-*`, `claude-*`, `*-test`) using
   the existing non-destructive `archiveTrip`, so real users stop seeing phantom
   events. Verify each slug against `list-trips.ts` output before archiving —
   real events (`pcup26`, `freedom-fairways-invitational`) are mixed in.
5. Real users who were attached to test events: remove those `trip_members` rows
   as part of archiving those trips.

---

## 13. Environment discipline

- Production Neon = untouchable except through the app and the §12 list.
- All agent/harness testing on a Neon branch with its own `DATABASE_URL`.
- Migrations: `db:generate` → paste SQL in Neon editor → track in
  `__drizzle_migrations` → then push dependent code. Never `db:migrate`.
- `main` auto-deploys; local `npm run build` before every push.
- Concurrency model: **last-write-wins + polling** (react-query, no
  websockets). This is deliberate; do not build conflict resolution or realtime
  sync.