"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

const SPEED_LABELS: Record<number, string> = {
  1: "~45 min",
  2: "~30 min",
  3: "~20 min",
  4: "~15 min",
  5: "~10 min",
  6: "~7 min",
  7: "~5 min",
  8: "~3 min",
  9: "~2 min",
  10: "~1 min (testing)",
};

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState("");
  const [speed, setSpeed] = useState(5);
  const [isRunning, setIsRunning] = useState(false);
  const [activeCount, setActiveCount] = useState(0);
  const [matchupCount, setMatchupCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const fetchStatus = useCallback(async () => {
    const supabase = createClient();
    const [stateRes, playersRes, matchupsRes] = await Promise.all([
      supabase.from("collider_state").select("*").single(),
      supabase.from("players").select("id, is_active"),
      supabase.from("matchups").select("id"),
    ]);

    if (stateRes.data) {
      setIsRunning(stateRes.data.is_running);
      setSpeed(stateRes.data.collision_speed ?? 5);
    }
    if (playersRes.data) {
      setActiveCount(playersRes.data.filter((p) => p.is_active).length);
    }
    if (matchupsRes.data) {
      setMatchupCount(matchupsRes.data.length);
    }
  }, []);

  useEffect(() => {
    if (authenticated) fetchStatus();
  }, [authenticated, fetchStatus]);

  function showMessage(msg: string) {
    setMessage(msg);
    setTimeout(() => setMessage(""), 3000);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    // Verify by making a test call
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secret": secret,
      },
      body: JSON.stringify({ collision_speed: 5 }),
    });

    if (res.ok) {
      setAuthenticated(true);
    } else {
      setError("Invalid password");
    }
  }

  async function handleReset() {
    if (!confirm("Reset everything? All matchups will be deleted and all players reactivated.")) return;
    setLoading(true);
    const res = await fetch("/api/admin/reset", {
      method: "POST",
      headers: { "x-admin-secret": secret },
    });

    if (res.ok) {
      showMessage("Collider reset complete");
      fetchStatus();
    } else {
      showMessage("Reset failed");
    }
    setLoading(false);
  }

  async function handleStop() {
    setLoading(true);
    await fetch("/api/collider", { method: "POST" });
    showMessage("Collider toggled");
    setTimeout(fetchStatus, 500);
    setLoading(false);
  }

  async function handleSpeedChange(newSpeed: number) {
    setSpeed(newSpeed);
    await fetch("/api/admin/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secret": secret,
      },
      body: JSON.stringify({ collision_speed: newSpeed }),
    });
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <form onSubmit={handleLogin} className="flex flex-col gap-4 w-full max-w-xs">
          <h1 className="text-lg font-mono text-zinc-300 tracking-wider text-center">
            PERN Admin
          </h1>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Admin password"
            className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500"
            autoFocus
          />
          {error && <p className="text-red-400 text-xs font-mono">{error}</p>}
          <button
            type="submit"
            className="px-4 py-2 text-sm font-mono border border-indigo-500/30 rounded text-indigo-400 hover:bg-indigo-500/10 transition-colors"
          >
            Enter
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-12 gap-8">
      <h1 className="text-lg font-mono text-zinc-300 tracking-wider">
        PERN Admin
      </h1>

      {/* Status */}
      <div className="w-full max-w-sm bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 font-mono text-sm space-y-2">
        <div className="flex justify-between">
          <span className="text-zinc-500">Status</span>
          <span className={isRunning ? "text-green-400" : "text-zinc-400"}>
            {isRunning ? "Running" : "Idle"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">Matchups</span>
          <span className="text-zinc-300">{matchupCount} / 6</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">Active particles</span>
          <span className="text-zinc-300">{activeCount} / 12</span>
        </div>
      </div>

      {/* Collision Speed Slider */}
      <div className="w-full max-w-sm bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 font-mono text-sm space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-zinc-400">Collision frequency</span>
          <span className="text-indigo-400">{speed}</span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          value={speed}
          onChange={(e) => handleSpeedChange(Number(e.target.value))}
          className="w-full accent-indigo-500"
        />
        <div className="flex justify-between text-[10px] text-zinc-600">
          <span>Rare</span>
          <span>Medium</span>
          <span>Fast</span>
        </div>
        <p className="text-center text-zinc-500 text-xs">
          Est. total time for all 6 collisions: <span className="text-zinc-300">{SPEED_LABELS[speed]}</span>
        </p>
      </div>

      {/* Actions */}
      <div className="w-full max-w-sm flex flex-col gap-3">
        <button
          onClick={handleStop}
          disabled={loading}
          className="w-full px-4 py-2 text-sm font-mono border border-zinc-600/30 rounded text-zinc-400 hover:bg-zinc-800/50 transition-colors disabled:opacity-50"
        >
          {isRunning ? "Stop Collider" : "Start Collider"}
        </button>
        <button
          onClick={handleReset}
          disabled={loading}
          className="w-full px-4 py-2 text-sm font-mono border border-red-500/30 rounded text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
        >
          Reset Everything
        </button>
      </div>

      {/* Message */}
      {message && (
        <p className="text-xs font-mono text-indigo-400 animate-pulse">
          {message}
        </p>
      )}

      {/* Back link */}
      <a
        href="/"
        className="text-xs font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
      >
        ← Back to Collider
      </a>
    </div>
  );
}
