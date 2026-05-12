import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { ClerkProvider, Show, UserButton } from '@clerk/nextjs';
import { dark } from '@clerk/themes';
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
    <ClerkProvider
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: '#ca8a04',
          colorBackground: '#0a0a0a',
          colorText: '#f4f4f5',
          colorTextSecondary: '#a1a1aa',
          colorNeutral: '#f4f4f5',
          colorInputBackground: '#18181b',
          colorInputText: '#f4f4f5',
          colorDanger: '#dc2626',
          colorSuccess: '#16a34a',
        },
        elements: {
          userButtonPopoverCard:
            'bg-zinc-950 border border-zinc-800 shadow-xl',
          userButtonPopoverMain: 'bg-zinc-950',
          userButtonPopoverActionButton:
            'text-zinc-100 hover:bg-zinc-900',
          userButtonPopoverActionButton__signOut:
            'text-zinc-100 hover:bg-zinc-900',
          userButtonPopoverActionButtonText: 'text-zinc-100',
          userButtonPopoverActionButtonIcon: 'text-zinc-400',
          userButtonPopoverFooter: 'bg-zinc-950 border-t border-zinc-800',
          userPreviewMainIdentifier: 'text-zinc-100',
          userPreviewSecondaryIdentifier: 'text-zinc-400',
          card: 'bg-zinc-950 border border-zinc-800',
          headerTitle: 'text-zinc-100',
          headerSubtitle: 'text-zinc-400',
          formFieldLabel: 'text-zinc-200',
          formFieldInput:
            'bg-zinc-900 border border-zinc-800 text-zinc-100',
          formButtonPrimary:
            'bg-yellow-500 text-black hover:bg-yellow-400',
          footerActionText: 'text-zinc-400',
          footerActionLink: 'text-yellow-400 hover:text-yellow-300',
          identityPreviewText: 'text-zinc-100',
          identityPreviewEditButton: 'text-yellow-400',
        },
      }}
    >
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
