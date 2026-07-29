import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPublishConfig, publishPost } from "@/lib/publishers/publish";
import type { Post } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * "Erneut versuchen" aus dem Status-Fenster im Kalender.
 *
 * Bewusst NUR für Posts, die schon einmal freigegeben und übergeben wurden
 * (es existiert mindestens eine post_publications-Zeile). Ein nie freigegebener
 * Post darf hier nicht rausgehen — der gehört durch die Freigabe inklusive
 * Qualitäts-TÜV. So kann der Retry-Knopf das Gate nicht umgehen.
 *
 * publishPost überspringt bereits erfolgreiche Plattformen und claimt jede
 * Plattform atomar — ein Doppel-Post ist damit ausgeschlossen.
 */
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

  const admin = createAdminClient();

  // Schutzregel: nur nachholen, was schon einmal übergeben wurde.
  const { data: pubs } = await admin
    .from("post_publications")
    .select("platform, status")
    .eq("post_id", params.id);

  const retryable = (pubs ?? []).filter(
    (p) => p.status === "failed" || p.status === "skipped",
  );
  if (retryable.length === 0) {
    const alreadyDone = (pubs ?? []).some((p) => p.status === "success");
    return NextResponse.json(
      {
        ok: false,
        error: alreadyDone
          ? "Es gibt nichts nachzuholen — alle Kanäle sind bereits durch."
          : "Dieser Post wurde nie freigegeben. Bitte in den Freigaben freigeben — dort läuft auch der Qualitäts-TÜV.",
      },
      { status: 409 },
    );
  }

  if (!post.image_url || !post.caption) {
    return NextResponse.json(
      { ok: false, error: "Dem Post fehlt Bild oder Text — er kann so nicht raus." },
      { status: 400 },
    );
  }

  // Termin noch in der Zukunft → wieder einplanen, sonst jetzt veröffentlichen.
  const isFuture =
    post.scheduled_at && new Date(post.scheduled_at).getTime() > Date.now();
  const mode = isFuture ? "schedule" : "immediate";

  const getConfig = await loadPublishConfig(admin);
  const result = await publishPost(admin, post as Post, getConfig, mode, "manual");

  if (!result.ok) {
    const firstErr =
      result.perPlatform.find((p) => !p.ok)?.error ??
      result.skipped ??
      "Der neue Versuch ist fehlgeschlagen.";
    return NextResponse.json(
      { ok: false, status: result.status, error: firstErr, perPlatform: result.perPlatform },
      { status: 200 },
    );
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    mode,
    perPlatform: result.perPlatform,
  });
}
