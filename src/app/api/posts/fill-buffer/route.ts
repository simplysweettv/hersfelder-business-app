import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSettings } from "@/lib/settings";
import { startRun, finishRun } from "@/lib/automation";
import { fillContentBuffer } from "@/lib/content-engine";

export const runtime = "nodejs";
// Bis zu 3 Posts à Bild + zwei Vision-Prüfungen — das braucht Zeit.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * „Puffer auffüllen" aus der App heraus — dieselbe Content-Engine wie der Cron,
 * nur von einem angemeldeten Nutzer ausgelöst statt vom Zeitplan.
 *
 * Warum es das gibt: Der Cron ist fail-closed über ein verschlüsseltes Secret
 * abgesichert (richtig so), aber dadurch gab es KEINEN Weg, den Puffer von Hand
 * nachzufüllen — etwa nachdem alte Posts verworfen wurden. Man musste bis zum
 * nächsten Morgen warten.
 *
 * Erzeugte Posts landen als „pending". Veröffentlicht wird nichts ohne Freigabe.
 */
export async function POST(req: NextRequest) {
  // Anmeldung mit dem RLS-Client prüfen, gearbeitet wird danach — wie im Cron —
  // mit dem Admin-Client: Storage-Upload und automation_runs liegen hinter RLS.
  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const settings = await loadSettings();
  const apiKey = process.env.OPENAI_API_KEY || settings["openai_api_key"] || undefined;
  if (!apiKey) {
    return NextResponse.json({ error: "Kein OpenAI-Schlüssel hinterlegt." }, { status: 400 });
  }

  let count = 3;
  try {
    const body = (await req.json()) as { count?: number };
    if (typeof body.count === "number") count = body.count;
  } catch {
    // ohne Body: Standard
  }

  const runId = await startRun(supabase, "content_generation", "manual");

  try {
    const res = await fillContentBuffer({ supabase, apiKey, settings, maxPosts: count });

    await finishRun(supabase, runId, {
      planned: res.openSlots,
      succeeded: res.created.length,
      failed: res.openSlots - res.created.length,
      errors: res.errors,
      postIds: res.created,
      meta: { mode: res.mode, trigger: "manual" },
    });

    return NextResponse.json({
      created: res.created.length,
      openSlots: res.openSlots,
      ids: res.created,
      errors: res.errors,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finishRun(supabase, runId, { planned: 0, succeeded: 0, failed: 1, errors: [msg] });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
