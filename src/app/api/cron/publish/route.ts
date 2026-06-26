import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPublishConfig, publishPost, syncPostStatus } from "@/lib/publishers/publish";
import type { Post } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;
// Cron MUSS bei jedem Aufruf frisch laufen (DB abfragen + posten) — niemals
// statisch zur Build-Zeit prerendern/cachen, sonst tut der Cron live nichts.
export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev / unsecured
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // WICHTIG: Service-Role-Client — Cron hat keine User-Session, RLS würde
  // sonst leere Ergebnisse / blockierte Writes liefern.
  const supabase = createAdminClient();
  const getConfig = await loadPublishConfig(supabase);

  const nowIso = new Date().toISOString();
  const { data: due } = await supabase
    .from("posts")
    .select("*")
    .in("status", ["scheduled", "approved", "failed"]) // failed = retry-fähig
    .not("scheduled_at", "is", null)
    .lte("scheduled_at", nowIso)
    .limit(10);

  // Sicherheitsnetz: postet sofort, falls die Übergabe an Blotato bei der
  // Freigabe nicht geklappt hat (Blotato down etc.). Bereits erfolgreich an
  // Blotato übergebene Plattformen werden per Idempotenz übersprungen.
  const results: unknown[] = [];
  for (const post of (due ?? []) as Post[]) {
    const r = await publishPost(supabase, post, getConfig, "immediate");
    results.push({ id: post.id, status: r.status, perPlatform: r.perPlatform, skipped: r.skipped });
  }

  // Echten Status offener Blotato-Einreichungen nachziehen (eingeplant → live/fehler).
  const { data: open } = await supabase
    .from("post_publications")
    .select("post_id")
    .not("external_id", "is", null)
    .is("public_url", null)
    .not("status", "in", "(failed,skipped)");
  const syncIds = Array.from(new Set((open ?? []).map((r) => r.post_id as string)));
  for (const id of syncIds) {
    await syncPostStatus(supabase, id, getConfig);
  }

  return NextResponse.json({
    processed: (due ?? []).length,
    synced: syncIds.length,
    results,
  });
}
