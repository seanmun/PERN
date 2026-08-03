/**
 * BuddyCup verification harness (§11 of docs/buddycup-rebuild-spec.md).
 *
 * "The harness precedes the form." The July failure survived thirty hours
 * because nothing in this repo could catch a client and a server
 * disagreeing: 124 unit tests, all against the pure engine, and zero
 * covering a server action, a data loader, or a flow. A green build, a
 * green test run and a clean linter all pass on a screen that loses your
 * data.
 *
 * So this script does not read code. It drives the real server actions
 * against a real Postgres and asserts what came out:
 *
 *   §8   every format — create → score → resolve → scoreboard
 *   §6.2 the match / outing / trip shapes, including shell rounds
 *   §3.3 ghost players, claiming at sign-in, the email-collision rule
 *   §6.3 the partial-write recovery path
 *   §5.1 the fan-out rule, on write, edit and clear
 *   §5.2 the 30 Ball commit lock
 *   §11.2 the two lineup invariants across every format × roster size
 *   §11.4 pcup26 still renders
 *
 * ── Running it ──────────────────────────────────────────────────────
 *
 *   npm run harness            (from the repo root)
 *
 * It requires HARNESS_DATABASE_URL — a Neon BRANCH, never main. The
 * preload in scripts/harness/boot.mjs refuses to start without it and
 * refuses to start if it resolves to the same host as the DATABASE_URL in
 * .env.local. Production is never written to by this script; §11 and §13
 * make that non-negotiable, and the guard is there so it cannot happen by
 * accident either.
 *
 * Everything it creates is namespaced (`__HARNESS__` trips and courses,
 * `@buddycup.test` users) and wiped at the start of every run, so it is
 * safe to run repeatedly.
 */

import { summarize } from './harness/core';
import { actor, teardown } from './harness/world';
import { runFormatMatrix, runStrokeAggregation } from './harness/scenarios/formats';
import {
  runCommitLock,
  runFanOut,
  runIdentity,
  runPartialWrite,
  runShapes,
} from './harness/scenarios/setup-path';
import { runBuilder } from './harness/scenarios/builder';
import { runLineupInvariants } from './harness/scenarios/invariants';
import { runEngineRegressions } from './harness/scenarios/engine-regressions';
import { runAcceptance } from './harness/scenarios/acceptance';

async function main(): Promise<void> {
  console.log(
    `\x1b[1mBuddyCup harness\x1b[0m — database \x1b[36m${globalThis.__HARNESS_DB_HOST__}\x1b[0m`,
  );
  console.log('\x1b[2mclearing artefacts from the previous run…\x1b[0m');
  await teardown();

  // The admin is an ordinary signed-in person who becomes trip_admin of
  // what they create. Deliberately NOT a platform admin — godmode would
  // mask every permission bug in the setup path.
  const admin = actor('admin', { fullName: 'Harness Admin' });

  // Pure, no DB — run first so a connection problem doesn't hide them.
  await runLineupInvariants();

  // The setup path, through the real actions.
  await runFormatMatrix(admin);
  await runStrokeAggregation(admin);
  await runShapes(admin);
  await runIdentity(admin);
  await runPartialWrite(admin);
  await runFanOut(admin);
  await runCommitLock(admin);

  // §6 round-builder — the atom, its wrappers, and edit mode.
  await runBuilder(admin);

  // Resolver / scoreboard behaviour the setup path can't yet express.
  await runEngineRegressions();

  // Read-only, against the branch's copy of production.
  await runAcceptance();

  // Leave the branch clean. `HARNESS_KEEP=1` skips this when you want to
  // open a failing scenario's rows in the Neon console.
  if (!process.env.HARNESS_KEEP) await teardown();
  summarize();
}

main().catch((err) => {
  console.error('\n\x1b[31mharness crashed\x1b[0m');
  console.error(err);
  process.exit(1);
});
