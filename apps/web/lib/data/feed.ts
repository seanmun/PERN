import { eq, desc, and, inArray } from 'drizzle-orm';
import { allocateCourseStrokes } from '@buddycup/scoring/handicap';
import { db } from '@/db/client';
import {
  tripMembers,
  teams,
  matches,
  rounds,
  courses,
  courseHoles,
  courseTees,
  holeScores,
  media,
  messages,
  users,
  reactions,
} from '@/db/schema';

export type FeedAuthor = {
  tripMemberId: string | null;
  nickname: string;
  avatarUrl: string | null;            // regular photo (tripMember.avatarUrl fallback)
  arcadePortraitUrl: string | null;    // NBA Jam portrait (users.arcadePortraitUrl)
  teamId: string | null;
  teamName: string | null;
  teamColor: string | null;
};

export type FeedMatchSummary = {
  matchId: string;
  roundOrder: number;
  courseName: string;
};

export type FeedReactions = {
  counts: Record<string, number>;
  myEmojis: string[];
};

type FeedItemBase = {
  id: string;
  targetId: string;
  at: Date;
  reactions: FeedReactions;
};

export type FeedItem =
  | (FeedItemBase & {
      kind: 'score';
      author: FeedAuthor;
      match: FeedMatchSummary;
      holeNumber: number;
      par: number;
      gross: number;
      strokes: number;          // handicap strokes the player gets on this hole
      net: number;              // gross - strokes
      resultLabel: string;      // computed against NET — "Net Par" when strokes > 0
    })
  | (FeedItemBase & {
      kind: 'media';
      author: FeedAuthor;
      mediaUrl: string;
      mediaType: 'image' | 'video';
      caption: string | null;
      match: FeedMatchSummary | null;
      moderationStatus: 'approved' | 'flagged';
      moderationReason: string | null;
      isMine: boolean;
    })
  | (FeedItemBase & {
      kind: 'text';
      author: FeedAuthor;
      body: string;
      pinned: boolean;
      isMine: boolean;
    });

const SCORE_LABELS: Record<number, string> = {
  [-4]: 'Condor',
  [-3]: 'Albatross',
  [-2]: 'Eagle',
  [-1]: 'Birdie',
  [0]: 'Par',
  [1]: 'Bogey',
  [2]: 'Double bogey',
  [3]: 'Triple bogey',
};

function rawLabel(net: number, par: number): string {
  const diff = net - par;
  // Check the table BEFORE the catch-all, or SCORE_LABELS[-4] ('Condor')
  // is unreachable and a net 4-under reads as an albatross.
  if (diff in SCORE_LABELS) return SCORE_LABELS[diff];
  if (diff <= -3) return 'Albatross';
  return diff > 0 ? `+${diff}` : String(diff);
}

function scoreLabel(gross: number, par: number, strokes: number): string {
  // Hole in one is hole in one regardless of strokes — gross is what matters.
  if (gross === 1) return 'Hole in one';
  const net = gross - strokes;
  const label = rawLabel(net, par);
  return strokes > 0 ? `Net ${label.toLowerCase()}` : label;
}

export async function getFeed(
  tripId: string,
  opts?: { matchId?: string; limit?: number; currentUserId?: string }
): Promise<FeedItem[]> {
  const limit = opts?.limit ?? 100;
  const currentUserId = opts?.currentUserId;

  // Build team map for author tags
  const teamRows = await db.select().from(teams).where(eq(teams.tripId, tripId));
  const teamById = new Map(teamRows.map((t) => [t.id, t]));

  const memberRows = await db
    .select({
      member: tripMembers,
      arcadePortraitUrl: users.arcadePortraitUrl,
    })
    .from(tripMembers)
    .leftJoin(users, eq(tripMembers.userId, users.id))
    .where(eq(tripMembers.tripId, tripId));
  type MemberRow = (typeof memberRows)[number]['member'] & {
    arcadePortraitUrl: string | null;
  };
  const memberById = new Map<string, MemberRow>(
    memberRows.map((r) => [
      r.member.id,
      { ...r.member, arcadePortraitUrl: r.arcadePortraitUrl },
    ]),
  );
  const memberByUserId = new Map<string, MemberRow>(
    memberRows
      .filter((r) => r.member.userId)
      .map((r) => [
        r.member.userId as string,
        { ...r.member, arcadePortraitUrl: r.arcadePortraitUrl },
      ]),
  );

  function authorFromMember(memberId: string): FeedAuthor {
    const m = memberById.get(memberId);
    if (!m) {
      return {
        tripMemberId: null,
        nickname: 'Unknown',
        avatarUrl: null,
        arcadePortraitUrl: null,
        teamId: null,
        teamName: null,
        teamColor: null,
      };
    }
    const t = m.teamId ? teamById.get(m.teamId) ?? null : null;
    return {
      tripMemberId: m.id,
      nickname: m.nickname,
      avatarUrl: m.avatarUrl,
      arcadePortraitUrl: m.arcadePortraitUrl,
      teamId: m.teamId,
      teamName: t?.name ?? null,
      teamColor: t?.color ?? null,
    };
  }

  function authorFromUserId(userId: string, fallback: string): FeedAuthor {
    const m = memberByUserId.get(userId);
    if (m) return authorFromMember(m.id);
    return {
      tripMemberId: null,
      nickname: fallback,
      avatarUrl: null,
      arcadePortraitUrl: null,
      teamId: null,
      teamName: null,
      teamColor: null,
    };
  }

  // SCORE EVENTS — hidden rounds (test rounds) excluded from the feed
  const scoreWhere = opts?.matchId
    ? and(eq(rounds.tripId, tripId), eq(holeScores.matchId, opts.matchId), eq(rounds.isHidden, false))
    : and(eq(rounds.tripId, tripId), eq(rounds.isHidden, false));

  const scoreRows = await db
    .select({
      score: holeScores,
      hole: courseHoles,
      match: matches,
      round: rounds,
      course: courses,
    })
    .from(holeScores)
    .innerJoin(matches, eq(holeScores.matchId, matches.id))
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .innerJoin(courses, eq(rounds.courseId, courses.id))
    .innerJoin(
      courseHoles,
      and(
        eq(courseHoles.courseId, rounds.courseId),
        eq(courseHoles.holeNumber, holeScores.holeNumber)
      )
    )
    .where(scoreWhere)
    .orderBy(desc(holeScores.enteredAt))
    .limit(limit);

  // Handicap strokes for the net labels, on the SAME basis as the
  // individual leaderboard: full COURSE handicap (index converted via the
  // round tee's slope/rating), allocated by stroke index. The feed used
  // the raw index, so on a sloped course a hole could read "Net birdie"
  // here and net par on the leaderboard.
  const scoredCourseIds = Array.from(
    new Set(scoreRows.map((r) => r.round.courseId)),
  );
  const teesList = scoredCourseIds.length
    ? await db
        .select()
        .from(courseTees)
        .where(inArray(courseTees.courseId, scoredCourseIds))
    : [];
  const holesForCourses = scoredCourseIds.length
    ? await db
        .select()
        .from(courseHoles)
        .where(inArray(courseHoles.courseId, scoredCourseIds))
    : [];
  const courseHoleList = new Map<
    string,
    { holeNumber: number; handicapIndex: number }[]
  >();
  const parByCourse = new Map<string, number>();
  for (const ch of holesForCourses) {
    const list = courseHoleList.get(ch.courseId) ?? [];
    list.push({ holeNumber: ch.holeNumber, handicapIndex: ch.handicapIndex });
    courseHoleList.set(ch.courseId, list);
    parByCourse.set(ch.courseId, (parByCourse.get(ch.courseId) ?? 0) + ch.par);
  }

  const strokeCache = new Map<string, Map<number, number>>();
  function strokesFor(
    round: { id: string; courseId: string; courseTeeId: string | null },
    tripMemberId: string,
  ): Map<number, number> {
    const key = `${round.id}::${tripMemberId}`;
    const cached = strokeCache.get(key);
    if (cached) return cached;
    const member = memberById.get(tripMemberId);
    const index = member?.tripHandicap ? Number(member.tripHandicap) : 18;
    const tee =
      teesList.find((t) => t.id === round.courseTeeId) ??
      teesList.find((t) => t.courseId === round.courseId && t.isDefault) ??
      null;
    const allocated = allocateCourseStrokes(
      index,
      {
        slope: tee?.slope ?? null,
        rating: tee?.rating != null ? Number(tee.rating) : null,
        par: parByCourse.get(round.courseId) ?? null,
      },
      courseHoleList.get(round.courseId) ?? [],
    );
    strokeCache.set(key, allocated);
    return allocated;
  }

  // One physical ball per player per round per hole. The score fan-out
  // writes an identical row into EVERY match that player is in for the
  // round (stacked side matches, round-wide rollups), and team formats
  // fan a single team gross across all teammates — so without this the
  // same birdie posts two or three identical cards. Keep the row from
  // the widest match, same rule the leaderboard dedupe uses.
  const participantCount = new Map<string, number>();
  for (const r of scoreRows) {
    participantCount.set(
      r.match.id,
      (participantCount.get(r.match.id) ?? 0) + 1,
    );
  }
  const bestScoreRow = new Map<string, (typeof scoreRows)[number]>();
  for (const r of scoreRows) {
    if (r.score.gross == null) continue;
    const key = `${r.score.tripMemberId}::${r.round.id}::${r.score.holeNumber}`;
    const existing = bestScoreRow.get(key);
    if (existing) {
      const a = participantCount.get(existing.match.id) ?? 0;
      const b = participantCount.get(r.match.id) ?? 0;
      if (a >= b) continue;
    }
    bestScoreRow.set(key, r);
  }

  const scoreItems: FeedItem[] = Array.from(bestScoreRow.values())
    .map((r) => {
      const strokes =
        strokesFor(r.round, r.score.tripMemberId).get(r.score.holeNumber) ?? 0;
      const gross = r.score.gross!;
      const net = gross - strokes;
      return {
        kind: 'score' as const,
        id: `score:${r.score.id}`,
        targetId: r.score.id,
        at: r.score.enteredAt,
        author: authorFromMember(r.score.tripMemberId),
        match: {
          matchId: r.match.id,
          roundOrder: r.round.order,
          courseName: r.course.name,
        },
        holeNumber: r.score.holeNumber,
        par: r.hole.par,
        gross,
        strokes,
        net,
        resultLabel: scoreLabel(gross, r.hole.par, strokes),
        reactions: { counts: {}, myEmojis: [] },
      };
    });

  // MEDIA POSTS
  const mediaWhere = opts?.matchId
    ? and(eq(media.tripId, tripId), eq(media.matchId, opts.matchId))
    : eq(media.tripId, tripId);

  const mediaRows = await db
    .select({ media, uploader: users })
    .from(media)
    .innerJoin(users, eq(media.uploadedBy, users.id))
    .where(mediaWhere)
    .orderBy(desc(media.createdAt))
    .limit(limit);

  const mediaMatchIds = Array.from(
    new Set(mediaRows.map((r) => r.media.matchId).filter(Boolean) as string[])
  );

  const mediaMatchInfo = new Map<string, FeedMatchSummary>();
  if (mediaMatchIds.length) {
    const mInfo = await db
      .select({ match: matches, round: rounds, course: courses })
      .from(matches)
      .innerJoin(rounds, eq(matches.roundId, rounds.id))
      .innerJoin(courses, eq(rounds.courseId, courses.id))
      .where(inArray(matches.id, mediaMatchIds));
    for (const row of mInfo) {
      mediaMatchInfo.set(row.match.id, {
        matchId: row.match.id,
        roundOrder: row.round.order,
        courseName: row.course.name,
      });
    }
  }

  const mediaItems: FeedItem[] = mediaRows.map((r) => ({
    kind: 'media' as const,
    id: `media:${r.media.id}`,
    targetId: r.media.id,
    at: r.media.createdAt,
    author: authorFromUserId(r.uploader.id, r.uploader.email),
    mediaUrl: r.media.url,
    mediaType: r.media.mediaType,
    caption: r.media.caption,
    match: r.media.matchId
      ? mediaMatchInfo.get(r.media.matchId) ?? null
      : null,
    moderationStatus: r.media.moderationStatus,
    moderationReason: r.media.moderationReason,
    isMine: currentUserId != null && r.uploader.id === currentUserId,
    reactions: { counts: {}, myEmojis: [] },
  }));

  // TEXT POSTS
  const textRows = await db
    .select({ msg: messages, author: users })
    .from(messages)
    .innerJoin(users, eq(messages.authorId, users.id))
    .where(eq(messages.tripId, tripId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  const textItems: FeedItem[] = textRows.map((r) => ({
    kind: 'text' as const,
    id: `text:${r.msg.id}`,
    targetId: r.msg.id,
    at: r.msg.createdAt,
    author: authorFromUserId(r.author.id, r.author.email),
    body: r.msg.body,
    pinned: r.msg.pinnedByCaptain,
    isMine: currentUserId != null && r.author.id === currentUserId,
    reactions: { counts: {}, myEmojis: [] },
  }));

  const all = [...scoreItems, ...mediaItems, ...textItems];
  all.sort((a, b) => b.at.getTime() - a.at.getTime());
  const top = all.slice(0, limit);

  // Batch-fetch reactions for the displayed items.
  const targetIds = top.map((i) => i.targetId);
  if (targetIds.length > 0) {
    const reactionRows = await db
      .select()
      .from(reactions)
      .where(inArray(reactions.targetId, targetIds));

    const byTarget = new Map<string, { counts: Record<string, number>; myEmojis: string[] }>();
    for (const r of reactionRows) {
      const key = `${r.targetKind}:${r.targetId}`;
      const entry = byTarget.get(key) ?? { counts: {}, myEmojis: [] };
      entry.counts[r.emoji] = (entry.counts[r.emoji] ?? 0) + 1;
      if (currentUserId && r.userId === currentUserId) {
        entry.myEmojis.push(r.emoji);
      }
      byTarget.set(key, entry);
    }

    for (const item of top) {
      const key = `${item.kind}:${item.targetId}`;
      const entry = byTarget.get(key);
      if (entry) item.reactions = entry;
    }
  }

  return top;
}
