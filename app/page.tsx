import { Show } from '@clerk/nextjs';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="relative isolate min-h-[calc(100vh-130px)] overflow-hidden">
      <video
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-60"
        aria-hidden="true"
      >
        <source src="/golfball-test.mp4" type="video/mp4" />
      </video>

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(10,10,10,0.55) 0%, rgba(10,10,10,0.75) 60%, #0a0a0a 100%)',
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center">
        <div className="flex items-center gap-3">
          <span className="h-px w-8 bg-yellow-600/60" />
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.35em] text-yellow-500">
            August 19 – 22, 2026
          </p>
          <span className="h-px w-8 bg-yellow-600/60" />
        </div>

        <h1 className="mt-6 text-5xl font-bold tracking-tight sm:text-6xl drop-shadow-[0_2px_16px_rgba(0,0,0,0.8)]">
          <span className="block text-zinc-100">PINEHURST</span>
          <span className="block bg-gradient-to-b from-yellow-300 via-yellow-500 to-yellow-700 bg-clip-text text-transparent">
            CUP
          </span>
        </h1>
        <p className="mt-1 font-mono text-xs uppercase tracking-[0.4em] text-zinc-300">
          Est. 2026 — XXIst Cup
        </p>

        <p className="mt-8 max-w-md text-zinc-200 drop-shadow-[0_1px_8px_rgba(0,0,0,0.8)]">
          Ryder-Cup-style match play. Six rounds, two teams, twenty-one points.
        </p>

        <div className="mt-10 flex gap-3">
          <Show
            when="signed-in"
            fallback={
              <Link
                href="/sign-in"
                className="rounded-sm bg-yellow-500 px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.4)] hover:bg-yellow-400"
              >
                Sign in
              </Link>
            }
          >
            <Link
              href="/me"
              className="rounded-sm bg-yellow-500 px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.4)] hover:bg-yellow-400"
            >
              Enter
            </Link>
          </Show>
        </div>
      </div>
    </div>
  );
}
