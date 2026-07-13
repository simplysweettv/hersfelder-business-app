import type { createAdminClient } from "@/lib/supabase/admin";
import { fetchMetricsByUrl } from "@/lib/learning";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Tägliche Metrik-Snapshots: friert die aktuellen Engagement-Zahlen jedes
 * veröffentlichten Plattform-Posts als eigene Zeile in post_metrics ein
 * (unique pro Tag). So bleibt die Historie erhalten — auch wenn der Anbieter
 * nur die letzten 100 Einträge liefert oder später gewechselt wird — und
 * 24h/7d/30d-Vergleiche werden möglich.
 */
export async function snapshotMetrics(supabase: AdminClient): Promise<number> {
  const apiKey =
    process.env.BLOTATO_API_KEY ??
    (await supabase.from("settings").select("value").eq("key", "blotato_api_key").maybeSingle())
      .data?.value ??
    undefined;

  const metricsByUrl = await fetchMetricsByUrl(apiKey);
  if (metricsByUrl.size === 0) return 0;

  const { data: pubs } = await supabase
    .from("post_publications")
    .select("post_id, platform, public_url")
    .not("public_url", "is", null);
  if (!pubs?.length) return 0;

  const rows = [];
  for (const pub of pubs) {
    const m = metricsByUrl.get(pub.public_url as string);
    if (!m) continue;
    rows.push({
      post_id: pub.post_id,
      platform: pub.platform,
      likes: m.likes,
      comments: m.comments,
      shares: m.shares,
      views: m.views,
      reach: m.reach,
      public_url: pub.public_url,
    });
  }
  if (!rows.length) return 0;

  // captured_on hat DB-Default current_date → unique(post_id,platform,captured_on):
  // erneuter Lauf am selben Tag aktualisiert die Zahlen statt zu duplizieren.
  const { error } = await supabase
    .from("post_metrics")
    .upsert(rows, { onConflict: "post_id,platform,captured_on" });
  if (error) throw new Error(error.message);
  return rows.length;
}
