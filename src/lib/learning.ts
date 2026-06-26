import type { createAdminClient } from "@/lib/supabase/admin";
import { CONTENT_PILLARS, type PillarKey } from "@/types";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Lern-Schleife: verknüpft Blotato-Engagement (Likes/Kommentare/…) über die
 * public_url zurück mit Säule + Uhrzeit + Plattform jedes Posts und leitet
 * daraus ab, was am besten performt — plus gelernte Säulen-Gewichte für die
 * Content-Engine.
 */

export type PillarInsight = {
  key: PillarKey;
  label: string;
  posts: number;
  avgEngagement: number;
};

export type Insights = {
  pillars: PillarInsight[];
  bestHour: { hour: number; avg: number } | null;
  bestPlatform: { platform: string; avg: number } | null;
  learnedWeights: Record<PillarKey, number> | null; // null = zu wenig Daten
  sampleSize: number;
};

function num(v: unknown): number {
  const n = parseInt(String(v ?? 0), 10);
  return Number.isNaN(n) ? 0 : n;
}

// Engagement-Score: Aktionen zählen, nicht reine Reichweite (sonst Plattform-
// Verzerrung). Likes + 2×Kommentare + 2×Shares.
function engagementScore(m: { likes: number; comments: number; shares: number }) {
  return m.likes + 2 * m.comments + 2 * m.shares;
}

/** Blotato published-posts → Map public_url → Engagement. */
async function fetchMetricsByUrl(): Promise<
  Map<string, { likes: number; comments: number; shares: number; views: number; reach: number }>
> {
  const out = new Map<
    string,
    { likes: number; comments: number; shares: number; views: number; reach: number }
  >();
  const key = process.env.BLOTATO_API_KEY;
  if (!key) return out;
  try {
    const res = await fetch("https://backend.blotato.com/v2/published-posts?limit=100", {
      headers: { "blotato-api-key": key },
      cache: "no-store",
    });
    if (!res.ok) return out;
    const json = (await res.json()) as { items?: Record<string, any>[] };
    for (const item of json.items ?? []) {
      const url: string | undefined = item.postUrl ?? item.state?.postUrl;
      if (!url) continue;
      const m: Record<string, any> = item.latestMetrics?.metrics ?? item.metrics ?? {};
      out.set(url, {
        likes: num(m.likesCount ?? m.likes_count),
        comments: num(m.commentsCount ?? m.comments_count ?? m.repliesCount),
        shares: num(m.sharesCount ?? m.shares_count),
        views: num(m.viewsCount ?? m.views_count ?? m.playsCount),
        reach: num(m.reachCount ?? m.reach_count ?? m.impressionsCount),
      });
    }
  } catch {
    /* leer zurück */
  }
  return out;
}

export async function computeInsights(supabase: AdminClient): Promise<Insights> {
  const empty: Insights = {
    pillars: CONTENT_PILLARS.map((p) => ({ key: p.key, label: p.label, posts: 0, avgEngagement: 0 })),
    bestHour: null,
    bestPlatform: null,
    learnedWeights: null,
    sampleSize: 0,
  };

  const metricsByUrl = await fetchMetricsByUrl();
  if (metricsByUrl.size === 0) return empty;

  // Veröffentlichte Plattform-Posts mit public_url.
  const { data: pubs } = await supabase
    .from("post_publications")
    .select("post_id, platform, public_url")
    .not("public_url", "is", null);
  if (!pubs?.length) return empty;

  const postIds = Array.from(new Set(pubs.map((p) => p.post_id as string)));
  const [{ data: posts }, { data: briefs }] = await Promise.all([
    supabase.from("posts").select("id, scheduled_at").in("id", postIds),
    supabase.from("post_briefs").select("post_id, pillar").in("post_id", postIds),
  ]);
  const hourByPost = new Map<string, number>();
  for (const p of posts ?? []) {
    if (!p.scheduled_at) continue;
    // Stunde in deutscher Zeit
    const h = new Date(
      new Date(p.scheduled_at as string).toLocaleString("en-US", { timeZone: "Europe/Berlin" }),
    ).getHours();
    hourByPost.set(p.id as string, h);
  }
  const pillarByPost = new Map<string, PillarKey>();
  for (const b of briefs ?? []) {
    if (b.pillar) pillarByPost.set(b.post_id as string, b.pillar as PillarKey);
  }

  // Aggregation.
  const byPillar = new Map<PillarKey, { sum: number; n: number }>();
  const byHour = new Map<number, { sum: number; n: number }>();
  const byPlatform = new Map<string, { sum: number; n: number }>();
  let sampleSize = 0;

  for (const pub of pubs) {
    const url = pub.public_url as string;
    const m = metricsByUrl.get(url);
    if (!m) continue;
    const score = engagementScore(m);
    sampleSize++;

    const pillar = pillarByPost.get(pub.post_id as string);
    if (pillar) {
      const e = byPillar.get(pillar) ?? { sum: 0, n: 0 };
      e.sum += score;
      e.n += 1;
      byPillar.set(pillar, e);
    }
    const hour = hourByPost.get(pub.post_id as string);
    if (hour != null) {
      const e = byHour.get(hour) ?? { sum: 0, n: 0 };
      e.sum += score;
      e.n += 1;
      byHour.set(hour, e);
    }
    const plat = pub.platform as string;
    const e = byPlatform.get(plat) ?? { sum: 0, n: 0 };
    e.sum += score;
    e.n += 1;
    byPlatform.set(plat, e);
  }

  const pillars: PillarInsight[] = CONTENT_PILLARS.map((p) => {
    const e = byPillar.get(p.key);
    return {
      key: p.key,
      label: p.label,
      posts: e?.n ?? 0,
      avgEngagement: e && e.n ? Math.round((e.sum / e.n) * 10) / 10 : 0,
    };
  });

  const bestHour =
    Array.from(byHour.entries())
      .map(([hour, e]) => ({ hour, avg: e.sum / e.n }))
      .sort((a, b) => b.avg - a.avg)[0] ?? null;
  const bestPlatform =
    Array.from(byPlatform.entries())
      .map(([platform, e]) => ({ platform, avg: e.sum / e.n }))
      .sort((a, b) => b.avg - a.avg)[0] ?? null;

  // Gelernte Gewichte: nur wenn genug Daten (≥8 Posts, ≥2 Säulen mit ≥2 Posts).
  const pillarsWithData = pillars.filter((p) => p.posts >= 2);
  let learnedWeights: Record<PillarKey, number> | null = null;
  if (sampleSize >= 8 && pillarsWithData.length >= 2) {
    const avgAll =
      pillarsWithData.reduce((s, p) => s + p.avgEngagement, 0) / pillarsWithData.length || 1;
    learnedWeights = {} as Record<PillarKey, number>;
    for (const base of CONTENT_PILLARS) {
      const insight = pillars.find((p) => p.key === base.key)!;
      // Performt diese Säule besser/schlechter als der Schnitt?
      const rel = insight.posts >= 2 && avgAll > 0 ? insight.avgEngagement / avgAll : 1;
      // Gewinner bis ~1.5×, Verlierer bis ~0.5× — aber nie unter 40% (Exploration).
      const factor = Math.max(0.4, Math.min(1.5, 0.5 + 0.5 * rel));
      learnedWeights[base.key] = Math.round(base.weight * factor);
    }
  }

  return {
    pillars: pillars.sort((a, b) => b.avgEngagement - a.avgEngagement),
    bestHour: bestHour ? { hour: bestHour.hour, avg: Math.round(bestHour.avg * 10) / 10 } : null,
    bestPlatform: bestPlatform
      ? { platform: bestPlatform.platform, avg: Math.round(bestPlatform.avg * 10) / 10 }
      : null,
    learnedWeights,
    sampleSize,
  };
}
