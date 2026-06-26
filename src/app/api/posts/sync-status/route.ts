import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPublishConfig, syncPostStatus } from "@/lib/publishers/publish";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Fragt den echten Veröffentlichungs-Status offener Einreichungen bei Blotato
 * ab und aktualisiert die DB. Wird vom "Status aktualisieren"-Button und vom
 * Publish-Cron genutzt. Postet nichts — reine Abfrage.
 */
export async function POST(_req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const getConfig = await loadPublishConfig(admin);

  // Kandidaten: Einreichungen mit Submission-ID, noch nicht als live bestätigt
  // und nicht endgültig fehlgeschlagen.
  const { data: open } = await admin
    .from("post_publications")
    .select("post_id")
    .not("external_id", "is", null)
    .is("public_url", null)
    .not("status", "in", "(failed,skipped)");

  const postIds = Array.from(new Set((open ?? []).map((r) => r.post_id as string)));

  const results = [];
  for (const id of postIds) {
    const r = await syncPostStatus(admin, id, getConfig);
    results.push({ id, ...r });
  }

  return NextResponse.json({ checked: postIds.length, results });
}
