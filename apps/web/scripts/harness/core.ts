/**
 * Harness core — result tally, assertions, and the actor switch.
 *
 * Three outcomes, deliberately distinct:
 *
 *   pass     the spec's claim held.
 *   fail     the spec's claim did not hold. Exit code 1. This is a bug in
 *            the app (or a missing migration), not in the harness.
 *   blocked  the case could not be exercised because the thing under test
 *            does not exist yet. Printed by name at the end so nothing is
 *            silently skipped — a blocked case is a TODO with a receipt,
 *            never a green check.
 *
 * §11 is explicit that alternate_shot must FAIL, not skip, while its enum
 * migration is missing. So "the migration hasn't run" is a fail; "the
 * round-builder can't add a second round yet" is blocked.
 */

/* eslint-disable no-console */

const C = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

export type HarnessActor = {
  clerkId: string;
  email: string;
  fullName?: string | null;
  imageUrl?: string | null;
  /** Secondary addresses on the same Clerk account (claim-by-any-email). */
  extraEmails?: string[];
};

type HarnessGlobals = {
  actor: HarnessActor | null;
  revalidations: { kind: 'path' | 'tag'; arg: string; type: string | null }[];
};

declare global {
  // eslint-disable-next-line no-var
  var __HARNESS__: HarnessGlobals | undefined;
  // eslint-disable-next-line no-var
  var __HARNESS_DB_HOST__: string | undefined;
  // eslint-disable-next-line no-var
  var __HARNESS_PROD_HOST__: string | null | undefined;
}

function globals(): HarnessGlobals {
  return (globalThis.__HARNESS__ ??= { actor: null, revalidations: [] });
}

// ───────────────────────── Tally ─────────────────────────

let currentSection = '(none)';
const failures: { section: string; label: string }[] = [];
const blockers: { section: string; label: string; why: string }[] = [];
let passCount = 0;

export function section(title: string): void {
  currentSection = title;
  console.log(`\n${C.cyan(`── ${title} ──`)}`);
}

export function pass(label: string): void {
  passCount++;
  console.log(`  ${C.green('✓')} ${label}`);
}

export function fail(label: string): void {
  failures.push({ section: currentSection, label });
  console.log(`  ${C.red('✗')} ${label}`);
}

export function blocked(label: string, why: string): void {
  blockers.push({ section: currentSection, label, why });
  console.log(`  ${C.yellow('⊘')} ${label}\n      ${C.dim(why)}`);
}

export function note(text: string): void {
  console.log(`    ${C.dim(text)}`);
}

// ───────────────────────── Assertions ─────────────────────────

export function assert(cond: boolean, label: string): boolean {
  if (cond) pass(label);
  else fail(label);
  return cond;
}

export function assertEq<T>(actual: T, expected: T, label: string): boolean {
  if (Object.is(actual, expected)) {
    pass(`${label} = ${fmt(expected)}`);
    return true;
  }
  fail(`${label}: expected ${fmt(expected)}, got ${fmt(actual)}`);
  return false;
}

export function assertIncludes(
  haystack: string | null | undefined,
  needle: string,
  label: string,
): boolean {
  const ok = typeof haystack === 'string' && haystack.includes(needle);
  if (ok) pass(`${label} (${fmt(haystack)})`);
  else fail(`${label}: ${fmt(haystack)} does not contain ${fmt(needle)}`);
  return ok;
}

/** Asserts the thunk throws, and that the message contains `needle`. */
export async function assertRejects(
  fn: () => Promise<unknown>,
  needle: string,
  label: string,
): Promise<Error | null> {
  try {
    await fn();
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    if (e.message.includes(needle)) {
      pass(`${label} — rejected with ${fmt(e.message)}`);
      return e;
    }
    fail(`${label}: rejected, but message ${fmt(e.message)} lacks ${fmt(needle)}`);
    return e;
  }
  fail(`${label}: did not reject`);
  return null;
}

function fmt(v: unknown): string {
  if (typeof v === 'string') return `"${v.length > 90 ? `${v.slice(0, 90)}…` : v}"`;
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  return String(v);
}

/**
 * Run one scenario. A throw inside a scenario is that scenario's failure,
 * not the run's — the remaining scenarios still get to report, which is
 * the whole point of a harness over a manual click-through.
 */
export async function scenario(
  title: string,
  fn: () => Promise<void>,
): Promise<void> {
  section(title);
  try {
    await fn();
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    fail(`scenario threw: ${e.message}`);
    if (e.stack) note(e.stack.split('\n').slice(1, 4).join('\n    '));
  }
}

// ───────────────────────── Actor switch ─────────────────────────

/**
 * Run `fn` as `actor`. The Clerk stub reads the actor; everything below
 * it — `getGlobalAuthContext`, the permission cascade, the lazy claim —
 * is the real implementation.
 *
 * Revalidation records are cleared on entry, so `revalidatedPaths()`
 * always describes the action that just ran.
 */
export async function runAs<T>(
  actor: HarnessActor | null,
  fn: () => Promise<T>,
): Promise<T> {
  const g = globals();
  const previous = g.actor;
  g.actor = actor;
  g.revalidations = [];
  try {
    return await fn();
  } finally {
    g.actor = previous;
  }
}

export function revalidatedPaths(): string[] {
  return globals()
    .revalidations.filter((r) => r.kind === 'path')
    .map((r) => r.arg);
}

/**
 * Server actions signal success by redirecting, which the stub turns into
 * a throw. This unwraps that: a redirect is a resolved value, anything
 * else still throws so real errors stay loud.
 */
export async function captureRedirect(
  fn: () => Promise<unknown>,
): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    if (
      err instanceof Error &&
      err.name === 'HarnessRedirect' &&
      'url' in err
    ) {
      return String((err as Error & { url: unknown }).url);
    }
    throw err;
  }
}

// ───────────────────────── Summary ─────────────────────────

export function summarize(): never {
  console.log(`\n${C.bold('━━━ Summary ━━━')}`);

  if (blockers.length) {
    console.log(`\n${C.yellow(`BLOCKED (${blockers.length}) — not built yet, not verified:`)}`);
    for (const b of blockers) {
      console.log(`  ${C.yellow('⊘')} ${C.dim(b.section)} · ${b.label}`);
      console.log(`      ${C.dim(b.why)}`);
    }
  }

  if (failures.length) {
    console.log(`\n${C.red(`FAILED (${failures.length}):`)}`);
    for (const f of failures) {
      console.log(`  ${C.red('✗')} ${C.dim(f.section)} · ${f.label}`);
    }
  }

  const verdict = failures.length === 0 ? C.green('PASS') : C.red('FAIL');
  console.log(
    `\n${verdict}  ${C.green(`${passCount} passed`)} · ` +
      `${failures.length ? C.red(`${failures.length} failed`) : `${failures.length} failed`} · ` +
      `${blockers.length ? C.yellow(`${blockers.length} blocked`) : `${blockers.length} blocked`}`,
  );
  console.log(C.dim(`database: ${globalThis.__HARNESS_DB_HOST__ ?? 'unknown'}`));

  process.exit(failures.length === 0 ? 0 : 1);
}
