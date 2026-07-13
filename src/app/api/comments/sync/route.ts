import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncMetaComments } from "@/lib/comments-sync";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Kommentar-Sync für eingeloggte Nutzer (UI-Button "Aktualisieren").
 * Nutzt DIESELBE Sync-Funktion wie der abgesicherte Vercel-Cron — so bleibt
 * /api/cron/fetch-comments mit CRON_SECRET geschützt, ohne dass der manuelle
 * Abgleich bricht.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await syncMetaComments();
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
