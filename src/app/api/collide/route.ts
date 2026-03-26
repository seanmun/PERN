import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await req.json();
    const { playerAId, playerBId } = body;

    if (!playerAId || !playerBId) {
      return NextResponse.json({ error: "Missing player IDs" }, { status: 400 });
    }

    // Verify both players are still active
    const { data: pA } = await supabase
      .from("players")
      .select("*")
      .eq("id", playerAId)
      .eq("is_active", true)
      .single();

    const { data: pB } = await supabase
      .from("players")
      .select("*")
      .eq("id", playerBId)
      .eq("is_active", true)
      .single();

    if (!pA || !pB) {
      return NextResponse.json({ error: "Already matched" }, { status: 200 });
    }

    const { count } = await supabase
      .from("matchups")
      .select("*", { count: "exact", head: true });

    const matchupNumber = (count ?? 0) + 1;

    const { error: matchupErr } = await supabase
      .from("matchups")
      .insert({
        player_a_id: pA.id,
        player_b_id: pB.id,
        matchup_number: matchupNumber,
      });

    if (matchupErr) {
      console.error("Matchup insert failed:", matchupErr);
      return NextResponse.json({ error: matchupErr.message }, { status: 500 });
    }

    await supabase
      .from("players")
      .update({ is_active: false })
      .in("id", [pA.id, pB.id]);

    await supabase.from("event_logs").insert({
      message: `Collision detected: ${pA.name} ↔ ${pB.name} — Matchup #${matchupNumber}`,
      event_type: "collision",
    });

    return NextResponse.json({ success: true, matchupNumber });
  } catch (err) {
    console.error("Collide endpoint error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
