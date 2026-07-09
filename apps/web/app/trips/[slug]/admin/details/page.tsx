import { redirect } from 'next/navigation';

/**
 * Legacy trip-details form. Superseded by the Details tab of the
 * event-settings surface — one form, not two drifting copies. Kept as a
 * redirect so old links/bookmarks keep working.
 */
export default async function AdminTripDetailsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/trips/${slug}/setup/details`);
}
