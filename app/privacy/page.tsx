import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import Footer from '@/components/marketing/Footer';

export const metadata: Metadata = {
  title: 'Privacy · BuddyCup',
  description: 'How BuddyCup handles your data.',
};

export default function PrivacyPage() {
  return (
    <>
      <article className="mx-auto max-w-2xl px-4 py-16 sm:py-24">
        <Link
          href="/"
          className="group inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500 transition-colors hover:text-yellow-400"
        >
          <ArrowLeft
            size={12}
            strokeWidth={2.5}
            className="transition-transform group-hover:-translate-x-0.5"
            aria-hidden="true"
          />
          Back to home
        </Link>

        <header className="mt-8">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.35em] text-yellow-500">
            Privacy
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-zinc-100 sm:text-4xl">
            What we store, what we don’t.
          </h1>
          <p className="mt-4 text-sm text-zinc-500">Last updated: May 2026</p>
        </header>

        <div className="mt-10 space-y-8 text-zinc-300">
          <section>
            <h2 className="text-sm font-mono font-semibold uppercase tracking-[0.3em] text-yellow-500">
              The short version
            </h2>
            <p className="mt-3 leading-relaxed">
              BuddyCup is a small app for buddy golf trips. We store the
              information you need us to store so the app works — your email,
              your trip data, your posts. We don’t sell it, we don’t share it
              with anyone outside the trip you’re on, and we don’t run third‑party
              ad tracking.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-mono font-semibold uppercase tracking-[0.3em] text-yellow-500">
              What we collect
            </h2>
            <ul className="mt-3 space-y-2 leading-relaxed">
              <li>
                <strong className="text-zinc-100">Your account.</strong> Email
                and basic profile data via our auth provider (Clerk). We don’t
                store passwords — sign‑in is magic‑link based.
              </li>
              <li>
                <strong className="text-zinc-100">Your trip data.</strong>{' '}
                Scores, matchups, posts, photos, schedule items, and anything
                else you enter while using the app.
              </li>
              <li>
                <strong className="text-zinc-100">Standard server logs.</strong>{' '}
                Request metadata used to keep the service running and debug
                problems. Logs are retained briefly and not used for marketing.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-mono font-semibold uppercase tracking-[0.3em] text-yellow-500">
              What we don’t do
            </h2>
            <ul className="mt-3 space-y-2 leading-relaxed">
              <li>We don’t sell your data.</li>
              <li>We don’t share it with advertisers.</li>
              <li>We don’t run analytics that follow you around the web.</li>
              <li>
                We don’t require any credentials beyond what we need to sign
                you in.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-mono font-semibold uppercase tracking-[0.3em] text-yellow-500">
              Your data, your call
            </h2>
            <p className="mt-3 leading-relaxed">
              You can ask us to delete your account and your data at any time.
              Trip content you posted may remain visible to other members of
              that trip unless an admin removes it — the trip is the unit of
              ownership.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-mono font-semibold uppercase tracking-[0.3em] text-yellow-500">
              Contact
            </h2>
            <p className="mt-3 leading-relaxed">
              Questions, deletion requests, or anything else — reach the
              maintainer at{' '}
              <a
                href="https://seanmun.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-yellow-500 underline-offset-2 hover:underline"
              >
                seanmun.com
              </a>
              .
            </p>
          </section>
        </div>
      </article>
      <Footer />
    </>
  );
}
