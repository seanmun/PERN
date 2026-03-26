"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Matchup, EventLog, Player } from "@/types";

export function useRealtimeData() {
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const supabase = createClient();

    const [matchupsRes, eventsRes, playersRes] = await Promise.all([
      supabase
        .from("matchups")
        .select("*, player_a:players!player_a_id(*), player_b:players!player_b_id(*)")
        .order("matchup_number", { ascending: true }),
      supabase
        .from("event_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("players").select("*"),
    ]);

    if (matchupsRes.data) setMatchups(matchupsRes.data);
    if (eventsRes.data) setEvents(eventsRes.data);
    if (playersRes.data) setPlayers(playersRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();

    const supabase = createClient();

    // Subscribe to new matchups
    const matchupChannel = supabase
      .channel("matchups-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "matchups" },
        () => {
          // Refetch to get joined player data
          fetchData();
        }
      )
      .subscribe();

    // Subscribe to new events
    const eventChannel = supabase
      .channel("events-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "event_logs" },
        (payload) => {
          setEvents((prev) => [payload.new as EventLog, ...prev]);
        }
      )
      .subscribe();

    // Subscribe to player updates (active status changes)
    const playerChannel = supabase
      .channel("players-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "players" },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(matchupChannel);
      supabase.removeChannel(eventChannel);
      supabase.removeChannel(playerChannel);
    };
  }, [fetchData]);

  return { matchups, events, players, loading };
}
