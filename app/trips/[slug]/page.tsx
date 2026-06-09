import { redirect } from 'next/navigation';

/**
 * Safety net for bare `/trips/[slug]` URLs — no page lives there, every
 * trip surface (schedule, scoreboard, feed, etc.) is one level deeper.
 * Anyone who lands here (old email link, manual URL trim) lands on the
 * schedule, which is the most useful default first view of an event.
 */
export default async function TripIndexRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/trips/${slug}/schedule`);
}
