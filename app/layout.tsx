import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { ClerkProvider, Show, UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Pinehurst Cup',
  description: 'Ryder-Cup-style match-play tracker for the Pinehurst Cup trip.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          <header className="border-b border-green-900/40 bg-black/80 backdrop-blur">
            <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
              <Link href="/" className="group flex items-baseline gap-2">
                <span className="font-mono text-xs font-bold uppercase tracking-[0.35em] text-yellow-500 group-hover:text-yellow-400">
                  Pinehurst
                </span>
                <span className="font-mono text-xs font-bold uppercase tracking-[0.35em] text-zinc-100 group-hover:text-white">
                  Cup
                </span>
              </Link>
              <div className="flex items-center gap-3">
                <Show
                  when="signed-in"
                  fallback={
                    <Link
                      href="/sign-in"
                      className="rounded-sm border border-yellow-600/40 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-widest text-yellow-400 hover:bg-yellow-600/10 hover:text-yellow-300"
                    >
                      Sign in
                    </Link>
                  }
                >
                  <UserButton />
                </Show>
              </div>
            </div>
          </header>
          <main className="flex-1 pb-24">{children}</main>
          <BottomNav />
        </body>
      </html>
    </ClerkProvider>
  );
}
