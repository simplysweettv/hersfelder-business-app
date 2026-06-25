import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPublishConfig, publishPost } from "@/lib/publishers/publish";
import type { Post } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

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
    .select("*")
    .eq("id", params.id)
    .single();
  if (readErr || !post)
    return NextResponse.json({ error: "Post not found" }, { status: 404 });

  // Ohne Termin: nur freigeben (kein Posting) — wie bisher.
  if (!post.scheduled_at) {
    const { error } = await supabase
      .from("posts")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: "approved", scheduled: false });
  }

  // Mit Termin: direkt an den Anbieter (Blotato) mit scheduledTime übergeben.
  // Blotato postet dann selbst exakt zur eingestellten Uhrzeit.
  const admin = createAdminClient();
  const getConfig = await loadPublishConfig(admin);
  const result = await publishPost(admin, post as Post, getConfig, "schedule");

  if (!result.ok) {
    const firstErr =
      result.perPlatform.find((p) => !p.ok)?.error ??
      result.skipped ??
      "Übergabe an Blotato fehlgeschlagen.";
    return NextResponse.json(
      { ok: false, status: result.status, error: firstErr, perPlatform: result.perPlatform },
      { status: 200 },
    );
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    scheduled: true,
    scheduledAt: post.scheduled_at,
    perPlatform: result.perPlatform,
  });
}
