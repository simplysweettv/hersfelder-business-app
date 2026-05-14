import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: post, error: readErr } = await supabase
    .from("posts")
    .select("scheduled_at")
    .eq("id", params.id)
    .single();
  if (readErr || !post)
    return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const status = post.scheduled_at ? "scheduled" : "approved";
  const { error } = await supabase
    .from("posts")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, status });
}
