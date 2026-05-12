import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { trips } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/current-user';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { getScheduleByDay } from '@/lib/data/schedule';
import ScheduleClient, {
  type ClientScheduleDay,
} from '@/components/schedule/ScheduleClient';

export default async function SchedulePage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/sign-in');

  const [trip] = await db
    .select()
    .from(trips)
    .where(eq(trips.slug, 'pinehurst-cup-2026'))
    .limit(1);

  if (!trip) {
    return (
      <div className="mx-auto max-w-md px-4 pt-16 pb-24">
        <div className="rounded-sm border border-yellow-600/20 bg-black/50 p-8 text-center">
          <p className="text-zinc-400">Trip not found.</p>
        </div>
      </div>
    );
  }

  const days = await getScheduleByDay(trip.id);

  const clientDays: ClientScheduleDay[] = days.map((d) => ({
    date: d.date,
    dayLabel: d.dayLabel,
    monthDay: d.monthDay,
    items: d.items.map((item) => {
      if (item.kind === 'golf') {
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
          matches: item.matches.map((m) => ({
            id: m.id,
            resultText: m.resultText,
            participants: m.participants.map((p) => ({
              tripMemberId: p.tripMemberId,
              nickname: p.member.nickname,
              tripHandicap: p.member.tripHandicap,
              teamId: p.teamId,
              teamName: p.team.name,
              teamColor: p.team.color,
            })),
          })),
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

  const canEdit = isPlatformAdmin(ctx) || isTripAdminOf(ctx, trip.id);

  return <ScheduleClient days={clientDays} canEdit={canEdit} />;
}
