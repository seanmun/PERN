import Link from 'next/link';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-zinc-900 bg-[#0a0a0a]">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex flex-col items-center gap-6 md:flex-row md:items-center md:justify-between">
          <Link
            href="/"
            className="group inline-flex items-baseline gap-2"
            aria-label="BuddyCup home"
          >
            <span className="font-mono text-xs font-bold uppercase tracking-[0.35em] text-yellow-500 group-hover:text-yellow-400">
              Buddy
            </span>
            <span className="font-mono text-xs font-bold uppercase tracking-[0.35em] text-zinc-100 group-hover:text-white">
              Cup
            </span>
          </Link>

          <nav aria-label="Footer">
            <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              <FooterLink href="/privacy">Privacy</FooterLink>
              <FooterLink href="/brand">Brand</FooterLink>
              <FooterLink href="https://seanmun.com" external>
                Contact
              </FooterLink>
            </ul>
          </nav>
        </div>

        <p className="mt-8 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-600 md:text-left">
          © {year} BuddyCup · All rights reserved
        </p>
      </div>
    </footer>
  );
}

function FooterLink({
  href,
  children,
  external,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  const className =
    'font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-400 transition-colors hover:text-yellow-400 focus-visible:outline-none focus-visible:text-yellow-400';

  if (external) {
    return (
      <li>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
        >
          {children}
        </a>
      </li>
    );
  }

  return (
    <li>
      <Link href={href} className={className}>
        {children}
      </Link>
    </li>
  );
}
