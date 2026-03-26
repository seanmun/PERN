"use client";

import type { Matchup } from "@/types";

const TOTAL_MATCHUPS = 6;

interface MatchupListProps {
  matchups: Matchup[];
}

export default function MatchupList({ matchups }: MatchupListProps) {
  const slots = Array.from({ length: TOTAL_MATCHUPS }, (_, i) => {
    return matchups[i] || null;
  });

  return (
    <div className="w-full max-w-[390px] mx-auto">
      <h2 className="text-xs font-mono tracking-widest text-zinc-500 uppercase mb-3">
        Matchups
      </h2>
      <div className="flex flex-col gap-2">
        {slots.map((matchup, i) => (
          <div
            key={i}
            className="flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-surface"
          >
            {matchup ? (
              <>
                <span className="text-sm font-mono">
                  <span className="text-accent-dan">
                    {matchup.player_a?.name}
                  </span>
                  <span className="text-zinc-600 mx-2">vs</span>
                  <span className="text-accent-ian">
                    {matchup.player_b?.name}
                  </span>
                </span>
                <span className="text-xs text-zinc-600 text-right">
                  <span>#{matchup.matchup_number}</span>
                  <br />
                  <span className="text-zinc-700">
                    {new Date(matchup.created_at).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </span>
              </>
            ) : (
              <span className="text-xs text-zinc-700 italic">
                Awaiting collision
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
