import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Reset all players to active
  await supabase.from("players").update({ is_active: true }).neq("id", "");

  // Delete all matchups
  await supabase.from("matchups").delete().neq("id", "");

  // Delete all event logs
  await supabase.from("event_logs").delete().neq("id", "");

  // Stop collider
  await supabase
    .from("collider_state")
    .update({ is_running: false, updated_at: new Date().toISOString() })
    .neq("id", "");

  // Log the reset
  await supabase.from("event_logs").insert({
    message: "Collider reset — all particles restored",
    event_type: "system",
  });

  return NextResponse.json({ success: true });
}
