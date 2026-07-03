/**
 * Shared redirect-override convention for actions the event-creation
 * wizard reuses across its own step pages instead of the classic admin
 * pages those actions originally targeted.
 *
 * Read an optional `redirectTo` field from the form:
 *   - absent    → return the caller's existing default (old behavior,
 *                 every non-wizard caller is unaffected)
 *   - "none"    → return null — caller should skip redirect() entirely
 *                 and just revalidate (wizard steps that stay in place)
 *   - any path  → redirect there instead (wizard steps that advance to
 *                 the next step page)
 */
export function resolveRedirect(
  formData: FormData,
  fallback: string,
): string | null {
  const raw = formData.get('redirectTo');
  if (raw == null) return fallback;
  const s = String(raw).trim();
  if (!s || s === 'none') return null;
  return s;
}
