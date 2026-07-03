import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import WizardShell from '@/components/admin/EventWizard/WizardShell';
import DetailsStep from '@/components/admin/EventWizard/DetailsStep';

export const metadata: Metadata = {
  title: 'New event · Details · BuddyCup',
};

type Kind = 'trip' | 'outing' | 'match';

const COPY: Record<Kind, { title: string; body: string }> = {
  trip: {
    title: 'Name your trip.',
    body: 'A logo is optional — it shows on the trip header and cards.',
  },
  outing: {
    title: 'Name your outing.',
    body: 'A logo is optional — it shows on the trip header and cards.',
  },
  match: {
    title: 'Name your match.',
    body: 'A logo is optional — it shows on the trip header and cards.',
  },
};

export default async function NewTripDetailsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const ctx = await getGlobalAuthContext();
  if (!ctx) redirect('/sign-in?redirect_url=/trips/new');

  const { kind: kindRaw } = await searchParams;
  if (kindRaw !== 'trip' && kindRaw !== 'outing' && kindRaw !== 'match') {
    redirect('/trips/new');
  }
  const kind = kindRaw;
  const copy = COPY[kind];

  return (
    <div className="pb-24">
      <WizardShell active="details" />
      <div className="mx-auto max-w-xl px-4 pt-6">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-800 dark:text-yellow-500">
          Step 2
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{copy.title}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{copy.body}</p>

        <DetailsStep kind={kind} />
      </div>
    </div>
  );
}
