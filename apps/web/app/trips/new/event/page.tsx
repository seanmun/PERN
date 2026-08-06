import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import { getBuddies } from '@/lib/data/buddies';
import { loadBuilderCourses } from '@/lib/data/event-builder';
import EventBuilder from '@/components/event-builder/EventBuilder';

export const metadata: Metadata = {
  title: 'Set up an event · BuddyCup',
};

/**
 * The one creation flow (§10). The nine-screen wizard — `/trips/new`,
 * `/trips/new/course`, `/trips/new/details` and the six `/setup/*` steps —
 * is gone; this page is what replaced it.
 *
 * Match, outing and trip are not three forms here. They are the same
 * round-builder repeated zero, one or N times, and which one you have
 * built is derived from the result (§6.3), never asked.
 */
export default async function NewEventPage() {
  const ctx = await getGlobalAuthContext();
  if (!ctx) redirect('/sign-in?redirect_url=/trips/new/event');

  const [courses, buddies] = await Promise.all([
    loadBuilderCourses(ctx.user.id),
    getBuddies(ctx.user.id),
  ]);

  const email = ctx.user.email.toLowerCase();

  return (
    <div className="pb-24">
      <div className="mx-auto max-w-2xl px-4 pt-6">
        <h1 className="text-2xl font-bold tracking-tight">Set up an event</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Pick the course, the players and the game — teams, groups and
          matchups fill themselves in. Add a second round and it becomes a
          trip.
        </p>

        <EventBuilder
          init={{
            mode: 'create',
            me: {
              userId: ctx.user.id,
              email,
              nickname:
                ctx.user.displayName ?? ctx.user.fullName ?? email.split('@')[0],
              handicap: ctx.user.handicap ?? null,
            },
          }}
          courses={courses}
          buddies={buddies.map((b) => ({
            userId: b.userId,
            email: b.email,
            nickname: b.recentNickname || b.displayName || b.email.split('@')[0],
            handicap: b.recentHandicap,
            playedTogether: b.matchesPlayedTogether,
          }))}
        />
      </div>
    </div>
  );
}
