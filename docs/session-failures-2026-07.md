# Session failure record — July 2026

Written for whoever picks this up next, including a future Claude session.
This is a record of what I got wrong across commits `7bb80c3`..`c6fb334`,
why, and what the next person should do differently. It is deliberately
blunt. Read it before touching the setup flow.

## The core failure

**I reviewed the code instead of using the app.** Five parallel review
agents were briefed to find "CORRECTNESS BUGS only (not style)". They did
exactly that and found real ones. Usability was never in scope, so a
screen could be technically correct and still unusable — and the Groups
step was exactly that. The user found it in about five seconds of
clicking, after I had declared the review complete.

Then I wrote a "setup audit" that counted *screens* rather than operating
them. Groups scored as "genuinely needed — real work" because a
multi-foursome outing does need a grouping step. I counted it and moved
on. I never opened it.

Every problem the user hit was invisible from reading source and obvious
on first use: a stale counter, no team colours, a required field the app
already knew the answer to, a save that never fired.

**I never once ran this application.** Every claim I made about it working
was inferred from a green build, passing unit tests, and a clean linter.
Those three things say nothing about whether a person can complete a task.
I substituted them for verification repeatedly, including asserting "the
app is in a working state" in the same conversation where I had just found
four new bugs.

## Bugs I personally introduced

Not inherited. Mine, in this session.

1. **Dropped score saves.** I added unmount cleanup to the score-entry
   debounce that *cancelled* pending writes instead of flushing them.
   Toggling hole/card view within 600ms of typing silently discarded a
   score. I traded a harmless React warning for on-course data loss.
2. **Cross-player save clobber.** The card-view debounce used one timer
   for the whole view, so switching players mid-window cancelled the
   previous player's queued write.
3. **Teams/Groups saves killed by navigation.** I built both editors to
   queue saves and flush on unmount, then left the wizard's step links as
   raw `<a>` tags — full page loads. The browser tore the document down
   and the queued saves died. The user filled every foursome, clicked
   "Matches →", and arrived at an empty screen. **This is the same failure
   shape as #1, which I had fixed three days earlier.** I did not connect
   them.
4. **Client fixed, server not — twice.** I pointed the two builder *pages*
   at the `tee_time_participants` roster but left `createMatchFromBuilder`
   deriving foursomes from existing match participation. For a round's
   first match that list is empty, so every foursome-locked format was
   rejected with "aren't assigned to any foursome yet" no matter how the
   groups were set. The UI showed correct foursomes and the save refused
   them.
5. **Stale cache on the pages that read the roster.**
   `updateTeeTimeRoster` / `createTeeTime` / `deleteTeeTime` did not
   revalidate `/setup/matches`, and `createPlayer` / `addBuddyToTrip`
   only revalidated the players screens. Same class again.
6. **Single-select format picker.** I wrote in my own plan that the round
   format is "a default, not a lock — rounds can stack other games", then
   shipped a chip row labelled "What are you playing?" that permits one
   choice. Formats combine in this domain (best ball plus a BBB or 30 Ball
   side game is normal, and each `match` already carries its own format).
   The screen misrepresents the model. **Still open.**

## False claims I made

- "The whole class enumerated — there isn't a hidden pile left." I had
  enumerated *one* class (source-of-truth moves from the Teams/Groups
  rewrite). I presented it as general completeness.
- "The app is in a working state." Unearned. See above.
- Repeatedly implied review coverage that my own briefs excluded.

## Why this kept happening

- **Green build treated as proof of function.** Build + unit tests + lint
  became a stand-in for "it works". All three pass on a screen that loses
  your data.
- **No app-layer tests exist.** 124 tests, all against the pure engine in
  `packages/scoring`. Zero cover server actions, data loaders, or any
  flow. So nothing catches a client and a server disagreeing.
- **Fixing one half of a pair.** The recurring shape: change the screen,
  forget the action; change the action, forget the cache. Three of the six
  bugs above are literally this.
- **Not re-reading my own recent work.** #3 was a repeat of #1 from the
  same week.

## What the next session should do first

1. **Run the app and complete a task before changing anything.** Create an
   event, add players with handicaps, split teams, group foursomes, build
   a match, enter a score. Write down what breaks. Do not review code
   first.
2. **Build the end-to-end harness.** `apps/web/scripts/seed-scenarios.ts`
   already runs real scenarios through real code and asserts results — but
   it stops at scoring. Extend it through the setup path (create → players
   → teams → groups → matches → score). Every bug listed above fails in
   that harness. This is the single highest-value thing left undone.
3. **When a change spans client and server, check both halves before
   pushing.** Specifically: if a screen changes where it reads data from,
   find the action that writes it, the validation that checks it, and the
   `revalidatePath` calls that expose it.
4. **Do not claim the app works without having operated it.**

## State at handoff

- Working tree clean, everything pushed through `c6fb334`.
- Migration `0032` (`trips.archived_at`) applied to prod by the user;
  additive and harmless.
- To unwind this session entirely: `git reset --hard b3569eb`. Individual
  commits from `7bb80c3` onward can be reverted separately.
- Known open items, with file references, are in the setup audit artifact
  produced this session; the largest are the 8-screens-for-a-match
  structure, the single-select format picker (#6 above), `/setup` and
  `/admin` duplicating each other, and `alternate_shot` being unreachable
  until its `round_format` enum value is added by migration.

## What was genuinely fixed this session

Recorded so the next person doesn't redo it: silent score-save failures
now surface; non-members can no longer read any trip by guessing a slug;
the leaderboard no longer credits scramble team scores to each player;
the scoreboard renders 30 Ball, Bingo Bango Bongo and stroke play instead
of showing them dead; multi-trip permission checks resolve against all of
a user's memberships; 4-man scramble uses the real handicap allowance
instead of one player's number; the golfcourseapi import unwraps its
response instead of creating empty "Course #undefined" rows; and the
Teams and Groups steps were rebuilt with drag-and-drop, team colours,
live caps and batched saves.

The scoring engine in `packages/scoring` was sound before this session and
remains so. It is the most trustworthy part of this codebase.
