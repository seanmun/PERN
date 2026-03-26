import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const supabase = createAdminClient();

  // Get current state
  const { data: state } = await supabase
    .from("collider_state")
    .select("*")
    .single();

  if (!state) {
    return NextResponse.json({ error: "No collider state found" }, { status: 500 });
  }

  const newRunning = !state.is_running;

  await supabase
    .from("collider_state")
    .update({
      is_running: newRunning,
      started_at: newRunning ? new Date().toISOString() : state.started_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", state.id);

  if (newRunning) {
    await supabase.from("event_logs").insert({
      message: "Collider activated — orbital sync initiated",
      event_type: "system",
    });
  }

  return NextResponse.json({ is_running: newRunning });
}
