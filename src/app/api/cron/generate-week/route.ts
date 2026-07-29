import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSettings } from "@/lib/settings";
import { cronAuthorized } from "@/lib/cron-auth";
import { startRun, finishRun } from "@/lib/automation";
import { fillContentBuffer } from "@/lib/content-engine";

export const runtime = "nodejs";
export const maxDuration = 300;
// Cron immer frisch ausführen — nie statisch prerendern.
export const dynamic = "force-dynamic";

/**
 * Autonome Content-Engine (Cron-Eingang).
 *
 * Läuft täglich und hält einen rollenden Puffer geplanter Posts. Die eigentliche
 * Arbeit steckt in `fillContentBuffer` (src/lib/content-engine.ts) — dieselbe
 * Funktion nutzt auch der „Puffer auffüllen"-Knopf in der App.
 */
export async function GET(req: NextRequest) {
  const auth = cronAuthorized(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.reason ?? "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const settings = await loadSettings();
  const apiKey = process.env.OPENAI_API_KEY || settings["openai_api_key"] || undefined;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY missing." }, { status: 400 });
  }

  const runId = await startRun(supabase, "content_generation", "cron");

  try {
    const res = await fillContentBuffer({ supabase, apiKey, settings });

    await finishRun(supabase, runId, {
      planned: res.openSlots,
      succeeded: res.created.length,
      failed: res.openSlots - res.created.length,
      errors: res.errors,
      postIds: res.created,
      meta: { mode: res.mode },
    });

    return NextResponse.json({
      created: res.created.length,
      openSlots: res.openSlots,
      ids: res.created,
      errors: res.errors,
    });
  } catch (e) {
    // Ohne dieses catch blieb der Lauf bei einem Absturz für immer auf
    // "running" — und die Systemampel wertete ihn als unauffällig.
    const msg = e instanceof Error ? e.message : String(e);
    await finishRun(supabase, runId, { planned: 0, succeeded: 0, failed: 1, errors: [msg] });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
