import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  // Verify authorization (cron secret or admin)
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Get active players from each team
  const { data: danPlayers, error: danErr } = await supabase
    .from("players")
    .select("*")
    .eq("team", "Dan")
    .eq("is_active", true);

  const { data: ianPlayers, error: ianErr } = await supabase
    .from("players")
    .select("*")
    .eq("team", "Ian")
    .eq("is_active", true);

  if (danErr || ianErr) {
    return NextResponse.json(
      { error: "Failed to fetch players" },
      { status: 500 }
    );
  }

  if (!danPlayers?.length || !ianPlayers?.length) {
    return NextResponse.json(
      { error: "No active players remaining", complete: true },
      { status: 200 }
    );
  }

  // Pick one random player from each team
  const playerA = danPlayers[Math.floor(Math.random() * danPlayers.length)];
  const playerB = ianPlayers[Math.floor(Math.random() * ianPlayers.length)];

  // Get current matchup count
  const { count } = await supabase
    .from("matchups")
    .select("*", { count: "exact", head: true });

  const matchupNumber = (count ?? 0) + 1;

  // Create matchup
  const { data: matchup, error: matchupErr } = await supabase
    .from("matchups")
    .insert({
      player_a_id: playerA.id,
      player_b_id: playerB.id,
      matchup_number: matchupNumber,
    })
    .select()
    .single();

  if (matchupErr) {
    return NextResponse.json(
      { error: "Failed to create matchup" },
      { status: 500 }
    );
  }

  // Mark both players inactive
  await supabase
    .from("players")
    .update({ is_active: false })
    .in("id", [playerA.id, playerB.id]);

  // Log the collision event
  await supabase.from("event_logs").insert({
    message: `Collision detected: ${playerA.name} ↔ ${playerB.name} — Matchup #${matchupNumber}`,
    event_type: "collision",
  });

  // Log stabilization flavor text
  await supabase.from("event_logs").insert({
    message: "Chamber stabilizing... field integrity nominal",
    event_type: "flavor",
  });

  // Optional: send email notification via Resend
  if (process.env.RESEND_API_KEY && process.env.NOTIFICATION_EMAIL) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: "PERN <onboarding@resend.dev>",
        to: process.env.NOTIFICATION_EMAIL,
        subject: `PERN Collision #${matchupNumber}: ${playerA.name} vs ${playerB.name}`,
        html: `
          <h2>Collision Detected</h2>
          <p><strong>${playerA.name}</strong> (Team ${playerA.team}) vs <strong>${playerB.name}</strong> (Team ${playerB.team})</p>
          <p>Matchup #${matchupNumber} — ${new Date().toLocaleString()}</p>
          <p style="color: #666; font-size: 12px;">Pinehurst Experimental Randomizer Network</p>
        `,
      });
    } catch {
      // Email is optional — don't fail the collision
    }
  }

  return NextResponse.json({
    matchup,
    playerA: { id: playerA.id, name: playerA.name, team: playerA.team },
    playerB: { id: playerB.id, name: playerB.name, team: playerB.team },
    matchupNumber,
    remainingDan: danPlayers.length - 1,
    remainingIan: ianPlayers.length - 1,
  });
}
