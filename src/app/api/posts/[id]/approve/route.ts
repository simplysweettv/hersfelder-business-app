import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPublishConfig, publishPost } from "@/lib/publishers/publish";
import { approvalGate } from "@/lib/quality";
import type { Post } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Einzel-Freigabe — EIN Weg für alle Fälle:
 * - Termin in der Zukunft → sofortige Übergabe an den Anbieter (schedule),
 *   der exakt zur Uhrzeit postet. Kein Warten auf den täglichen Cron.
 * - Termin vorbei oder kein Termin → sofort veröffentlichen (immediate) —
 *   aber nur nach bewusster Bestätigung (Gate/Override), nie überraschend.
 *
 * Qualitäts-Gate: fehlendes Bild/Caption/Plattform blockiert hart; verbotene
 * Claims, nicht bestandener TÜV und "würde sofort posten" verlangen ein
 * explizites override:true im Body (die UI holt die Bestätigung ein).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { override?: boolean };
  const override = body.override === true;

  const { data: post, error: readErr } = await supabase
    .from("posts")
    .select("*")
    .eq("id", params.id)
    .single();
  if (readErr || !post)
    return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const gate = approvalGate(post as Post & { quality_status?: string | null });

  if (gate.hardBlockers.length) {
    return NextResponse.json(
      { ok: false, error: gate.hardBlockers.join(" "), blockers: gate.hardBlockers },
      { status: 400 },
    );
  }
  if (gate.blockers.length && !override) {
    return NextResponse.json(
      {
        ok: false,
        requiresConfirm: true,
        blockers: gate.blockers,
        warnings: gate.warnings,
      },
      { status: 409 },
    );
  }

  const isFuture =
    post.scheduled_at && new Date(post.scheduled_at).getTime() > Date.now();
  const mode = isFuture ? "schedule" : "immediate";

  const admin = createAdminClient();
  const getConfig = await loadPublishConfig(admin);
  const result = await publishPost(admin, post as Post, getConfig, mode, "manual");

  // Audit: wann wurde freigegeben (auch wenn die Übergabe scheitert).
  await admin
    .from("posts")
    .update({ approved_at: new Date().toISOString() })
    .eq("id", params.id);

  if (!result.ok) {
    const firstErr =
      result.perPlatform.find((p) => !p.ok)?.error ??
      result.skipped ??
      "Übergabe an den Veröffentlichungsdienst fehlgeschlagen.";
    return NextResponse.json(
      {
        ok: false,
        status: result.status,
        error: firstErr,
        perPlatform: result.perPlatform,
      },
      { status: 200 },
    );
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    mode,
    scheduled: mode === "schedule",
    scheduledAt: post.scheduled_at,
    perPlatform: result.perPlatform,
    warnings: gate.warnings,
  });
}
