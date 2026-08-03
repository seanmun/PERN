/**
 * Clerk, driven by the harness's "who is acting" switch.
 *
 * This is the ONE piece of identity that is faked. Everything downstream
 * of it is real: `getGlobalAuthContext()` runs unmodified, so the harness
 * exercises the actual users-row lookup, the username backfill, and — the
 * part §3.3 cares about — the lazy claim that binds a ghost
 * `trip_members` row to a `users` row when someone signs in with the
 * email an admin typed.
 *
 * Set the actor with `asActor()` / `runAs()` from ../actors.ts. A null
 * actor means signed out, and `auth()` returns no userId exactly as it
 * would for an anonymous visitor.
 */

function actor() {
  return globalThis.__HARNESS__?.actor ?? null;
}

/** Shape `clerkEmails()` and `getGlobalAuthContext()` read. */
function toClerkUser(a) {
  const emails = [a.email, ...(a.extraEmails ?? [])];
  const addresses = emails.map((e, i) => ({
    id: `harness_email_${i}`,
    emailAddress: e,
  }));
  return {
    id: a.clerkId,
    fullName: a.fullName ?? null,
    firstName: a.fullName?.split(' ')[0] ?? null,
    lastName: a.fullName?.split(' ').slice(1).join(' ') || null,
    imageUrl: a.imageUrl ?? null,
    emailAddresses: addresses,
    primaryEmailAddressId: addresses[0]?.id ?? null,
    primaryEmailAddress: addresses[0] ?? null,
  };
}

module.exports = {
  __esModule: true,
  auth: async () => {
    const a = actor();
    return {
      userId: a?.clerkId ?? null,
      sessionId: a ? `harness_session_${a.clerkId}` : null,
      redirectToSignIn: () => {
        throw new Error('redirectToSignIn() reached in the harness');
      },
    };
  },
  currentUser: async () => {
    const a = actor();
    return a ? toClerkUser(a) : null;
  },
  // Only invites.ts reaches for this. If a scenario ever trips it, the
  // message should say why rather than surfacing a Clerk network error.
  clerkClient: async () => {
    throw new Error(
      'clerkClient() is not available in the harness — the scenario reached a Clerk-API path (invites).',
    );
  },
};
