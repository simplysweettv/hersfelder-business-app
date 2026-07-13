import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// PATCH /api/posts/[id] — Caption und/oder Termin aktualisieren
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    caption?: unknown;
    scheduled_at?: unknown;
  };

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.caption !== undefined) {
    if (typeof body.caption !== "string") {
      return NextResponse.json({ error: "caption muss ein String sein" }, { status: 400 });
    }
    update.caption = body.caption;
  }

  if (body.scheduled_at !== undefined) {
    if (body.scheduled_at === null || body.scheduled_at === "") {
      update.scheduled_at = null;
    } else {
      const d = new Date(String(body.scheduled_at));
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "scheduled_at ist kein gültiges Datum" }, { status: 400 });
      }
      update.scheduled_at = d.toISOString();
    }
  }

  if (Object.keys(update).length === 1) {
    return NextResponse.json({ error: "Nichts zu ändern" }, { status: 400 });
  }

  const { error } = await supabase
    .from("posts")
    .update(update)
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
