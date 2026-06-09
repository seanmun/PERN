import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import HeaderAvatar from '@/components/HeaderAvatar';
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
  title: 'BuddyCup',
  description: 'The cupboard. Ryder-Cup-style match-play tracking for your trips.',
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
              <Link href="/" className="group flex items-center" aria-label="BuddyCup home">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/branding/BuddyCup-Logo-eyebrow.png"
                  alt="BuddyCup"
                  className="h-7 w-auto transition-opacity group-hover:opacity-90 sm:h-8"
                />
              </Link>
              <div className="flex items-center gap-3">
                <HeaderAvatar />
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
