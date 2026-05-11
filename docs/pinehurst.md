# Pinehurst Cup — Trip Spec

The source-of-truth for trip seed data. Used to populate `trips`, `teams`, `trip_members`, `courses`, `rounds`, `tee_times`, and fixed `matches` via `db/seed.ts`.

> ⚠️ **Items to confirm with Dan before seeding:**
> - Year / exact dates of the trip
> - Course for Saturday AM and Saturday PM rounds
> - Fran's handicap (missing from source sheet)
> - Whether the fun scramble awards points or is purely for fun (assumed fun-only)
> - Canonical spelling for "Marina" vs "Marino"
> - Last names for everyone except Ian and Dan
> - Confirm Saturday AM tee-time grouping: 3 tee times × ? players each

## Teams

### MachIans

Captain: **Ian Cassel**

| Nickname | Full Name | Handicap | Role |
|---|---|---|---|
| Ian | Ian Cassel | 10.4 | player, captain |
| Munley | Sean [last name TBD] | 24.5 | player |
| Andy | Andy [last name TBD] | 16.0 | player |
| Carty | [first TBD] Carty | 13.2 | player |
| Truant | [first TBD] Truant | 16.9 | player |
| Fran | [first TBD] Fran | TBD | player |

### Douchebags (D-Bags)

Captain: **Dan Smith** (also trip admin)

| Nickname | Full Name | Handicap | Role |
|---|---|---|---|
| Dan | Dan Smith | 11.2 | trip_admin, captain |
| Lusty | [TBD] | 16.2 | player |
| Marino | [TBD] | 11.8 | player |
| Kyle | [TBD] | 15.5 | player |
| Musket | [TBD] | 22.1 | player |
| Mallon | [TBD] | 25.1 | player |

## Rules

1. **Finish out every hole** OR pick up at *double par + 2*.
2. **Gimmes** are at the opponents' discretion.
3. **Net score determines outcome.** Course handicap (per course) minus gross score = net.

## Schedule

| # | Day | Time | Course | Format | Counts |
|---|---|---|---|---|---|
| 1 | Wed | 2:30 / 2:40 / 2:50 PM | Pine Needles | Match Play 2v2 (3 matches) | ✅ |
| 2 | Thu | 8:00 / 8:12 / 8:25 AM | Tobacco Road | Match Play 2v2 (3 matches) | ✅ |
| 3 | Fri | 7:00 / 7:10 / 7:20 AM | Pinehurst No. 2 | Match Play 2v2 (3 matches) | ✅ |
| 4 | Sat | 7:24 / 7:36 / 7:48 AM | TBD | Singles 1v1 (6 matches) | ✅ |
| 5 | Sat | 2:00 / 2:10 / 2:20 PM | TBD | Singles 1v1 (6 matches) — *matchups via PERN randomizer* | ✅ |
| 6 | Sat | [time TBD] | Pinehurst No. 1 | Scramble (3 mixed teams of 4) | ❌ (fun round) |

**Total points available toward the Cup:** 21 (3 + 3 + 3 + 6 + 6).

## Round 1 — Pine Needles (Wed, Match Play 2v2)

| Tee Time | Group | MachIans | vs. | D-Bags |
|---|---|---|---|---|
| 2:30 | 1 | Andy & Carty | v | Mallon & Musket |
| 2:40 | 2 | Truant & Fran | v | Marino & Dan |
| 2:50 | 3 | Ian & Munley | v | Lusty & Kyle |

## Round 2 — Tobacco Road (Thu, Match Play 2v2)

| Tee Time | Group | MachIans | vs. | D-Bags |
|---|---|---|---|---|
| 8:00 | 1 | Ian & Carty | v | Mallon & Dan |
| 8:12 | 2 | Truant & Munley | v | Marino & Kyle |
| 8:25 | 3 | Andy & Fran | v | Musket & Lusty |

## Round 3 — Pinehurst No. 2 (Fri, Match Play 2v2)

| Tee Time | Group | MachIans | vs. | D-Bags |
|---|---|---|---|---|
| 7:00 | 1 | Carty & Munley | v | Kyle & Dan |
| 7:10 | 2 | Truant & Andy | v | Musket & Marino |
| 7:20 | 3 | Ian & Fran | v | Mallon & Lusty |

## Round 4 — Saturday AM Singles

Course TBD. Six 1v1 matches across three tee times.

| Tee Time | MachIans | vs. | D-Bags |
|---|---|---|---|
| 7:24 | Truant | v | Dan |
| 7:24 | Munley | v | Musket |
| 7:36 | Carty | v | Kyle |
| 7:36 | Fran | v | Mallon |
| 7:48 | Ian | v | Lusty |
| 7:48 | Andy | v | Marino |

*Note:* 3 tee times × 2 matches each = 6 singles matches total, 4 players per tee time. Confirm with Dan that this is the intended grouping.

## Round 5 — Saturday PM Singles (matchups via PERN randomizer)

Course TBD. Matchups will be selected live by the **Matchup Randomizer (PERN module)** on Saturday morning. Six 1v1 pairings, drawn from collision events between blue (D-Bag) and red (MachIan) particles.

## Round 6 — PH #1 Scramble (Fun Round)

Three mixed teams of four. Does not count toward the Cup.

| Team | Players |
|---|---|
| Team 1 | Ian, Lusty, Musket, Fran |
| Team 2 | Carty, Andy, Dan, Munley |
| Team 3 | Truant, Marino, Kyle, Mallon |

## Course data (to seed `courses` + `course_holes`)

For each of the four courses, seed: name, total par, location, and 18 rows of `hole_number`, `par`, `yardage`, `handicap_index`. Source from official scorecards:

- **Pinehurst No. 2** — `pinehurst.com/play/courses/no-2/`
- **Pinehurst No. 1** — `pinehurst.com/play/courses/no-1/`
- **Pine Needles** — `pineneedles-midpines.com`
- **Tobacco Road** — `tobaccoroadgolf.com`

**Critical:** `handicap_index` (stroke index, 1–18) per hole drives the net match-play stroke allocation. Do not skip.
