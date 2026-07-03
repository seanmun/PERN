import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import WizardShell from '@/components/admin/EventWizard/WizardShell';
import TypeStep from '@/components/admin/EventWizard/TypeStep';

export const metadata: Metadata = {
  title: 'New event · BuddyCup',
};

export default async function NewTripPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const ctx = await getGlobalAuthContext();
  if (!ctx) redirect('/sign-in?redirect_url=/trips/new');

  // Deep link support — nothing in the app currently links here with a
  // kind pre-set, but it's a cheap skip-ahead for anything that does
  // (or will) in the future.
  const { kind } = await searchParams;
  if (kind === 'trip' || kind === 'outing' || kind === 'match') {
    redirect(`/trips/new/details?kind=${kind}`);
  }

  return (
    <div className="pb-24">
      <WizardShell active="type" />
      <div className="mx-auto max-w-xl px-4 pt-6">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-800 dark:text-yellow-500">
          Step 1
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          What are you setting up?
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          This decides how many rounds and foursomes you&apos;ll build next.
        </p>

        <TypeStep />
      </div>
    </div>
  );
}
