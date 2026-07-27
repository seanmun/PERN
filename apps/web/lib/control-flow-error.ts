/**
 * Next signals `redirect()` and `notFound()` by THROWING a tagged error
 * rather than returning. A `catch` around a server action therefore
 * catches successful navigations too — swallowing one leaves the user on
 * the old page staring at a bogus "failed" message.
 *
 * Call this first in any catch that wraps a server action.
 */
export function rethrowIfControlFlow(err: unknown): void {
  const digest = (err as { digest?: unknown } | null | undefined)?.digest;
  if (
    typeof digest === 'string' &&
    (digest.startsWith('NEXT_REDIRECT') || digest === 'NEXT_NOT_FOUND')
  ) {
    throw err;
  }
}
