"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import Image from "next/image";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  ExternalLink,
  Clock,
  BarChart3,
  TrendingUp,
  Heart,
  MessageCircle,
  Eye,
  Users,
  Share2,
  Brain,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Insights } from "@/lib/learning";

export type AnalyticsPost = {
  id: string;
  platform: string;
  text: string;
  postUrl: string | null;
  postTime: string;
  imageUrl: string | null;
  metrics: {
    likes: number;
    comments: number;
    views: number;
    reach: number;
    shares: number;
  };
};

export type ScheduledPost = {
  id: string;
  title: string;
  image_url: string | null;
  scheduled_at: string;
  platforms: string[];
};

type Props = {
  posts: AnalyticsPost[];
  scheduledPosts: ScheduledPost[];
  insights: Insights;
};

const PLATFORMS = [
  { key: "all", label: "Alle" },
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "facebook", label: "Facebook" },
  { key: "linkedin", label: "LinkedIn" },
] as const;

const PLATFORM_COLOR: Record<string, string> = {
  instagram: "#E1306C",
  facebook: "#1877F2",
  tiktok: "#161722",
  linkedin: "#0077B5",
};

const PLATFORM_SHORT: Record<string, string> = {
  instagram: "IG",
  tiktok: "TK",
  facebook: "FB",
  linkedin: "LI",
};

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".0", "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(".0", "") + "k";
  return String(n);
}

function PlatformBadge({ platform }: { platform: string }) {
  const color = PLATFORM_COLOR[platform] ?? "#666";
  const short = PLATFORM_SHORT[platform] ?? platform.slice(0, 2).toUpperCase();
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ color, background: `${color}12`, border: `1px solid ${color}30` }}
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      {short}
    </span>
  );
}

function Metric({
  icon: Icon,
  value,
  label,
  color,
}: {
  icon: typeof Heart;
  value: number;
  label: string;
  color?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
      title={`${value.toLocaleString("de-DE")} ${label}`}
    >
      <Icon className="w-3.5 h-3.5" style={color ? { color } : undefined} />
      <span className="font-medium text-foreground tabular-nums">{fmt(value)}</span>
    </span>
  );
}

/** Große KPI-Karte oben (Gesamtsumme einer Kennzahl). */
function KpiCard({
  icon: Icon,
  value,
  label,
  color,
}: {
  icon: typeof Heart;
  value: number;
  label: string;
  color: string;
}) {
  return (
    <Card className="p-3 md:p-4">
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${color}15` }}
        >
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
      </div>
      <div className="text-2xl md:text-3xl font-bold tabular-nums mt-1.5">
        {value.toLocaleString("de-DE")}
      </div>
    </Card>
  );
}

function PostCard({ post }: { post: AnalyticsPost }) {
  const date = (() => {
    try {
      return format(new Date(post.postTime), "dd. MMM yyyy · HH:mm", { locale: de });
    } catch {
      return "—";
    }
  })();

  const { likes, comments, views, reach, shares } = post.metrics;

  return (
    <div className="flex gap-3 p-3 rounded-xl border bg-card transition-shadow hover:shadow-sm">
      <div className="shrink-0 w-[72px] h-[72px] rounded-lg overflow-hidden bg-muted relative">
        {post.imageUrl ? (
          <Image src={post.imageUrl} alt="" fill className="object-cover" unoptimized />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-muted-foreground/30" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <PlatformBadge platform={post.platform} />
          {post.postUrl && (
            <a
              href={post.postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              <span className="hidden sm:inline">Ansehen</span>
            </a>
          )}
        </div>

        <p className="text-sm text-foreground line-clamp-2 leading-snug">
          {post.text || <span className="text-muted-foreground italic">Kein Text</span>}
        </p>

        {/* Engagement-Zeile */}
        <div className="flex items-center gap-3 flex-wrap mt-0.5">
          <Metric icon={Heart} value={likes} label="Likes" color="#E1306C" />
          <Metric icon={MessageCircle} value={comments} label="Kommentare" color="#1877F2" />
          <Metric icon={Eye} value={views} label="Views" color="#16a34a" />
          <Metric icon={Users} value={reach} label="Reichweite" color="#9333ea" />
          {shares > 0 && <Metric icon={Share2} value={shares} label="Shares" color="#0891b2" />}
        </div>

        <div className="text-[11px] text-muted-foreground">{date}</div>
      </div>
    </div>
  );
}

const PLATFORM_NAME: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
};

function InsightsCard({ insights }: { insights: Insights }) {
  const topPillar = insights.pillars.find((p) => p.posts > 0);
  const learning = insights.learnedWeights != null;
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Brain className="w-4 h-4" style={{ color: "var(--brand-primary)" }} />
        <h2 className="font-semibold text-sm">Lern-Schleife</h2>
        <span
          className={cn(
            "ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full",
            learning ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-600",
          )}
        >
          {learning ? "Auto-Optimierung aktiv" : "lernt noch"}
        </span>
      </div>

      {insights.sampleSize === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sobald deine Posts Likes &amp; Kommentare sammeln, lernt die Maschine hier,
          welche Säule und Uhrzeit am besten ziehen — und generiert automatisch mehr
          davon.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <MiniStat
              label="Beste Säule"
              value={topPillar ? topPillar.label.split(" ")[0] : "—"}
              icon={Trophy}
            />
            <MiniStat
              label="Beste Zeit"
              value={insights.bestHour ? `${insights.bestHour.hour}:00` : "—"}
              icon={Clock}
            />
            <MiniStat
              label="Beste Plattform"
              value={
                insights.bestPlatform
                  ? PLATFORM_NAME[insights.bestPlatform.platform] ?? insights.bestPlatform.platform
                  : "—"
              }
              icon={TrendingUp}
            />
          </div>

          {/* Engagement pro Säule */}
          <div className="space-y-1.5 pt-1">
            {insights.pillars.map((p) => {
              const max = Math.max(1, ...insights.pillars.map((x) => x.avgEngagement));
              const pct = Math.round((p.avgEngagement / max) * 100);
              return (
                <div key={p.key} className="flex items-center gap-2">
                  <div className="w-32 text-xs text-muted-foreground truncate">{p.label}</div>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: "var(--brand-primary)" }}
                    />
                  </div>
                  <div className="w-16 text-right text-xs tabular-nums">
                    {p.avgEngagement} <span className="text-muted-foreground">Ø</span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Ø = durchschnittliches Engagement (Likes + 2×Kommentare + 2×Shares) je Post ·
            Basis: {insights.sampleSize} veröffentlichte Plattform-Posts
          </p>
        </>
      )}
    </Card>
  );
}

function MiniStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Heart;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-2.5 text-center">
      <Icon className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
      <div className="text-sm font-semibold truncate">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

export default function AnalyticsDashboard({ posts, scheduledPosts, insights }: Props) {
  const [activeTab, setActiveTab] = useState<string>("all");

  const filteredPosts = useMemo(
    () => (activeTab === "all" ? posts : posts.filter((p) => p.platform === activeTab)),
    [posts, activeTab],
  );

  // Summen über die aktuelle Auswahl.
  const totals = useMemo(() => {
    return filteredPosts.reduce(
      (acc, p) => {
        acc.likes += p.metrics.likes;
        acc.comments += p.metrics.comments;
        acc.views += p.metrics.views;
        acc.reach += p.metrics.reach;
        return acc;
      },
      { likes: 0, comments: 0, views: 0, reach: 0 },
    );
  }, [filteredPosts]);

  const countByPlatform = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of posts) c[p.platform] = (c[p.platform] ?? 0) + 1;
    return c;
  }, [posts]);

  const platformsWithPosts = PLATFORMS.filter(
    (p) => p.key === "all" || posts.some((post) => post.platform === p.key),
  );

  return (
    <div className="flex-1 p-3 md:p-5 bg-background space-y-4">
      {/* Header */}
      <Card className="p-3 md:p-4 flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0"
          style={{ background: "var(--brand-primary)" }}
        >
          <TrendingUp className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-semibold text-base">Social Media Analytics</h1>
          <p className="text-sm text-muted-foreground">
            {posts.length} veröffentlichte Posts
            {activeTab !== "all" &&
              ` · gefiltert: ${PLATFORMS.find((p) => p.key === activeTab)?.label}`}
          </p>
        </div>
      </Card>

      {/* KPI-Karten — Gesamt-Engagement */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
        <KpiCard icon={Heart} value={totals.likes} label="Likes" color="#E1306C" />
        <KpiCard icon={Eye} value={totals.views} label="Views" color="#16a34a" />
        <KpiCard icon={MessageCircle} value={totals.comments} label="Kommentare" color="#1877F2" />
        <KpiCard icon={Users} value={totals.reach} label="Reichweite" color="#9333ea" />
      </div>

      {/* Lern-Schleife */}
      <InsightsCard insights={insights} />

      {/* Plattform-Filter */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {platformsWithPosts.map((p) => {
          const isActive = activeTab === p.key;
          const color = p.key === "all" ? "var(--brand-primary)" : PLATFORM_COLOR[p.key] ?? "#666";
          const count = p.key === "all" ? posts.length : countByPlatform[p.key] ?? 0;
          return (
            <button
              key={p.key}
              onClick={() => setActiveTab(p.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors shrink-0",
                isActive
                  ? "text-white"
                  : "text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80",
              )}
              style={isActive ? { background: color } : {}}
            >
              {p.label}
              <span
                className={cn(
                  "text-[11px] px-1.5 py-0.5 rounded-full",
                  isActive ? "bg-white/20" : "bg-muted-foreground/20",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Post-Liste */}
      <div className="space-y-2">
        {filteredPosts.length === 0 ? (
          <Card className="p-8 text-center">
            <BarChart3 className="w-10 h-10 mx-auto mb-3 text-muted-foreground/20" />
            <p className="text-sm font-medium text-muted-foreground">
              {activeTab === "all"
                ? "Noch keine Posts veröffentlicht"
                : `Noch keine ${PLATFORMS.find((p) => p.key === activeTab)?.label}-Posts`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Freigegebene Posts erscheinen hier nach der Veröffentlichung.
            </p>
          </Card>
        ) : (
          filteredPosts.map((post) => <PostCard key={post.id} post={post} />)
        )}
      </div>

      {/* Geplante Posts */}
      {scheduledPosts.length > 0 && (
        <Card className="p-4">
          <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Geplante Posts ({scheduledPosts.length})
          </h2>
          <div className="space-y-2">
            {scheduledPosts.map((post) => {
              const date = (() => {
                try {
                  return format(new Date(post.scheduled_at), "dd. MMM yyyy · HH:mm", {
                    locale: de,
                  });
                } catch {
                  return "—";
                }
              })();
              return (
                <div
                  key={post.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40"
                >
                  {post.image_url && (
                    <div className="relative w-10 h-10 shrink-0 rounded-md overflow-hidden">
                      <Image src={post.image_url} alt="" fill className="object-cover" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{post.title}</div>
                    <div className="text-[11px] text-muted-foreground">{date}</div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {post.platforms.map((p) => (
                      <span
                        key={p}
                        className="w-5 h-5 rounded-full text-white text-[9px] font-bold flex items-center justify-center"
                        style={{ background: PLATFORM_COLOR[p] ?? "#999" }}
                        title={p}
                      >
                        {PLATFORM_SHORT[p] ?? p[0].toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <p className="text-[11px] text-center text-muted-foreground pb-2 px-4">
        Engagement-Daten kommen von Blotato und werden nach der Veröffentlichung in
        Schnappschüssen aktualisiert — direkt nach dem Posten können Likes/Views noch 0 sein.
      </p>
    </div>
  );
}
