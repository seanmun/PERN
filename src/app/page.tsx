"use client";

import Header from "@/components/Header";
import ColliderChamber from "@/components/ColliderChamber";
import MatchupList from "@/components/MatchupList";
import EventLog from "@/components/EventLog";
import { useRealtimeData } from "@/lib/useRealtimeData";

export default function Home() {
  const { matchups, events, players, loading } = useRealtimeData();

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 flex flex-col items-center gap-8 px-4 py-8">
        <ColliderChamber players={players} />
        <MatchupList matchups={matchups} />
        <EventLog events={events} />
        {loading && (
          <p className="text-xs font-mono text-zinc-700">
            Connecting to PERN network...
          </p>
        )}
      </main>
    </div>
  );
}
