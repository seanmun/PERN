/**
 * Harness preload — runs BEFORE any application module is loaded.
 *
 * Two jobs, both of which have to happen before the first `import`:
 *
 *  1. POINT THE DB AT A NEON BRANCH. `db/client.ts` reads
 *     `process.env.DATABASE_URL` at module scope, so the swap has to
 *     happen in a `--import` preload. The harness NEVER reads
 *     `DATABASE_URL` from `.env.local` — that is production. It requires
 *     `HARNESS_DATABASE_URL` (env var or `apps/web/.env.harness`) and
 *     refuses to start if that URL resolves to the same host as the one
 *     in `.env.local`.
 *
 *  2. STUB THE FRAMEWORK EDGES. Server actions are the code under test,
 *     but they call `revalidatePath`, `redirect` and Clerk's `auth()` —
 *     all of which need a Next request scope that a Node script does not
 *     have. tsx loads `.ts` as CJS here, so interception is a
 *     `Module._resolveFilename` patch rather than an ESM loader hook.
 *
 *     What is stubbed is exactly the framework boundary. Everything the
 *     spec cares about — validation, write ordering, permissions, the
 *     resolver, the leaderboard — is the real code, hitting a real
 *     Postgres.
 *
 *     The stubs are not black holes. `revalidatePath` records its calls
 *     so the harness can assert cache invalidation (failure class #5 in
 *     docs/session-failures-2026-07.md), and `redirect` throws a
 *     catchable signal carrying its destination.
 */

import Module from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '../..');

function die(lines) {
  console.error(`\n\x1b[31m✗ harness refused to start\x1b[0m\n`);
  for (const l of lines) console.error(`  ${l}`);
  console.error('');
  process.exit(2);
}

/** Minimal dotenv reader — no dependency, no export of what we don't want. */
function parseEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const rawLine of readFileSync(file, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function hostOf(url) {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

// ───────────────────────── 1. Database guard ─────────────────────────

const local = parseEnvFile(path.join(webRoot, '.env.local'));

// Everything except the connection string is fine to inherit: Clerk keys
// are unused (stubbed), but PLATFORM_ADMIN_EMAILS genuinely affects the
// permission cascade and must match how prod resolves it.
for (const [k, v] of Object.entries(local)) {
  if (k === 'DATABASE_URL') continue;
  if (process.env[k] === undefined) process.env[k] = v;
}

const productionUrl = local.DATABASE_URL ?? null;
const productionHost = productionUrl ? hostOf(productionUrl) : null;

const harnessFile = parseEnvFile(path.join(webRoot, '.env.harness'));
const branchUrl =
  process.env.HARNESS_DATABASE_URL || harnessFile.HARNESS_DATABASE_URL || null;

if (!branchUrl) {
  die([
    'HARNESS_DATABASE_URL is not set.',
    '',
    'The harness writes fabricated data and must never touch production.',
    'Create a Neon branch, then either:',
    '',
    '  export HARNESS_DATABASE_URL="postgres://…branch…"',
    '',
    'or put it in apps/web/.env.harness (gitignored by .env*):',
    '',
    '  HARNESS_DATABASE_URL=postgres://…branch…',
  ]);
}

const branchHost = hostOf(branchUrl);
if (!branchHost) {
  die([`HARNESS_DATABASE_URL is not a parseable URL: ${branchUrl.slice(0, 24)}…`]);
}

if (productionHost && branchHost === productionHost) {
  die([
    `HARNESS_DATABASE_URL points at ${branchHost},`,
    'which is the same host as DATABASE_URL in apps/web/.env.local.',
    '',
    'That is production. Point the harness at a Neon BRANCH endpoint',
    '(its hostname differs from main). Refusing to run.',
  ]);
}

process.env.DATABASE_URL = branchUrl;
// Nothing downstream should read this; drop it so a stray consumer can't
// pick the branch up under a name that bypasses the guard above.
delete process.env.HARNESS_DATABASE_URL;

globalThis.__HARNESS_DB_HOST__ = branchHost;
globalThis.__HARNESS_PROD_HOST__ = productionHost;

// ───────────────────────── 2. Module interception ─────────────────────────

const stub = (name) => path.join(here, 'stubs', name);

const INTERCEPT = new Map([
  ['next/cache', stub('next-cache.cjs')],
  ['next/navigation', stub('next-navigation.cjs')],
  ['next/headers', stub('next-headers.cjs')],
  ['server-only', stub('server-only.cjs')],
  ['@clerk/nextjs/server', stub('clerk-server.cjs')],
]);

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  const hit = INTERCEPT.get(request);
  if (hit) return hit;
  return originalResolve.call(this, request, ...rest);
};
