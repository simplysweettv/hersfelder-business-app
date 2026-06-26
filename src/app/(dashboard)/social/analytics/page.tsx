import { createAdminClient } from "@/lib/supabase/admin";
import AnalyticsDashboard, { type AnalyticsPost } from "./AnalyticsDashboard";

export const dynamic = "force-dynamic";

function num(v: unknown): number {
  const n = parseInt(String(v ?? 0), 10);
  return Number.isNaN(n) ? 0 : n;
}

// Blotato-Items (published-posts) in unser schlankes Format überführen.
// Defensiv: Feldnamen variieren je nach API-Version (camelCase/snake_case).
function normalize(item: Record<string, any>): AnalyticsPost {
  const m: Record<string, any> =
    item.latestMetrics?.metrics ?? item.metrics ?? {};
  const state = item.state ?? {};
  return {
    id: String(item.id ?? item.postSubmissionId ?? Math.random()),
    platform: String(item.platform ?? ""),
    text: String(item.content ?? item.text ?? ""),
    postUrl: item.postUrl ?? state.postUrl ?? null,
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
      const json = (await res.json()) as { items?: Record<string, any>[] };
      const items = json.items ?? [];
      if (items[0]) {
        console.log("[analytics] sample item=", JSON.stringify(items[0]).slice(0, 1200));
      }
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
    const json = (await res.json()) as { items?: Record<string, any>[] };
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

  const [posts, { data: scheduledPosts }] = await Promise.all([
    fetchAnalytics(),
    supabase
      .from("posts")
      .select("id, title, image_url, scheduled_at, platforms")
      .in("status", ["scheduled", "approved"])
      .order("scheduled_at", { ascending: true }),
  ]);

  return (
    <AnalyticsDashboard posts={posts} scheduledPosts={scheduledPosts ?? []} />
  );
}
