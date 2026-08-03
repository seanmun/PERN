/**
 * `next/cache` outside a request scope.
 *
 * Real `revalidatePath` throws "Invariant: static generation store
 * missing" when called from a plain Node process, which would stop every
 * server action at its last line. This records instead of throwing, so
 * the harness can ASSERT which paths an action invalidated.
 *
 * That assertion matters: "changed the action, forgot the
 * revalidatePath" is failure class #5 in docs/session-failures-2026-07.md
 * and is invisible to a build, a unit test, and a linter.
 */

function record(kind, arg, type) {
  const log = (globalThis.__HARNESS__ ??= {});
  (log.revalidations ??= []).push({ kind, arg, type: type ?? null });
}

module.exports = {
  __esModule: true,
  revalidatePath: (p, type) => record('path', p, type),
  revalidateTag: (t) => record('tag', t),
  unstable_noStore: () => {},
  // Pass-through: the harness wants the real query to run every time.
  unstable_cache: (fn) => fn,
  cacheTag: () => {},
  cacheLife: () => {},
};
