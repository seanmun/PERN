"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Matchup, EventLog, Player } from "@/types";

export function useRealtimeData() {
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [colliderRunning, setColliderRunning] = useState(false);
  const [collisionSpeed, setCollisionSpeed] = useState(5);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const supabase = createClient();

    const [matchupsRes, eventsRes, playersRes, stateRes] = await Promise.all([
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
      supabase.from("collider_state").select("*").single(),
    ]);

    if (matchupsRes.data) setMatchups(matchupsRes.data);
    if (eventsRes.data) setEvents(eventsRes.data);
    if (playersRes.data) setPlayers(playersRes.data);
    if (stateRes.data) {
      setColliderRunning(stateRes.data.is_running);
      setCollisionSpeed(stateRes.data.collision_speed ?? 5);
    }
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

    // Subscribe to collider state changes
    const colliderChannel = supabase
      .channel("collider-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "collider_state" },
        (payload) => {
          const newState = payload.new as { is_running: boolean; collision_speed?: number };
          setColliderRunning(newState.is_running);
          if (newState.collision_speed != null) setCollisionSpeed(newState.collision_speed);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(matchupChannel);
      supabase.removeChannel(eventChannel);
      supabase.removeChannel(playerChannel);
      supabase.removeChannel(colliderChannel);
    };
  }, [fetchData]);

  return { matchups, events, players, colliderRunning, collisionSpeed, loading };
}
