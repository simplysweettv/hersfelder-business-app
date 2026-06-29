import { createAdminClient } from "@/lib/supabase/admin";
import { summarizeCosts, type UsageRow } from "@/lib/ai-cost";
import KostenDashboard from "./KostenDashboard";

export const dynamic = "force-dynamic";

export default async function KostenPage() {
  const supabase = createAdminClient();
  const sinceIso = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: usageRows }, { data: settingsRows }] = await Promise.all([
    supabase
      .from("ai_usage")
      .select("created_at, operation, cost_usd, image_count, estimated")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false }),
    supabase
      .from("settings")
      .select("key, value")
      .in("key", ["blotato_monthly_eur", "usd_eur_rate"]),
  ]);

  const settings: Record<string, string> = {};
  for (const r of settingsRows ?? []) settings[r.key] = r.value ?? "";

  const rate = parseFloat((settings["usd_eur_rate"] || "").replace(",", ".")) || 0.92;
  const blotatoEur = parseFloat((settings["blotato_monthly_eur"] || "").replace(",", ".")) || 0;

  const summary = summarizeCosts((usageRows ?? []) as UsageRow[], Date.now());

  return <KostenDashboard summary={summary} rate={rate} blotatoEur={blotatoEur} />;
}
