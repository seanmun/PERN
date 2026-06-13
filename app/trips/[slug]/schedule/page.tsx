import { notFound, redirect } from 'next/navigation';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { getScheduleByDay } from '@/lib/data/schedule';
import { isIndividualInput, type FormatId } from '@/lib/scoring/formats';
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

  const days = await getScheduleByDay(trip.id);
  const canEdit = isPlatformAdmin(ctx) || isTripAdminOf(ctx, trip.id);

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
        const selfIsParticipant =
          ctx.tripMember
            ? item.matches.some((m) =>
                m.participants.some((p) => p.tripMemberId === ctx.tripMember!.id),
              )
            : false;
        // Route individual-input formats to the new tee-time scorecard.
        // Team-input formats (scramble, alternate_shot) stay on the legacy
        // match-keyed route until step 4 of the match-template spec ships
        // the team-line section on the new surface.
        const widestIsIndividual = widestMatch
          ? isIndividualInput(widestMatch.format as FormatId)
          : true;
        return {
          kind: 'golf',
          startTimeISO: item.startTime.toISOString(),
          teeTimeId: item.teeTime.id,
          groupNumber: item.teeTime.groupNumber,
          roundOrder: item.round.order,
          roundLabel: item.round.label,
          roundFormat: item.round.format,
          courseName: item.course.name,
          courseLocation: item.course.location,
          scoreMatchId: widestMatch?.id ?? null,
          scoreRoutesToTeeTime: widestIsIndividual,
          canEnterScores: canEdit || selfIsParticipant,
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
