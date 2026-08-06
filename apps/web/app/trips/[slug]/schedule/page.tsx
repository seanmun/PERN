import { notFound, redirect } from 'next/navigation';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { canEditTrip, canViewTrip } from '@/lib/auth/permissions';
import { getScheduleByDay } from '@/lib/data/schedule';
import ScheduleClient, {
  type ClientScheduleDay,
} from '@/components/schedule/ScheduleClient';

export default async function TripSchedulePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');
  if (!canViewTrip(ctx)) notFound();

  const days = await getScheduleByDay(trip.id);
  const canEdit = canEditTrip(ctx, trip.id);

  const clientDays: ClientScheduleDay[] = days.map((d) => ({
    date: d.date,
    dayLabel: d.dayLabel,
    monthDay: d.monthDay,
    items: d.items.map((item) => {
      if (item.kind === 'golf') {
        // The "enter scores" button per foursome routes to the WIDEST match
        // (most participants). Best Ball includes all four players; Singles
        // includes two. Picking the widest match means a single tap reveals
        // every score row that needs filling for the group — fan-out then
        // propagates each gross to every stacked match automatically.
        const widestMatch = [...item.matches].sort(
          (a, b) => b.participants.length - a.participants.length,
        )[0];
        // A player can be in this foursome via the group roster even when
        // the round's match is hosted by another group (round-wide 30
        // Ball etc.) — they still need their own scorecard.
        const selfIsParticipant =
          ctx.tripMember
            ? item.matches.some((m) =>
                m.participants.some((p) => p.tripMemberId === ctx.tripMember!.id),
              ) ||
              item.roster.some((r) => r.tripMemberId === ctx.tripMember!.id)
            : false;
        return {
          kind: 'golf',
          startTimeISO: item.startTime.toISOString(),
          timeTbd: item.timeTbd,
          teeTimeId: item.teeTime.id,
          roundId: item.round.id,
          groupNumber: item.teeTime.groupNumber,
          roundOrder: item.round.order,
          roundLabel: item.round.label,
          roundFormat: item.round.format,
          courseName: item.course.name,
          courseLocation: item.course.location,
          scoreMatchId: widestMatch?.id ?? null,
          canEnterScores: canEdit || selfIsParticipant,
          roster: item.roster,
          matches: item.matches.map((m) => ({
            id: m.id,
            format: m.format,
            resultText: m.resultText,
            participants: m.participants.map((p) => ({
              tripMemberId: p.tripMemberId,
              nickname: p.member.nickname,
              tripHandicap: p.member.tripHandicap,
              teamId: p.teamId,
              teamName: p.team.name,
              teamColor: p.team.color,
              arcadePortraitUrl: p.arcadePortraitUrl,
              // Display priority: trip-scoped avatar (admin can set per-trip)
              // > global user avatar.
              avatarUrl: p.member.avatarUrl ?? p.userAvatarUrl,
            })),
          })),
        };
      }
      if (item.kind === 'empty_round') {
        return {
          kind: 'empty_round',
          startTimeISO: item.startTime.toISOString(),
          roundId: item.round.id,
          roundOrder: item.round.order,
          roundLabel: item.round.label,
          roundFormat: item.round.format,
          courseName: item.course.name,
          courseLocation: item.course.location,
        };
      }
      return {
        kind: 'event',
        startTimeISO: item.startTime.toISOString(),
        eventId: item.event.id,
        type: item.event.type,
        title: item.event.title,
        description: item.event.description,
        location: item.event.location,
        address: item.event.address,
      };
    }),
  }));

  return <ScheduleClient days={clientDays} canEdit={canEdit} tripSlug={slug} />;
}
