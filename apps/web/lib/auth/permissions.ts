import type { AuthContext } from './current-user';
import type { tripMembers, teams } from '@/db/schema';

type TripMember = typeof tripMembers.$inferSelect;
type Team = typeof teams.$inferSelect;

export function isPlatformAdmin(ctx: AuthContext): boolean {
  return ctx.isPlatformAdmin;
}

export function isTripAdminOf(ctx: AuthContext, tripId: string): boolean {
  return ctx.tripMember?.tripId === tripId && ctx.tripMember.role === 'trip_admin';
}

export function isCaptainOf(ctx: AuthContext, teamId: string): boolean {
  return Boolean(ctx.tripMember?.isCaptain && ctx.tripMember.teamId === teamId);
}

export function isSelfTripMember(ctx: AuthContext, tripMemberId: string): boolean {
  return ctx.tripMember?.id === tripMemberId;
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
  if (
    ctx.tripMember?.tripId === target.tripId &&
    ctx.tripMember.role !== 'viewer'
  ) {
    return true;
  }
  return false;
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
