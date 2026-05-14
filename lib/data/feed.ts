import { eq, desc, and, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  trips,
  tripMembers,
  teams,
  matches,
  matchParticipants,
  rounds,
  courses,
  courseHoles,
  holeScores,
  media,
  messages,
  users,
  reactions,
} from '@/db/schema';

export type FeedAuthor = {
  tripMemberId: string | null;
  nickname: string;
  avatarUrl: string | null;
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
      resultLabel: string;
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
    })
  | (FeedItemBase & {
      kind: 'text';
      author: FeedAuthor;
      body: string;
      pinned: boolean;
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

function scoreLabel(gross: number, par: number): string {
  const diff = gross - par;
  if (gross === 1) return 'Hole in one';
  if (diff <= -3) return 'Albatross';
  if (diff in SCORE_LABELS) return SCORE_LABELS[diff];
  return `+${diff}`;
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
    .select()
    .from(tripMembers)
    .where(eq(tripMembers.tripId, tripId));
  const memberById = new Map(memberRows.map((m) => [m.id, m]));
  const memberByUserId = new Map(
    memberRows.filter((m) => m.userId).map((m) => [m.userId as string, m])
  );

  function authorFromMember(memberId: string): FeedAuthor {
    const m = memberById.get(memberId);
    if (!m) {
      return {
        tripMemberId: null,
        nickname: 'Unknown',
        avatarUrl: null,
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

  const scoreItems: FeedItem[] = scoreRows
    .filter((r) => r.score.gross != null)
    .map((r) => ({
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
      gross: r.score.gross!,
      resultLabel: scoreLabel(r.score.gross!, r.hole.par),
      reactions: { counts: {}, myEmojis: [] },
    }));

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
      .innerJoin(courses, eq(rounds.courseId, courses.id));
    for (const row of mInfo) {
      if (!mediaMatchIds.includes(row.match.id)) continue;
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
