"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";

export default function Header() {
  const [user, setUser] = useState<User | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleMagicLink() {
    if (!email) return;
    setSending(true);
    const supabase = createClient();
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setSending(false);
    setSent(true);
  }

  return (
    <header className="w-full border-b border-border">
      <div className="flex items-center justify-between px-4 py-3">
        <Link href="/" className="flex flex-col">
          <h1 className="text-lg font-bold tracking-widest text-foreground leading-tight">
            PERN
          </h1>
          <span className="text-[9px] text-zinc-400 tracking-wide">
            Pinehurst Organization for Nuclear Research
          </span>
        </Link>
        {user ? (
          <Link
            href="/profile"
            className="text-xs text-zinc-500 border border-border rounded px-3 py-1 hover:text-foreground hover:border-zinc-500 transition-colors"
          >
            Profile
          </Link>
        ) : (
          <button
            onClick={() => setShowLogin(!showLogin)}
            className="text-xs text-zinc-500 border border-border rounded px-3 py-1 hover:text-foreground hover:border-zinc-500 transition-colors"
          >
            Login
          </button>
        )}
      </div>

      {/* Magic link form */}
      {showLogin && !user && (
        <div className="px-4 pb-3">
          {sent ? (
            <p className="text-xs text-zinc-500 font-mono">
              Check your email for the magic link.
            </p>
          ) : (
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="flex-1 bg-background border border-border rounded px-3 py-1.5 text-sm font-mono text-foreground focus:outline-none focus:border-indigo-500/50"
                onKeyDown={(e) => e.key === "Enter" && handleMagicLink()}
              />
              <button
                onClick={handleMagicLink}
                disabled={sending}
                className="text-xs font-mono border border-indigo-500/30 rounded px-3 py-1.5 text-indigo-400 hover:bg-indigo-500/10 transition-colors disabled:opacity-50"
              >
                {sending ? "..." : "Send"}
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
