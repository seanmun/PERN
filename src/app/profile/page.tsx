"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Header from "@/components/Header";
import type { Player, Profile } from "@/types";
import type { User } from "@supabase/supabase-js";

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [ghinNumber, setGhinNumber] = useState("");
  const [handicapIndex, setHandicapIndex] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/";
        return;
      }

      setUser(user);

      // Fetch profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (profileData) {
        setProfile(profileData);
        setGhinNumber(profileData.ghin_number ?? "");
        setHandicapIndex(
          profileData.handicap_index != null
            ? String(profileData.handicap_index)
            : ""
        );

        // Fetch linked player
        if (profileData.player_id) {
          const { data: playerData } = await supabase
            .from("players")
            .select("*")
            .eq("id", profileData.player_id)
            .single();

          if (playerData) setPlayer(playerData);
        }
      }
    }

    load();
  }, []);

  async function handleSave() {
    if (!user || !profile) return;
    setSaving(true);
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        ghin_number: ghinNumber || null,
        handicap_index: handicapIndex ? parseFloat(handicapIndex) : null,
        ghin_last_updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    setSaving(false);
    setMessage(error ? "Failed to save" : "Profile updated");
    setTimeout(() => setMessage(""), 3000);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (!user) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-sm text-zinc-500 font-mono">Loading...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 flex flex-col items-center gap-6 px-4 py-8">
        <div className="w-full max-w-[390px] space-y-6">
          <h2 className="text-lg font-mono font-bold tracking-wider">
            Profile
          </h2>

          {/* Identity */}
          <div className="space-y-2">
            <div className="text-xs text-zinc-500 font-mono uppercase tracking-widest">
              Identity
            </div>
            <div className="px-4 py-3 rounded-lg border border-border bg-surface space-y-1">
              <p className="text-sm font-mono">{user.email}</p>
              {player && (
                <>
                  <p className="text-sm font-mono">
                    Particle:{" "}
                    <span
                      className={
                        player.team === "Dan"
                          ? "text-accent-dan"
                          : "text-accent-ian"
                      }
                    >
                      {player.name}
                    </span>
                  </p>
                  <p className="text-xs text-zinc-600">
                    Team {player.team}
                    {player.is_captain ? " · Captain" : ""}
                  </p>
                </>
              )}
              {!player && profile && (
                <p className="text-xs text-zinc-600 italic">
                  No particle assigned
                </p>
              )}
            </div>
          </div>

          {/* GHIN */}
          <div className="space-y-2">
            <div className="text-xs text-zinc-500 font-mono uppercase tracking-widest">
              Golf Info
            </div>
            <div className="px-4 py-3 rounded-lg border border-border bg-surface space-y-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">
                  GHIN Number
                </label>
                <input
                  type="text"
                  value={ghinNumber}
                  onChange={(e) => setGhinNumber(e.target.value)}
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-indigo-500/50"
                  placeholder="1234567"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">
                  Handicap Index
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={handicapIndex}
                  onChange={(e) => setHandicapIndex(e.target.value)}
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-indigo-500/50"
                  placeholder="12.3"
                />
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-2 text-sm font-mono tracking-wider border border-indigo-500/30 rounded text-indigo-400 hover:bg-indigo-500/10 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              {message && (
                <p className="text-xs text-zinc-500 text-center">{message}</p>
              )}
            </div>
          </div>

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            className="w-full py-2 text-sm font-mono text-zinc-600 border border-border rounded hover:text-foreground hover:border-zinc-500 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </main>
    </div>
  );
}
