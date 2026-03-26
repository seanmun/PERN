import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { collision_speed } = await req.json();

  if (typeof collision_speed !== "number" || collision_speed < 1 || collision_speed > 10) {
    return NextResponse.json({ error: "collision_speed must be 1-10" }, { status: 400 });
  }

  const supabase = createAdminClient();

  await supabase
    .from("collider_state")
    .update({
      collision_speed,
      updated_at: new Date().toISOString(),
    })
    .neq("id", "");

  return NextResponse.json({ success: true, collision_speed });
}
