import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { ClerkProvider, Show, UserButton } from '@clerk/nextjs';
import Link from 'next/link';
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
        <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">
          <header className="border-b border-zinc-800 bg-zinc-950">
            <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
              <Link href="/" className="font-mono text-sm font-semibold tracking-widest uppercase">
                Pinehurst Cup
              </Link>
              <div className="flex items-center gap-3">
                <Show
                  when="signed-in"
                  fallback={
                    <Link
                      href="/sign-in"
                      className="rounded-md border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-900"
                    >
                      Sign in
                    </Link>
                  }
                >
                  <UserButton afterSignOutUrl="/" />
                </Show>
              </div>
            </div>
          </header>
          <main className="flex-1">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
