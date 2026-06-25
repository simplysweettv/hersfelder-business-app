import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { captionForPlatform } from "@/lib/caption";
import { getPublisher } from "@/lib/publishers/registry";
import type { ConfigGetter } from "@/lib/publishers/types";
import type { Platform, Post } from "@/types";

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

  // Settings über Admin-Client laden (umgeht RLS), ENV hat Vorrang.
  const { data: settingsRows } = await supabase.from("settings").select("key,value");
  const settings: Record<string, string | null> = {};
  for (const row of settingsRows ?? []) settings[row.key] = row.value;
  const getConfig: ConfigGetter = (settingKey, envKey) =>
    (envKey ? process.env[envKey] : undefined) || settings[settingKey] || undefined;

  const nowIso = new Date().toISOString();
  const { data: due } = await supabase
    .from("posts")
    .select("*")
    .in("status", ["scheduled", "approved", "failed"]) // failed = retry-fähig
    .not("scheduled_at", "is", null)
    .lte("scheduled_at", nowIso)
    .limit(10);

  const results: unknown[] = [];

  for (const post of (due ?? []) as Post[]) {
    if (!post.image_url || !post.caption) {
      results.push({ id: post.id, skipped: "fehlendes image_url oder caption" });
      continue;
    }

    for (const platform of post.platforms) {
      // 1. Idempotenz: bereits erfolgreich → überspringen (kein Doppel-Post).
      const { data: existing } = await supabase
        .from("post_publications")
        .select("status")
        .eq("post_id", post.id)
        .eq("platform", platform)
        .maybeSingle();
      if (existing?.status === "success") {
        results.push({ id: post.id, platform, skipped: "bereits veröffentlicht" });
        continue;
      }

      // 2. Claim: Zeile auf "pending" setzen (unique post_id+platform).
      await supabase.from("post_publications").upsert(
        {
          post_id: post.id,
          platform,
          status: "pending",
          error: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "post_id,platform" },
      );

      // 3. Veröffentlichen über die Abstraktion (Anbieter egal).
      const caption = captionForPlatform(post.caption, platform);
      const outcome = await getPublisher(platform).publish(
        { imageUrl: post.image_url, caption },
        getConfig,
      );

      // reauth = kein verbundener Account (z.B. LinkedIn nicht angebunden) → skip, kein Fehler
      const pubStatus = outcome.ok ? "success" : outcome.reauth ? "skipped" : "failed";

      // 4. Ergebnis pro Plattform festhalten.
      await supabase
        .from("post_publications")
        .update({
          status: pubStatus,
          external_id: outcome.ok ? outcome.externalId : null,
          error: outcome.ok ? null : outcome.error,
          published_at: outcome.ok ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("post_id", post.id)
        .eq("platform", platform);

      // Rohantwort zusätzlich in publish_log (Debug-Historie).
      await supabase.from("publish_log").insert({
        post_id: post.id,
        platform,
        status: outcome.ok ? "success" : "failed",
        platform_post_id: outcome.ok ? outcome.externalId : null,
        error_message: outcome.ok ? null : outcome.error,
        response: (outcome.raw as Record<string, unknown>) ?? null,
      });

      results.push({
        id: post.id,
        platform,
        ok: outcome.ok,
        error: outcome.ok ? undefined : outcome.error,
      });
    }

    // 5. Post-Status aus den Per-Plattform-Zeilen ableiten.
    const { data: pubRows } = await supabase
      .from("post_publications")
      .select("platform,status")
      .eq("post_id", post.id);
    const statusByPlatform = new Map(
      (pubRows ?? []).map((r) => [r.platform as Platform, r.status as string]),
    );
    // skipped (z.B. LinkedIn nicht verbunden) zählt nicht als Fehler
    const allSuccess = post.platforms.every(
      (p) => statusByPlatform.get(p) === "success" || statusByPlatform.get(p) === "skipped",
    );
    const anyFailed = post.platforms.some(
      (p) => statusByPlatform.get(p) === "failed",
    );

    await supabase
      .from("posts")
      .update({
        status: allSuccess ? "published" : anyFailed ? "failed" : "scheduled",
        published_at: allSuccess ? new Date().toISOString() : post.published_at ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", post.id);
  }

  return NextResponse.json({ processed: (due ?? []).length, results });
}
