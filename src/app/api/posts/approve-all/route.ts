import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: pending, error: readErr } = await supabase
    .from("posts")
    .select("id, scheduled_at")
    .eq("status", "pending");
  if (readErr)
    return NextResponse.json({ error: readErr.message }, { status: 500 });

  const scheduledIds = (pending ?? []).filter((p) => p.scheduled_at).map((p) => p.id);
  const approvedIds = (pending ?? []).filter((p) => !p.scheduled_at).map((p) => p.id);

  if (scheduledIds.length) {
    await supabase
      .from("posts")
      .update({ status: "scheduled", updated_at: new Date().toISOString() })
      .in("id", scheduledIds);
  }
  if (approvedIds.length) {
    await supabase
      .from("posts")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .in("id", approvedIds);
  }

  return NextResponse.json({ ok: true, scheduled: scheduledIds.length, approved: approvedIds.length });
}
