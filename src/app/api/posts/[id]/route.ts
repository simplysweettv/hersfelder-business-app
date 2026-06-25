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

// DELETE /api/posts/[id] — post löschen (inkl. Brief + Storage-Bild)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Bild-URL für Storage-Cleanup holen
  const { data: post } = await supabase
    .from("posts")
    .select("image_url")
    .eq("id", params.id)
    .single();

  // Brief löschen (Foreign Key)
  await supabase.from("post_briefs").delete().eq("post_id", params.id);

  // Post löschen
  const { error } = await supabase.from("posts").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Storage-Bild löschen (best-effort)
  if (post?.image_url) {
    const match = post.image_url.match(/post-images\/(.+)$/);
    if (match) {
      await supabase.storage.from("post-images").remove([match[1]]);
    }
  }

  return NextResponse.json({ ok: true });
}
