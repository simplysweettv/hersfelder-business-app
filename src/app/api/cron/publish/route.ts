import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthorized } from "@/lib/cron-auth";
import { loadPublishConfig, publishPost, syncPostStatus } from "@/lib/publishers/publish";
import { startRun, finishRun } from "@/lib/automation";
import { snapshotMetrics } from "@/lib/metrics-snapshot";
import type { Post } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;
// Cron MUSS bei jedem Aufruf frisch laufen (DB abfragen + posten) — niemals
// statisch zur Build-Zeit prerendern/cachen, sonst tut der Cron live nichts.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = cronAuthorized(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? "Unauthorized" }, { status: 401 });
  }

  // WICHTIG: Service-Role-Client — Cron hat keine User-Session, RLS würde
  // sonst leere Ergebnisse / blockierte Writes liefern.
  const supabase = createAdminClient();
  const getConfig = await loadPublishConfig(supabase);
  const runId = await startRun(supabase, "publication", "cron");

  const nowIso = new Date().toISOString();
  const { data: due } = await supabase
    .from("posts")
    .select("*")
    .in("status", ["scheduled", "approved", "failed"]) // failed = retry-fähig
    .not("scheduled_at", "is", null)
    .lte("scheduled_at", nowIso)
    .limit(10);

  // Sicherheitsnetz: postet sofort, falls die Übergabe an den Anbieter bei der
  // Freigabe nicht geklappt hat (Anbieter down etc.). Bereits erfolgreich
  // übergebene Plattformen werden per atomarem Claim übersprungen; der Cron
  // respektiert die Retry-Klassifizierung (permanent/Backoff).
  const results: unknown[] = [];
  const postIds: string[] = [];
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const post of (due ?? []) as Post[]) {
    const r = await publishPost(supabase, post, getConfig, "immediate", "cron");
    postIds.push(post.id);
    if (r.ok) succeeded++;
    else {
      failed++;
      const err = r.perPlatform.find((p) => !p.ok && !p.skippedAttempt)?.error ?? r.skipped;
      if (err) errors.push(`${post.title ?? post.id}: ${err}`);
    }
    results.push({ id: post.id, status: r.status, perPlatform: r.perPlatform, skipped: r.skipped });
  }

  // Echten Status offener Einreichungen nachziehen (eingeplant → live/fehler).
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

  // Tägliche Metrik-Snapshots — dauerhafte Analytics-Historie (24h/7d/30d).
  let snapshotted = 0;
  try {
    snapshotted = await snapshotMetrics(supabase);
  } catch (e) {
    errors.push(`Metrik-Snapshot: ${e instanceof Error ? e.message : String(e)}`);
  }

  await finishRun(supabase, runId, {
    planned: (due ?? []).length,
    succeeded,
    failed,
    errors,
    postIds,
    meta: { synced: syncIds.length, snapshotted },
  });

  return NextResponse.json({
    processed: (due ?? []).length,
    synced: syncIds.length,
    snapshotted,
    results,
  });
}
