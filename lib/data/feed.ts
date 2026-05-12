import { eq, desc, and } from 'drizzle-orm';
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

export type FeedItem =
  | {
      kind: 'score';
      id: string;
      at: Date;
      author: FeedAuthor;
      match: FeedMatchSummary;
      holeNumber: number;
      par: number;
      gross: number;
      resultLabel: string;
    }
  | {
      kind: 'media';
      id: string;
      at: Date;
      author: FeedAuthor;
      mediaUrl: string;
      mediaType: 'image' | 'video';
      caption: string | null;
      match: FeedMatchSummary | null;
    }
  | {
      kind: 'text';
      id: string;
      at: Date;
      author: FeedAuthor;
      body: string;
      pinned: boolean;
    };

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
  opts?: { matchId?: string; limit?: number }
): Promise<FeedItem[]> {
  const limit = opts?.limit ?? 100;

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

  // SCORE EVENTS
  const scoreWhere = opts?.matchId
    ? and(eq(rounds.tripId, tripId), eq(holeScores.matchId, opts.matchId))
    : eq(rounds.tripId, tripId);

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
    at: r.media.createdAt,
    author: authorFromUserId(r.uploader.id, r.uploader.email),
    mediaUrl: r.media.url,
    mediaType: r.media.mediaType,
    caption: r.media.caption,
    match: r.media.matchId
      ? mediaMatchInfo.get(r.media.matchId) ?? null
      : null,
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
    at: r.msg.createdAt,
    author: authorFromUserId(r.author.id, r.author.email),
    body: r.msg.body,
    pinned: r.msg.pinnedByCaptain,
  }));

  const all = [...scoreItems, ...mediaItems, ...textItems];
  all.sort((a, b) => b.at.getTime() - a.at.getTime());

  return all.slice(0, limit);
}
