import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import Footer from '@/components/marketing/Footer';

export const metadata: Metadata = {
  title: 'Brand · BuddyCup',
  description: 'Brand palette, typography, and design theory behind BuddyCup.',
};

const PALETTE = [
  {
    label: 'Background',
    hex: '#0a0a0a',
    role: 'Page surface. Near‑black, never pure #000 — keeps shadows readable.',
  },
  {
    label: 'Gold',
    hex: '#eab308',
    role: 'Primary accent. CTAs, the “CUP” wordmark, the Chunkers team color.',
  },
  {
    label: 'Green',
    hex: '#16a34a',
    role: 'Secondary accent. Live scoring positives, the Hacks team color.',
  },
  {
    label: 'Zinc 100',
    hex: '#f4f4f5',
    role: 'Body text on dark surfaces. High contrast, neutral.',
  },
  {
    label: 'Zinc 400',
    hex: '#a1a1aa',
    role: 'Supporting copy, captions, secondary labels.',
  },
  {
    label: 'Zinc 900',
    hex: '#18181b',
    role: 'Card surfaces, divider borders, icon backplates.',
  },
] as const;

export default function BrandPage() {
  return (
    <>
      <article className="mx-auto max-w-3xl px-4 py-16 sm:py-24">
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
            Brand
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-5xl">
            Designed for the trip, not the boardroom.
          </h1>
          <p className="mt-5 text-zinc-600 dark:text-zinc-400">
            BuddyCup borrows from Ryder Cup broadcasts, classic arcade UI, and
            the energy of a Saturday‑night clubhouse. Below is the visual
            system everything is built on.
          </p>
        </header>

        {/* Palette */}
        <section className="mt-16">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.35em] text-yellow-500">
            Palette
          </h2>
          <p className="mt-3 text-zinc-600 dark:text-zinc-400">
            High contrast, dark‑first, two saturated accents. Greens and golds
            map to the two competing teams; zinc neutrals handle everything
            else.
          </p>

          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {PALETTE.map((c) => (
              <li
                key={c.hex}
                className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-3"
              >
                <div
                  className="h-16 w-full rounded-sm border border-zinc-200 dark:border-zinc-900"
                  style={{ background: c.hex }}
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{c.label}</p>
                <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                  {c.hex}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{c.role}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Typography */}
        <section className="mt-16">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.35em] text-yellow-500">
            Typography
          </h2>
          <p className="mt-3 text-zinc-600 dark:text-zinc-400">
            Two faces from the Geist family — Sans for everything readable,
            Mono for labels, scores, and broadcast‑style kickers.
          </p>

          <div className="mt-6 space-y-3">
            <div className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">
                Geist Sans · Body
              </p>
              <p className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                Run your trip. Crown your champion.
              </p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Headlines, paragraphs, button text. Tight tracking on the big
                ones, normal everywhere else.
              </p>
            </div>

            <div className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">
                Geist Mono · Labels
              </p>
              <p className="mt-2 font-mono text-xs font-bold uppercase tracking-[0.35em] text-yellow-500">
                Defend the cup · Round 03 · Live
              </p>
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                Uppercase, wide tracking ({'0.30em–0.35em'}). The voice of
                kickers, badges, scoreboards, and footer chrome.
              </p>
            </div>
          </div>
        </section>

        {/* Theory */}
        <section className="mt-16">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.35em] text-yellow-500">
            Design theory
          </h2>
          <div className="mt-4 space-y-5 leading-relaxed text-zinc-700 dark:text-zinc-300">
            <p>
              <strong className="text-zinc-900 dark:text-zinc-100">Broadcast‑native.</strong>{' '}
              Scores, leaderboards, and kicker labels read like a sports
              broadcast graphic. Mono‑case labels, gold accents on key numbers,
              team color stripes on every player chip.
            </p>
            <p>
              <strong className="text-zinc-900 dark:text-zinc-100">Mobile‑first.</strong> The
              canonical surface is a phone in a cart on a Wednesday afternoon —
              one column, big touch targets, no nested menus. Desktop layouts
              are a courtesy, not the priority.
            </p>
            <p>
              <strong className="text-zinc-900 dark:text-zinc-100">Irreverent, not cute.</strong>{' '}
              Buddy trips don’t use corporate SaaS voice and they don’t use
              cartoon mascots either. The copy talks like the group does.
            </p>
            <p>
              <strong className="text-zinc-900 dark:text-zinc-100">Dark, with edges.</strong>{' '}
              Sharp corners (Tailwind’s <code className="font-mono text-yellow-500">rounded-sm</code>)
              over pill shapes. Visible borders. Black surfaces with one‑pixel
              hairline rules between sections — never floating cards in soft
              gradients.
            </p>
          </div>
        </section>
      </article>
      <Footer />
    </>
  );
}
