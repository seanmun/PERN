import type { AuthContext } from './current-user';
import type { tripMembers, teams } from '@/db/schema';

type TripMember = typeof tripMembers.$inferSelect;
type Team = typeof teams.$inferSelect;

export function isPlatformAdmin(ctx: AuthContext): boolean {
  return ctx.isPlatformAdmin;
}

/**
 * Every predicate below resolves against ctx.memberships — ALL of the
 * user's rows — not the single ctx.tripMember. A user on two trips has
 * two rows; judging them by whichever one a query happened to return
 * denied real trip admins and captains at random.
 */
export function isTripAdminOf(ctx: AuthContext, tripId: string): boolean {
  return ctx.memberships.some(
    (m) => m.tripId === tripId && m.role === 'trip_admin',
  );
}

export function isCaptainOf(ctx: AuthContext, teamId: string): boolean {
  return ctx.memberships.some((m) => m.isCaptain && m.teamId === teamId);
}

/**
 * True when the caller is a captain of ANY team on the given trip.
 * Lets quick-result-style actions accept either captain without forcing
 * the caller to know which side the match is on.
 */
export function isAnyCaptainOnTrip(ctx: AuthContext, tripId: string): boolean {
  return ctx.memberships.some((m) => m.tripId === tripId && m.isCaptain);
}

export function isSelfTripMember(ctx: AuthContext, tripMemberId: string): boolean {
  return ctx.memberships.some((m) => m.id === tripMemberId);
}

/** The caller's own membership row on a given trip, if any. */
export function membershipOn(
  ctx: AuthContext,
  tripId: string,
): TripMember | null {
  return ctx.memberships.find((m) => m.tripId === tripId) ?? null;
}

/**
 * Can this user see the trip at all?
 *
 * getTripAuthContext returns a context for ANY signed-in user — members
 * get a tripMember, everyone else gets null — so `if (!ctx)` alone lets
 * strangers read a trip by guessing its slug. Membership (any role,
 * including viewer) or platform admin is the actual read gate.
 *
 * Pair with notFound(), not redirect(): a stranger shouldn't be able to
 * tell an existing trip from a nonexistent one.
 */
export function canViewTrip(ctx: AuthContext): boolean {
  if (isPlatformAdmin(ctx)) return true;
  return ctx.tripMember != null;
}

/** Membership of the given trip, any role — the read gate by trip id. */
export function canViewTripId(ctx: AuthContext, tripId: string): boolean {
  if (isPlatformAdmin(ctx)) return true;
  return membershipOn(ctx, tripId) != null;
}

export function canEditTrip(ctx: AuthContext, tripId: string): boolean {
  if (isPlatformAdmin(ctx)) return true;
  return isTripAdminOf(ctx, tripId);
}

export function canEditTeam(
  ctx: AuthContext,
  team: Pick<Team, 'id' | 'tripId'>
): boolean {
  if (isPlatformAdmin(ctx)) return true;
  if (isTripAdminOf(ctx, team.tripId)) return true;
  return isCaptainOf(ctx, team.id);
}

export function canEditTripMember(
  ctx: AuthContext,
  target: Pick<TripMember, 'id' | 'tripId' | 'teamId'>
): boolean {
  if (isPlatformAdmin(ctx)) return true;
  if (isTripAdminOf(ctx, target.tripId)) return true;
  if (target.teamId && isCaptainOf(ctx, target.teamId)) return true;
  return isSelfTripMember(ctx, target.id);
}

/**
 * Score entry is open to platform admins, the trip's own admins, and
 * any non-viewer member of the same trip. The "anyone on the trip can
 * score for anyone" model matches how a foursome actually keeps a
 * scorecard — one person walks the card and enters everyone. Viewers
 * (spectators / non-players) are explicitly blocked.
 */
export function canEnterScoreFor(
  ctx: AuthContext,
  target: Pick<TripMember, 'id' | 'tripId'>
): boolean {
  if (isPlatformAdmin(ctx)) return true;
  if (isTripAdminOf(ctx, target.tripId)) return true;
  // Same-trip member who isn't a viewer can score anyone.
  const mine = membershipOn(ctx, target.tripId);
  return mine != null && mine.role !== 'viewer';
}

export class AuthorizationError extends Error {
  constructor(message = 'Not authorized') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export function requireAuth(
  ctx: AuthContext | null
): asserts ctx is AuthContext {
  if (!ctx) throw new AuthorizationError('Authentication required');
}

export function requirePlatformAdmin(ctx: AuthContext): void {
  if (!isPlatformAdmin(ctx)) throw new AuthorizationError('Platform admin required');
}

export function requireTripAdmin(ctx: AuthContext, tripId: string): void {
  if (!canEditTrip(ctx, tripId)) throw new AuthorizationError('Trip admin required');
}
