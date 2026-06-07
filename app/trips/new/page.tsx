import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import NewTripForm from '@/components/trips/NewTripForm';

export const metadata: Metadata = {
  title: 'New trip · BuddyCup',
};

export default async function NewTripPage() {
  const ctx = await getGlobalAuthContext();
  if (!ctx) redirect('/sign-in?redirect_url=/trips/new');

  return (
    <div className="mx-auto max-w-xl px-4 pb-24 pt-6">
      <Link
        href="/me"
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> My trips
      </Link>

      <header className="mt-6">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.35em] text-yellow-500">
          New trip
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-zinc-100">
          Start your cup.
        </h1>
        <p className="mt-3 text-sm text-zinc-400">
          You’ll be the trip admin. Add players, courses, and matchups after this step.
        </p>
      </header>

      <NewTripForm />
    </div>
  );
}
