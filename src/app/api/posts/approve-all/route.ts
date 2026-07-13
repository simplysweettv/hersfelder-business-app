import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPublishConfig, publishPost } from "@/lib/publishers/publish";
import { approvalGate } from "@/lib/quality";
import type { Post } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Sammelfreigabe — nutzt EXAKT dieselbe Publishing-Pipeline wie die
 * Einzel-Freigabe (publishPost mit scheduledTime an den Anbieter), statt nur
 * den DB-Status umzustellen. Vorher konnte ein für 19:00 geplanter Post bis
 * zum nächsten Publish-Cron am Folgetag liegen bleiben.
 *
 * Bewusst konservativ: Posts mit Blockern (TÜV nicht bestanden, verbotene
 * Claims, Termin vorbei, kein Termin) werden ÜBERSPRUNGEN und einzeln
 * begründet — Sofort-Veröffentlichungen passieren nie versteckt im Bulk.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: pending, error: readErr } = await supabase
    .from("posts")
    .select("*")
    .eq("status", "pending")
    .order("scheduled_at", { ascending: true });
  if (readErr)
    return NextResponse.json({ error: readErr.message }, { status: 500 });

  const posts = (pending ?? []) as (Post & { quality_status?: string | null })[];
  if (!posts.length) {
    return NextResponse.json({ ok: true, approved: 0, scheduled: 0, skipped: [], failed: [] });
  }

  const admin = createAdminClient();
  const getConfig = await loadPublishConfig(admin);

  let approved = 0;
  let scheduledCount = 0;
  let platformsOk = 0;
  let platformsTotal = 0;
  const skipped: { id: string; title: string; reason: string }[] = [];
  const failed: { id: string; title: string; error: string }[] = [];

  for (const post of posts) {
    const gate = approvalGate(post);
    const reasons = [...gate.hardBlockers, ...gate.blockers];
    if (reasons.length) {
      skipped.push({
        id: post.id,
        title: post.title ?? "Ohne Titel",
        reason: reasons[0],
      });
      continue;
    }

    const result = await publishPost(admin, post, getConfig, "schedule", "manual");
    await admin
      .from("posts")
      .update({ approved_at: new Date().toISOString() })
      .eq("id", post.id);

    approved++;
    platformsTotal += result.perPlatform.length;
    platformsOk += result.perPlatform.filter((p) => p.ok).length;

    if (result.ok) {
      scheduledCount++;
    } else {
      const firstErr =
        result.perPlatform.find((p) => !p.ok)?.error ?? "Übergabe fehlgeschlagen.";
      failed.push({ id: post.id, title: post.title ?? "Ohne Titel", error: firstErr });
    }
  }

  return NextResponse.json({
    ok: failed.length === 0,
    approved,
    scheduled: scheduledCount,
    platformsOk,
    platformsTotal,
    skipped,
    failed,
  });
}
