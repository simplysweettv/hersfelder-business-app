import { createAdminClient } from "@/lib/supabase/admin";
import { computeInsights } from "@/lib/learning";
import AnalyticsDashboard, { type AnalyticsPost } from "./AnalyticsDashboard";

export const dynamic = "force-dynamic";

function num(v: unknown): number {
  const n = parseInt(String(v ?? 0), 10);
  return Number.isNaN(n) ? 0 : n;
}

// Blotato-Items (published-posts) in unser schlankes Format überführen.
// Defensiv: Feldnamen variieren je nach API-Version (camelCase/snake_case).
function normalize(item: Record<string, unknown>): AnalyticsPost {
  const raw = item.latestMetrics as Record<string, unknown> | undefined;
  const rawMetrics = item.metrics as Record<string, unknown> | undefined;
  const m: Record<string, unknown> = (raw?.metrics as Record<string, unknown>) ?? rawMetrics ?? {};
  const state = (item.state ?? {}) as Record<string, unknown>;
  return {
    id: String(item.id ?? item.postSubmissionId ?? Math.random()),
    platform: String(item.platform ?? ""),
    text: String(item.content ?? item.text ?? ""),
    postUrl: (item.postUrl ?? state.postUrl ?? null) as string | null,
    postTime: String(item.createdAt ?? item.postTime ?? ""),
    imageUrl: Array.isArray(item.mediaUrls) ? item.mediaUrls[0] ?? null : null,
    metrics: {
      likes: num(m.likesCount ?? m.likes_count),
      comments: num(m.commentsCount ?? m.comments_count ?? m.repliesCount),
      views: num(m.viewsCount ?? m.views_count ?? m.playsCount ?? m.plays_count),
      reach: num(m.reachCount ?? m.reach_count ?? m.impressionsCount ?? m.impressions_count),
      shares: num(m.sharesCount ?? m.shares_count),
    },
  };
}

async function fetchAnalytics(): Promise<AnalyticsPost[]> {
  const key = process.env.BLOTATO_API_KEY;
  if (!key) return [];
  const headers = { "blotato-api-key": key };

  // 1) Bevorzugt: published-posts MIT Engagement-Metriken.
  try {
    const res = await fetch(
      "https://backend.blotato.com/v2/published-posts?limit=100",
      { headers, next: { revalidate: 60 } },
    );
    if (res.ok) {
      const json = (await res.json()) as { items?: Record<string, unknown>[] };
      const items = json.items ?? [];
      if (items.length) {
        return items
          .map(normalize)
          .sort(
            (a, b) =>
              new Date(b.postTime).getTime() - new Date(a.postTime).getTime(),
          );
      }
    }
  } catch {
    // fällt unten auf /posts zurück
  }

  // 2) Fallback: /posts (ohne Metriken) — wenigstens die Liste anzeigen.
  try {
    const res = await fetch("https://backend.blotato.com/v2/posts?limit=100", {
      headers,
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { items?: Record<string, unknown>[] };
    return (json.items ?? [])
      .map(normalize)
      .sort(
        (a, b) =>
          new Date(b.postTime).getTime() - new Date(a.postTime).getTime(),
      );
  } catch {
    return [];
  }
}

export default async function AnalyticsPage() {
  const supabase = createAdminClient();

  const [posts, { data: scheduledPosts }, insights] = await Promise.all([
    fetchAnalytics(),
    supabase
      .from("posts")
      .select("id, title, image_url, scheduled_at, platforms")
      .in("status", ["scheduled", "approved"])
      .order("scheduled_at", { ascending: true }),
    computeInsights(supabase),
  ]);

  return (
    <AnalyticsDashboard
      posts={posts}
      scheduledPosts={scheduledPosts ?? []}
      insights={insights}
    />
  );
}
