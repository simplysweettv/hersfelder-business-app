import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// PATCH /api/posts/[id] — caption aktualisieren
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { caption } = body;
  if (typeof caption !== "string") {
    return NextResponse.json({ error: "caption required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("posts")
    .update({ caption, updated_at: new Date().toISOString() })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
