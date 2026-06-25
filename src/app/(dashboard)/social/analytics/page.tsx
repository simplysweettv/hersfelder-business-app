import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { BarChart3, CheckCircle2, XCircle, Clock } from "lucide-react";
import Image from "next/image";
import { format } from "date-fns";
import { de } from "date-fns/locale";

export const dynamic = "force-dynamic";

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
};

const PLATFORM_COLOR: Record<string, string> = {
  instagram: "#E1306C",
  facebook: "#1877F2",
  tiktok: "#000000",
  linkedin: "#0077B5",
};

const STATUS_ICON = {
  success: <CheckCircle2 className="w-4 h-4 text-green-500" />,
  failed: <XCircle className="w-4 h-4 text-red-500" />,
  skipped: <Clock className="w-4 h-4 text-gray-400" />,
  pending: <Clock className="w-4 h-4 text-yellow-500" />,
};

async function getBlotatoAnalytics() {
  const key = process.env.BLOTATO_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://backend.blotato.com/v2/analytics", {
      headers: { "blotato-api-key": key },
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json?.items ?? []) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

export default async function AnalyticsPage() {
  const supabase = createAdminClient();

  const { data: publications } = await supabase
    .from("post_publications")
    .select("post_id, platform, status, published_at, external_id, error")
    .order("published_at", { ascending: false });

  const { data: publishedPosts } = await supabase
    .from("posts")
    .select("id, title, image_url, scheduled_at, platforms")
    .eq("status", "published")
    .order("scheduled_at", { ascending: false })
    .limit(20);

  const pubMap = new Map<string, Map<string, { status: string; external_id?: string; error?: string }>>();
  for (const p of publications ?? []) {
    if (!pubMap.has(p.post_id)) pubMap.set(p.post_id, new Map());
    pubMap.get(p.post_id)!.set(p.platform, { status: p.status, external_id: p.external_id, error: p.error });
  }

  const blotatoData = await getBlotatoAnalytics();

  const totalPublished = publishedPosts?.length ?? 0;
  const platformCounts: Record<string, number> = {};
  for (const p of publications ?? []) {
    if (p.status === "success") {
      platformCounts[p.platform] = (platformCounts[p.platform] ?? 0) + 1;
    }
  }

  return (
    <div className="flex-1 p-3 md:p-5 bg-background space-y-4 md:space-y-6">
      {/* Header */}
      <Card className="p-3 md:p-4 flex items-center gap-3 md:gap-4">
        <div
          className="w-10 h-10 md:w-11 md:h-11 rounded-lg flex items-center justify-center text-white shrink-0"
          style={{ background: "var(--brand-primary)" }}
        >
          <BarChart3 className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-semibold text-base">Social Media Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Veröffentlichte Posts und Performance-Überblick
          </p>
        </div>
      </Card>

      {/* Stats-Kacheln */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 text-center">
          <div className="text-3xl font-bold" style={{ color: "var(--brand-primary)" }}>
            {totalPublished}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Veröffentlicht</div>
        </Card>
        {["instagram", "facebook", "tiktok"].map((p) => (
          <Card key={p} className="p-4 text-center">
            <div className="text-3xl font-bold" style={{ color: PLATFORM_COLOR[p] }}>
              {platformCounts[p] ?? 0}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{PLATFORM_LABEL[p]}</div>
          </Card>
        ))}
      </div>

      {/* Blotato Live-Analytics */}
      {blotatoData.length > 0 && (
        <Card className="p-4">
          <h2 className="font-semibold text-sm mb-3">Live-Daten von Blotato</h2>
          <div className="space-y-2">
            {blotatoData.map((item, i) => (
              <div key={i} className="text-sm text-muted-foreground border rounded p-3">
                <pre className="text-xs overflow-auto">{JSON.stringify(item, null, 2)}</pre>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Post-Liste */}
      <Card className="p-4">
        <h2 className="font-semibold text-sm mb-4">
          {totalPublished > 0 ? "Veröffentlichte Posts" : "Noch keine veröffentlichten Posts"}
        </h2>

        {totalPublished === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">Analytics füllen sich nach dem ersten Post</p>
            <p className="text-xs mt-1">
              Gib einen Post im Bereich <strong>Freigaben</strong> frei — er wird dann
              automatisch veröffentlicht und hier angezeigt.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {(publishedPosts ?? []).map((post) => {
              const platforms = pubMap.get(post.id);
              return (
                <div
                  key={post.id}
                  className="flex gap-3 p-3 rounded-lg border bg-muted/30"
                >
                  {post.image_url && (
                    <div className="relative w-14 h-14 shrink-0 rounded-md overflow-hidden">
                      <Image
                        src={post.image_url}
                        alt={post.title ?? ""}
                        fill
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{post.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(post.scheduled_at), "dd. MMMM yyyy · HH:mm", {
                        locale: de,
                      })}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {(post.platforms as string[]).map((platform) => {
                        const pub = platforms?.get(platform);
                        const statusKey = (pub?.status ?? "pending") as keyof typeof STATUS_ICON;
                        return (
                          <span
                            key={platform}
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border"
                          >
                            {STATUS_ICON[statusKey]}
                            <span style={{ color: PLATFORM_COLOR[platform] }}>
                              {PLATFORM_LABEL[platform]}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {blotatoData.length === 0 && totalPublished > 0 && (
        <p className="text-xs text-center text-muted-foreground pb-2">
          Blotato Engagement-Daten (Likes, Kommentare, Reichweite) erscheinen hier, sobald
          die Plattformen sie zurückmelden — in der Regel 24–48 h nach Veröffentlichung.
        </p>
      )}
    </div>
  );
}
