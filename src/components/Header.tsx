"use client";

export default function Header() {
  return (
    <header className="w-full flex items-center justify-between px-4 py-3 border-b border-border">
      <h1 className="text-lg font-bold tracking-widest text-foreground">
        PERN
      </h1>
      <button className="text-xs text-zinc-500 border border-border rounded px-3 py-1 hover:text-foreground hover:border-zinc-500 transition-colors">
        Login
      </button>
    </header>
  );
}
