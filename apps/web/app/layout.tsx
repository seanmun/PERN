import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import HeaderAvatar from '@/components/HeaderAvatar';
import ThemeToggle from '@/components/ThemeToggle';
import './globals.css';

/**
 * Runs synchronously in <head> before any paint. Reads the user's stored
 * theme choice (`light` / `dark` / `system`) and sets the `.dark` class on
 * <html> when appropriate, so the page never flashes the wrong colors when
 * a navigation lands on it.
 *
 * Wrapped in a dangerouslySetInnerHTML <script> so it ships as-is (not
 * inside an event handler), and small enough to ship inline on every page.
 */
const NO_FLASH_SCRIPT = `(() => {
  try {
    const stored = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = stored === 'dark' || ((!stored || stored === 'system') && prefersDark);
    if (isDark) document.documentElement.classList.add('dark');
  } catch (_) {
    // localStorage blocked (private mode etc.) — fall back to OS preference.
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark');
    }
  }
})();`;

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
        suppressHydrationWarning
      >
        <head>
          <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
        </head>
        <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-[#0a0a0a] dark:text-zinc-100">
          <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-green-900/40 dark:bg-black/80">
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
                <ThemeToggle />
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
