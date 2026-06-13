import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import NewTripForm from '@/components/trips/NewTripForm';

export const metadata: Metadata = {
  title: 'New event · BuddyCup',
};

type Kind = 'trip' | 'outing' | 'match';

const COPY: Record<Kind, { eyebrow: string; title: string; body: string }> = {
  trip: {
    eyebrow: 'New trip',
    title: 'Multi-day trip.',
    body: 'You’ll be the trip admin. Add players, courses, rounds, and matchups after this step.',
  },
  outing: {
    eyebrow: 'New outing',
    title: 'Single-day outing.',
    body: 'One round, one course, multiple groups. You’ll be the admin — add players and matchups next.',
  },
  match: {
    eyebrow: 'New match',
    title: 'Quick match.',
    body: 'One round, 2–4 players, one card. Fastest way to keep score. You’ll be the admin.',
  },
};

export default async function NewTripPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const ctx = await getGlobalAuthContext();
  if (!ctx) redirect('/sign-in?redirect_url=/trips/new');

  const { kind: kindRaw } = await searchParams;
  const kind: Kind =
    kindRaw === 'outing' || kindRaw === 'match' ? kindRaw : 'trip';
  const copy = COPY[kind];

  return (
    <div className="mx-auto max-w-xl px-4 pb-24 pt-6">
      <Link
        href="/home"
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Home
      </Link>

      <header className="mt-6">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.35em] text-yellow-500">
          {copy.eyebrow}
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          {copy.title}
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{copy.body}</p>
      </header>

      <NewTripForm kind={kind} />
    </div>
  );
}
