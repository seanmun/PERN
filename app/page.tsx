import { Show } from '@clerk/nextjs';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-zinc-500">
        August 19–22, 2026
      </p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
        Pinehurst Cup
      </h1>
      <p className="mt-4 max-w-md text-zinc-400">
        Ryder-Cup-style match play. Six rounds, two teams, twenty-one points.
      </p>

      <div className="mt-10 flex gap-3">
        <Show
          when="signed-in"
          fallback={
            <Link
              href="/sign-in"
              className="rounded-md bg-zinc-100 px-5 py-2.5 text-sm font-medium text-zinc-950 hover:bg-white"
            >
              Sign in
            </Link>
          }
        >
          <Link
            href="/me"
            className="rounded-md bg-zinc-100 px-5 py-2.5 text-sm font-medium text-zinc-950 hover:bg-white"
          >
            Enter
          </Link>
        </Show>
      </div>
    </div>
  );
}
