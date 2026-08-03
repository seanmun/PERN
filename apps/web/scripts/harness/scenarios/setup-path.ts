/**
 * The §6 setup path and the §5 entry rules, through the real actions.
 *
 * These are the cases §11 names by hand: the three event shapes, ghost
 * and claimed players, the email-collision rule, the partial-write
 * recovery path, and the fan-out. Each one is a claim the spec makes,
 * written as an assertion that can only be satisfied by the app actually
 * behaving that way.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tripMembers, trips, users } from '@/db/schema';
import { searchPlayersForNewEvent } from '@/lib/actions/create-event';
import {
  assert,
  assertEq,
  assertRejects,
  note,
  runAs,
  scenario,
  type HarnessActor,
} from '../core';
import {
  TRIP_PREFIX,
  actorFor,
  buildPayload,
  createEvent,
  createEventExpectingFailure,
  ghostEmail,
  loadEvent,
  makeCourse,
  type RosterEntry,
} from '../world';
import {
  commitThirtyBall,
  enterScore,
  matchesHoldingScore,
  scoreRow,
} from '../scoring';

function team(prefix: string, n: number, side: 'A' | 'B'): RosterEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    nickname: `${prefix}-${side}${i + 1}`,
    team: side,
    handicap: '0.0',
  }));
}

function evenRoster(prefix: string, perTeam: number): RosterEntry[] {
  return [...team(prefix, perTeam, 'A'), ...team(prefix, perTeam, 'B')];
}

/** Force `getGlobalAuthContext()` to run for this actor — the sign-in path. */
async function signIn(who: HarnessActor): Promise<void> {
  await runAs(who, () => searchPlayersForNewEvent('zzz-no-match-expected'));
}

// ───────────────────────── §6.2 the three shapes ─────────────────────────

export async function runShapes(admin: HarnessActor): Promise<void> {
  await scenario('§6.2 · Match shape — one group, kind derived', async () => {
    const course = await makeCourse('shape-match');
    const { payload } = buildPayload({
      name: 'shape-match',
      courseId: course.courseId,
      roster: evenRoster('m', 2),
      formats: ['best_ball'],
    });
    assertEq(payload.groups.length, 1, 'one derived group');
    const created = await createEvent(admin, payload);
    const ev = await loadEvent(created.slug);
    assertEq(ev.trip.kind, 'match', 'one group → kind');
    assertEq(ev.rounds.length, 1, 'rounds');
  });

  await scenario('§6.2 · Outing shape — two groups, one round', async () => {
    const course = await makeCourse('shape-outing');
    const { payload } = buildPayload({
      name: 'shape-outing',
      courseId: course.courseId,
      roster: evenRoster('o', 4),
      formats: ['best_ball'],
    });
    assertEq(payload.groups.length, 2, 'two derived groups');
    const created = await createEvent(admin, payload);
    const ev = await loadEvent(created.slug);
    assertEq(ev.trip.kind, 'outing', '2+ groups, one round → kind');
    assertEq(ev.rounds.length, 1, 'rounds');
    assertEq(ev.matches.length, 2, 'one 2v2 per group');
  });

}

// ───────────────────────── §3.3 ghosts, claiming, collisions ─────────────────────────

export async function runIdentity(admin: HarnessActor): Promise<void> {
  await scenario('§3.3 · Ghost player created, then claimed at sign-in', async () => {
    const course = await makeCourse('ghost');
    const email = ghostEmail('ghost-player');
    const roster: RosterEntry[] = [
      { nickname: 'Ghosty', team: 'A', handicap: '0.0', email },
      { nickname: 'Solid', team: 'B', handicap: '0.0' },
    ];
    const { payload } = buildPayload({
      name: 'ghost-claim',
      courseId: course.courseId,
      roster,
      formats: ['singles'],
    });
    const created = await createEvent(admin, payload);
    const ev = await loadEvent(created.slug);

    const ghost = ev.byNickname.get('Ghosty');
    if (!ghost) return void assert(false, 'ghost member exists');
    assertEq(ghost.userId, null, 'ghost has no user_id');
    assertEq(ghost.email, email, 'ghost carries the email the admin typed');

    // An admin can build the whole event before anyone signs in.
    assertEq(ev.matches.length, 1, 'ghost participates in a matchup before signing in');
    assert(
      ev.groups.some((g) => g.memberIds.includes(ghost.id)),
      'ghost is seated in a group',
    );

    // Now that person signs in with that address.
    const claimer = actorFor(email, 'Ghosty Realname');
    await signIn(claimer);

    const [afterClaim] = await db
      .select()
      .from(tripMembers)
      .where(eq(tripMembers.id, ghost.id));
    const [claimedUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));

    assert(claimedUser != null, 'a users row exists for the claimer');
    assertEq(afterClaim.userId, claimedUser?.id ?? null, 'ghost bound to the new user');
    // §3.3(b): the membership nickname stays as the admin set it.
    assertEq(afterClaim.nickname, 'Ghosty', 'membership nickname unchanged by the claim');
    assertEq(claimedUser?.fullName ?? null, 'Ghosty Realname', 'global name comes from Clerk');
  });

  await scenario('§3.3 · Email collision — attach the existing user, never a duplicate ghost', async () => {
    // Someone who already exists on the platform.
    const existing = actorFor(ghostEmail('already-here'), 'Already Here');
    await signIn(existing);
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, existing.email));
    if (!existingUser) return void assert(false, 'precondition: platform user exists');

    // An admin types that address into a new event without picking the
    // user from search — the case §3.3 says is mandatory to catch.
    const course = await makeCourse('collision');
    const { payload } = buildPayload({
      name: 'collision',
      courseId: course.courseId,
      roster: [
        { nickname: 'Typed By Hand', team: 'A', handicap: '0.0', email: existing.email },
        { nickname: 'Other', team: 'B', handicap: '0.0' },
      ],
      formats: ['singles'],
    });
    const created = await createEvent(admin, payload);
    const ev = await loadEvent(created.slug);
    const member = ev.byNickname.get('Typed By Hand');
    if (!member) return void assert(false, 'member created');

    assertEq(
      member.userId,
      existingUser.id,
      'entered email matching an existing user attaches that user at creation time',
    );
    if (member.userId == null) {
      note(
        'created as an unclaimed ghost instead — the collision check §3.3 calls mandatory is absent from createEventFromForm',
      );
    }
  });

  await scenario('§3.3(a) · The same email twice is rejected, and nothing is written', async () => {
    const course = await makeCourse('dupe-email');
    const dupe = ghostEmail('twice');
    const { payload } = buildPayload({
      name: 'dupe-email',
      courseId: course.courseId,
      roster: [
        { nickname: 'First', team: 'A', handicap: '0.0', email: dupe },
        { nickname: 'Second', team: 'B', handicap: '0.0', email: dupe },
      ],
      formats: ['singles'],
    });
    const err = await createEventExpectingFailure(admin, payload);
    assert(
      err.message.includes('is listed twice'),
      `duplicate email rejected (${err.message})`,
    );
    const leftovers = await db
      .select({ id: trips.id })
      .from(trips)
      .where(eq(trips.name, `${TRIP_PREFIX}dupe-email`));
    assertEq(leftovers.length, 0, 'no half-written trip left behind');
  });
}

// ───────────────────────── §6.3 partial-write recovery ─────────────────────────

export async function runPartialWrite(admin: HarnessActor): Promise<void> {
  await scenario('§6.3 · Partial write names its stage and leaves an editable event', async () => {
    const course = await makeCourse('partial');
    // Hand-built payload, NOT derived: a scramble needs each side riding
    // together, and this splits both sides across two groups. It clears
    // every up-front check in the action and can only be caught by
    // validateBuilderState at the matches stage.
    const payload = {
      name: `${TRIP_PREFIX}partial-write`,
      courseId: course.courseId,
      date: '2026-08-20',
      teamA: { name: 'MachIans', color: '#16a34a' },
      teamB: { name: 'Douchebags', color: '#eab308' },
      players: [
        { userId: null, email: null, nickname: 'P0', handicap: '0.0', team: 'A' as const },
        { userId: null, email: null, nickname: 'P1', handicap: '0.0', team: 'A' as const },
        { userId: null, email: null, nickname: 'P2', handicap: '0.0', team: 'B' as const },
        { userId: null, email: null, nickname: 'P3', handicap: '0.0', team: 'B' as const },
      ],
      groups: [
        [0, 2],
        [1, 3],
      ],
      matches: [
        { format: 'scramble' as const, sideSize: 2, sideA: [0, 1], sideB: [2, 3] },
      ],
    };

    const err = await createEventExpectingFailure(admin, payload);
    assert(
      err.message.includes('creating the matchups'),
      `failure names the stage it died at (${err.message})`,
    );
    assert(
      /\/trips\/[a-z0-9-]+/.test(err.message),
      'failure hands back a URL for the half-built event',
    );

    // Stages 1–3 must have survived: an editable event, not wreckage.
    const [trip] = await db
      .select()
      .from(trips)
      .where(eq(trips.name, `${TRIP_PREFIX}partial-write`));
    if (!trip) return void assert(false, 'the trip from stage 1 survives the failure');
    const ev = await loadEvent(trip.slug);
    assertEq(ev.teams.length, 2, 'teams survived');
    assertEq(ev.members.length, 5, 'players survived (roster + creator)');
    assertEq(ev.groups.length, 2, 'groups survived');
    // §6.3: incompleteness is derived, not stored — zero matches IS the
    // "finish setup" state.
    assertEq(ev.matches.length, 0, 'no matches written — incompleteness is derivable');
  });
}

// ───────────────────────── §5.1 fan-out ─────────────────────────

export async function runFanOut(admin: HarnessActor): Promise<void> {
  await scenario('§5.1 · One entry fans out to every stacked match in the round', async () => {
    const course = await makeCourse('fanout');
    const { payload } = buildPayload({
      name: 'fanout',
      courseId: course.courseId,
      roster: evenRoster('f', 2),
      // Formats stack: a 2v2 best ball carrying two singles side bets.
      formats: ['best_ball', 'singles'],
    });
    assertEq(payload.matches.length, 3, 'derived: one best ball + two singles');

    const created = await createEvent(admin, payload);
    const ev = await loadEvent(created.slug);
    assertEq(ev.groups.length, 1, 'one foursome carries all three matches');
    assertEq(ev.matches.length, 3, 'three matches persisted');

    const bestBall = ev.matches.find((m) => m.match.format === 'best_ball');
    const singles = ev.matches.filter((m) => m.match.format === 'singles');
    if (!bestBall || singles.length !== 2) {
      return void assert(false, 'stacked matches resolvable');
    }

    const a1 = ev.byNickname.get('f-A1');
    if (!a1) return void assert(false, 'player resolvable');

    const a1Singles = singles.find((m) =>
      m.participants.some((p) => p.tripMemberId === a1.id),
    );
    const otherSingles = singles.find((m) => m !== a1Singles);
    if (!a1Singles || !otherSingles) {
      return void assert(false, "A1's singles match resolvable");
    }

    // ONE call, addressed to the best-ball match only.
    const revalidated = await enterScore(admin, {
      matchId: bestBall.match.id,
      tripMemberId: a1.id,
      holeNumber: 1,
      gross: 4,
    });

    const allIds = ev.matches.map((m) => m.match.id);
    const landed = await matchesHoldingScore(allIds, a1.id, 1);
    assertEq(landed.length, 2, 'the gross landed in exactly two matches');
    assert(landed.includes(bestBall.match.id), 'landed in the best-ball match');
    assert(landed.includes(a1Singles.match.id), "landed in A1's singles match");
    assert(
      !landed.includes(otherSingles.match.id),
      'did not leak into the singles match A1 is not in',
    );

    // An edit has to fan out identically, not just the first write.
    await enterScore(admin, {
      matchId: bestBall.match.id,
      tripMemberId: a1.id,
      holeNumber: 1,
      gross: 6,
    });
    const edited = await Promise.all(
      landed.map((id) => scoreRow(id, a1.id, 1)),
    );
    assert(
      edited.every((r) => r?.gross === 6),
      'the edit fanned out to every match holding the score',
    );

    // Clearing the score has to fan out too.
    await enterScore(admin, {
      matchId: bestBall.match.id,
      tripMemberId: a1.id,
      holeNumber: 1,
      gross: null,
    });
    const cleared = await matchesHoldingScore(allIds, a1.id, 1);
    assertEq(cleared.length, 0, 'clearing removes the row from every match');

    // Failure class #5 in the session-failures doc: the write is right
    // and the reader still shows stale data because nothing revalidated.
    assert(
      revalidated.some((p) => p.endsWith('/scoreboard')),
      'score entry revalidates the scoreboard',
    );
    assert(
      revalidated.some((p) => p.endsWith('/schedule')),
      'score entry revalidates the schedule',
    );
  });
}

// ───────────────────────── §5.2 the 30 Ball lock ─────────────────────────

export async function runCommitLock(admin: HarnessActor): Promise<void> {
  await scenario('§5.2 · A committed 30 Ball hole locks its grosses', async () => {
    const course = await makeCourse('lock');
    const { payload } = buildPayload({
      name: 'commit-lock',
      courseId: course.courseId,
      roster: evenRoster('l', 3),
      formats: ['thirty_ball'],
    });
    const created = await createEvent(admin, payload);
    const ev = await loadEvent(created.slug);
    const entry = ev.matches[0];
    if (!entry) return void assert(false, '30 Ball match created');

    const teamA = ev.teams.find((t) => t.name === 'MachIans');
    if (!teamA) return void assert(false, 'team A resolvable');
    const sideA = entry.participants
      .filter((p) => p.teamId === teamA.id)
      .map((p) => p.tripMemberId);

    // Everyone on the side needs a gross before the hole can commit.
    for (const id of sideA) {
      await enterScore(admin, {
        matchId: entry.match.id,
        tripMemberId: id,
        holeNumber: 1,
        gross: 4,
      });
    }

    await commitThirtyBall(admin, {
      matchId: entry.match.id,
      teamId: teamA.id,
      holeNumber: 1,
      counted: [sideA[0]],
    });

    await assertRejects(
      () =>
        enterScore(admin, {
          matchId: entry.match.id,
          tripMemberId: sideA[0],
          holeNumber: 1,
          gross: 7,
        }),
      'locked by a committed 30 Ball hole',
      'editing a gross on a committed hole is rejected',
    );

    const still = await scoreRow(entry.match.id, sideA[0], 1);
    assertEq(still?.gross ?? null, 4, 'the committed gross is unchanged');
    assertEq(still?.counted ?? null, true, 'the commit set counted');
    assert(still?.committedAt != null, 'the commit stamped committed_at');
  });
}
