import { createAdminClient } from "@/lib/supabase/admin";
import { CONTENT_PILLARS, type PillarKey } from "@/types";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Lern-Schleife: verknüpft Blotato-Engagement (Likes/Kommentare/…) über die
 * public_url zurück mit Säule + Uhrzeit + Plattform jedes Posts und leitet
 * daraus ab, was am besten performt — plus gelernte Säulen-Gewichte für die
 * Content-Engine.
 *
 * Statistik-Leitplanken (Review): Vergleiche laufen INNERHALB einer Plattform
 * (Scores werden am Plattform-Durchschnitt normalisiert, sonst gewinnt immer
 * der größte Kanal), Gewichte erst ab Mindeststichprobe, Anpassung gedeckelt.
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

export type PostMetrics = {
  likes: number;
  comments: number;
  shares: number;
  views: number;
  reach: number;
};

// Engagement-Score: Aktionen zählen, nicht reine Reichweite.
// Likes + 2×Kommentare + 2×Shares.
export function engagementScore(m: Pick<PostMetrics, "likes" | "comments" | "shares">) {
  return m.likes + 2 * m.comments + 2 * m.shares;
}

/** Blotato-API-Key: ENV zuerst, sonst settings-Tabelle (Service-Role). */
async function resolveBlotatoKey(supabase: AdminClient): Promise<string | undefined> {
  if (process.env.BLOTATO_API_KEY) return process.env.BLOTATO_API_KEY;
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "blotato_api_key")
    .maybeSingle();
  return data?.value ?? undefined;
}

/** Blotato published-posts → Map public_url → Metriken. Exportiert für die
 *  täglichen post_metrics-Snapshots im Publish-Cron. */
export async function fetchMetricsByUrl(apiKey: string | undefined): Promise<Map<string, PostMetrics>> {
  const out = new Map<string, PostMetrics>();
  if (!apiKey) return out;
  try {
    const res = await fetch("https://backend.blotato.com/v2/published-posts?limit=100", {
      headers: { "blotato-api-key": apiKey },
      cache: "no-store",
    });
    if (!res.ok) return out;
    const json = (await res.json()) as { items?: Record<string, unknown>[] };
    for (const item of json.items ?? []) {
      const state = item.state as Record<string, unknown> | undefined;
      const url = (item.postUrl ?? state?.postUrl) as string | undefined;
      if (!url) continue;
      const latest = item.latestMetrics as Record<string, unknown> | undefined;
      const m = ((latest?.metrics as Record<string, unknown>) ??
        (item.metrics as Record<string, unknown>) ??
        {}) as Record<string, unknown>;
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

  const apiKey = await resolveBlotatoKey(supabase);
  const metricsByUrl = await fetchMetricsByUrl(apiKey);
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

  // 1. Durchgang: roher Score + Plattform-Durchschnitt (für Normalisierung).
  type Row = { pub: (typeof pubs)[number]; raw: number };
  const rows: Row[] = [];
  const platformTotals = new Map<string, { sum: number; n: number }>();
  for (const pub of pubs) {
    const m = metricsByUrl.get(pub.public_url as string);
    if (!m) continue;
    const raw = engagementScore(m);
    rows.push({ pub, raw });
    const t = platformTotals.get(pub.platform as string) ?? { sum: 0, n: 0 };
    t.sum += raw;
    t.n += 1;
    platformTotals.set(pub.platform as string, t);
  }
  const platformAvg = new Map<string, number>();
  platformTotals.forEach((t, plat) => platformAvg.set(plat, t.n ? t.sum / t.n : 0));

  // 2. Durchgang: Aggregation mit plattform-normalisiertem Score
  //    (1.0 = Plattform-Durchschnitt) — Säulen/Zeiten werden fair verglichen.
  const byPillar = new Map<PillarKey, { sum: number; n: number; rawSum: number }>();
  const byHour = new Map<number, { sum: number; n: number }>();
  let sampleSize = 0;

  for (const { pub, raw } of rows) {
    const pAvg = platformAvg.get(pub.platform as string) ?? 0;
    const norm = pAvg > 0 ? raw / pAvg : raw > 0 ? 1 : 0;
    sampleSize++;

    const pillar = pillarByPost.get(pub.post_id as string);
    if (pillar) {
      const e = byPillar.get(pillar) ?? { sum: 0, n: 0, rawSum: 0 };
      e.sum += norm;
      e.rawSum += raw;
      e.n += 1;
      byPillar.set(pillar, e);
    }
    const hour = hourByPost.get(pub.post_id as string);
    if (hour != null) {
      const e = byHour.get(hour) ?? { sum: 0, n: 0 };
      e.sum += norm;
      e.n += 1;
      byHour.set(hour, e);
    }
  }

  const pillars: PillarInsight[] = CONTENT_PILLARS.map((p) => {
    const e = byPillar.get(p.key);
    return {
      key: p.key,
      label: p.label,
      posts: e?.n ?? 0,
      // Anzeige: roher Durchschnitt (verständlich) — Gewichte nutzen norm.
      avgEngagement: e && e.n ? Math.round((e.rawSum / e.n) * 10) / 10 : 0,
    };
  });

  const bestHour =
    Array.from(byHour.entries())
      .map(([hour, e]) => ({ hour, avg: e.sum / e.n }))
      .sort((a, b) => b.avg - a.avg)[0] ?? null;
  const bestPlatform =
    Array.from(platformTotals.entries())
      .map(([platform, e]) => ({ platform, avg: e.sum / e.n }))
      .sort((a, b) => b.avg - a.avg)[0] ?? null;

  // Gelernte Gewichte: nur bei Mindeststichprobe (≥8 Posts, ≥2 Säulen mit ≥2
  // Posts) — kleine Stichproben erzeugen sonst Zufallssieger.
  const withData = Array.from(byPillar.entries()).filter(([, e]) => e.n >= 2);
  let learnedWeights: Record<PillarKey, number> | null = null;
  if (sampleSize >= 8 && withData.length >= 2) {
    const avgAll = withData.reduce((s, [, e]) => s + e.sum / e.n, 0) / withData.length || 1;
    learnedWeights = {} as Record<PillarKey, number>;
    for (const base of CONTENT_PILLARS) {
      const e = byPillar.get(base.key);
      const rel = e && e.n >= 2 && avgAll > 0 ? e.sum / e.n / avgAll : 1;
      // Gewinner bis ~1.5×, Verlierer bis ~0.5× — aber nie unter 40% (Exploration).
      const factor = Math.max(0.4, Math.min(1.5, 0.5 + 0.5 * rel));
      learnedWeights[base.key] = Math.round(base.weight * factor);
    }
  }

  return {
    pillars: pillars.sort((a, b) => b.avgEngagement - a.avgEngagement),
    bestHour: bestHour ? { hour: bestHour.hour, avg: Math.round(bestHour.avg * 100) / 100 } : null,
    bestPlatform: bestPlatform
      ? { platform: bestPlatform.platform, avg: Math.round(bestPlatform.avg * 10) / 10 }
      : null,
    learnedWeights,
    sampleSize,
  };
}

// ---------------------------------------------------------------------------
// Selbstlernende Auswahl (Juli 2026)
// ---------------------------------------------------------------------------

/**
 * Performance je Content-Dimension → Multiplikatoren für die Generierung.
 * Aus dem Engagement (über Blotato) wird abgeleitet, welche Lane
 * (emotional/produkt) und welches Format (E1–P10) am besten läuft; Gewinner
 * bekommen einen höheren Multiplikator, Verlierer einen niedrigeren — aber
 * gedeckelt, damit die Vielfalt bleibt (Explorations-Grenze).
 */
export type ContentPerformance = {
  laneMult: Record<string, number> | null; // "emotional" | "product" → Faktor; null = zu wenig Daten
  formatMult: Record<string, number> | null; // Format-Code → Faktor
  bestLane: string | null;
  bestFormat: string | null;
  sampleSize: number;
};

const PERF_MIN_SAMPLE = 8; // erst ab so vielen ausgewerteten Posts lenken
const PERF_CAP = 2.0; // Gewinner max. 2× so wahrscheinlich
const PERF_FLOOR = 0.5; // Verlierer nie unter 0,5× → nie ganz aus dem Rennen

export async function computeContentPerformance(): Promise<ContentPerformance> {
  const empty: ContentPerformance = {
    laneMult: null,
    formatMult: null,
    bestLane: null,
    bestFormat: null,
    sampleSize: 0,
  };

  const supabase = createAdminClient();
  const apiKey = await resolveBlotatoKey(supabase);
  const metricsByUrl = await fetchMetricsByUrl(apiKey);
  if (metricsByUrl.size === 0) return empty;

  const { data: pubs } = await supabase
    .from("post_publications")
    .select("post_id, public_url")
    .not("public_url", "is", null);
  if (!pubs?.length) return empty;

  // Engagement je Post (über alle Plattform-Zeilen mit Metrik summiert).
  const scoreByPost = new Map<string, number>();
  for (const p of pubs) {
    const m = metricsByUrl.get(p.public_url as string);
    if (!m) continue;
    const id = p.post_id as string;
    scoreByPost.set(id, (scoreByPost.get(id) ?? 0) + engagementScore(m));
  }
  const postIds = Array.from(scoreByPost.keys());
  if (postIds.length < PERF_MIN_SAMPLE) return { ...empty, sampleSize: postIds.length };

  const { data: briefs } = await supabase
    .from("post_briefs")
    .select("post_id, lane, format_code")
    .in("post_id", postIds);

  const laneAgg = new Map<string, { sum: number; n: number }>();
  const fmtAgg = new Map<string, { sum: number; n: number }>();
  let overallSum = 0;
  let overallN = 0;
  for (const b of briefs ?? []) {
    const s = scoreByPost.get(b.post_id as string);
    if (s === undefined) continue;
    overallSum += s;
    overallN += 1;
    const lane = b.lane as string | null;
    const code = b.format_code as string | null;
    if (lane) {
      const a = laneAgg.get(lane) ?? { sum: 0, n: 0 };
      a.sum += s;
      a.n += 1;
      laneAgg.set(lane, a);
    }
    if (code) {
      const a = fmtAgg.get(code) ?? { sum: 0, n: 0 };
      a.sum += s;
      a.n += 1;
      fmtAgg.set(code, a);
    }
  }
  if (overallN < PERF_MIN_SAMPLE) return { ...empty, sampleSize: overallN };

  const overallAvg = overallSum / overallN || 1;
  const clamp = (x: number) => Math.max(PERF_FLOOR, Math.min(PERF_CAP, x));
  const toMult = (agg: Map<string, { sum: number; n: number }>) => {
    const out: Record<string, number> = {};
    Array.from(agg.entries()).forEach(([k, a]) => {
      out[k] = clamp(a.n ? a.sum / a.n / overallAvg : 1);
    });
    return out;
  };
  const bestOf = (agg: Map<string, { sum: number; n: number }>) =>
    Array.from(agg.entries()).sort((x, y) => y[1].sum / y[1].n - x[1].sum / x[1].n)[0]?.[0] ?? null;

  return {
    laneMult: toMult(laneAgg),
    formatMult: toMult(fmtAgg),
    bestLane: bestOf(laneAgg),
    bestFormat: bestOf(fmtAgg),
    sampleSize: overallN,
  };
}
