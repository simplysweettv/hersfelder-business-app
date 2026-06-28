"use client";

import { useMemo, useState } from "react";
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
  Sparkles,
  ArrowUpRight,
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

type Props = {
  posts: AnalyticsPost[];
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

const PLATFORM_NAME: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
};

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".0", "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(".0", "") + "k";
  return String(n);
}

function PlatformDot({ platform }: { platform: string }) {
  const color = PLATFORM_COLOR[platform] ?? "#666";
  const short = PLATFORM_SHORT[platform] ?? platform.slice(0, 2).toUpperCase();
  return (
    <span
      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[9px] font-bold shrink-0"
      style={{ background: color }}
    >
      {short}
    </span>
  );
}

/** KPI-Karte oben mit Farbakzent */
function KpiCard({
  icon: Icon,
  value,
  label,
  color,
  bgColor,
}: {
  icon: typeof Heart;
  value: number;
  label: string;
  color: string;
  bgColor: string;
}) {
  return (
    <div
      className="rounded-2xl p-3.5 flex flex-col gap-2"
      style={{ background: bgColor }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider opacity-70" style={{ color }}>
          {label}
        </span>
        <div
          className="w-7 h-7 rounded-xl flex items-center justify-center"
          style={{ background: `${color}25` }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color }} />
        </div>
      </div>
      <div className="text-2xl font-bold tabular-nums" style={{ color }}>
        {value.toLocaleString("de-DE")}
      </div>
    </div>
  );
}

function PostCard({ post, rank }: { post: AnalyticsPost; rank: number }) {
  const date = (() => {
    try {
      return format(new Date(post.postTime), "dd. MMM · HH:mm", { locale: de });
    } catch {
      return "—";
    }
  })();

  const { likes, comments, views, reach, shares } = post.metrics;
  const engagement = likes + comments * 2 + shares * 2;

  const inner = (
    <div className="flex gap-3 items-start">
      {/* Bild */}
      <div className="relative shrink-0">
        <div className="w-[80px] h-[80px] rounded-xl overflow-hidden bg-muted relative">
          {post.imageUrl ? (
            <Image src={post.imageUrl} alt="" fill className="object-cover" unoptimized />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-muted-foreground/30" />
            </div>
          )}
        </div>
        {/* Rang-Badge */}
        <div className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-background border text-[10px] font-bold flex items-center justify-center shadow-sm">
          {rank}
        </div>
      </div>

      {/* Inhalt */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5 pt-0.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <PlatformDot platform={post.platform} />
            <span className="text-[11px] text-muted-foreground">{date}</span>
          </div>
          {post.postUrl && (
            <span className="shrink-0 inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
              <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          )}
        </div>

        <p className="text-sm text-foreground line-clamp-2 leading-snug font-medium">
          {post.text || <span className="text-muted-foreground italic font-normal">Kein Text</span>}
        </p>

        {/* Metriken */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {likes > 0 || views > 0 || comments > 0 ? (
            <>
              <span className="inline-flex items-center gap-1 text-xs">
                <Heart className="w-3 h-3 text-rose-500" />
                <span className="font-semibold tabular-nums">{fmt(likes)}</span>
              </span>
              <span className="inline-flex items-center gap-1 text-xs">
                <MessageCircle className="w-3 h-3 text-blue-500" />
                <span className="font-semibold tabular-nums">{fmt(comments)}</span>
              </span>
              <span className="inline-flex items-center gap-1 text-xs">
                <Eye className="w-3 h-3 text-emerald-600" />
                <span className="font-semibold tabular-nums">{fmt(views)}</span>
              </span>
              {reach > 0 && (
                <span className="inline-flex items-center gap-1 text-xs">
                  <Users className="w-3 h-3 text-purple-500" />
                  <span className="font-semibold tabular-nums">{fmt(reach)}</span>
                </span>
              )}
              {shares > 0 && (
                <span className="inline-flex items-center gap-1 text-xs">
                  <Share2 className="w-3 h-3 text-cyan-600" />
                  <span className="font-semibold tabular-nums">{fmt(shares)}</span>
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Noch keine Daten</span>
          )}
          {engagement > 0 && (
            <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              Ø {engagement}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  if (post.postUrl) {
    return (
      <a
        href={post.postUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block p-3 rounded-2xl bg-card border transition-all hover:shadow-md hover:border-border/70 hover:-translate-y-px active:scale-[0.99]"
        title="Post auf der Plattform ansehen"
      >
        {inner}
      </a>
    );
  }

  return (
    <div className="block p-3 rounded-2xl bg-card border">
      {inner}
    </div>
  );
}

function InsightsCard({ insights }: { insights: Insights }) {
  const topPillar = insights.pillars.find((p) => p.posts > 0);
  const learning = insights.learnedWeights != null;

  return (
    <div className="rounded-2xl bg-card border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Brain className="w-4 h-4" style={{ color: "var(--brand-primary)" }} />
        <h2 className="font-semibold text-sm">Lern-Schleife</h2>
        <span
          className={cn(
            "ml-auto text-[10px] font-semibold px-2.5 py-0.5 rounded-full",
            learning
              ? "bg-emerald-100 text-emerald-800"
              : "bg-zinc-100 text-zinc-500",
          )}
        >
          {learning ? "Auto-Optimierung aktiv" : "lernt noch"}
        </span>
      </div>

      {insights.sampleSize === 0 ? (
        <p className="text-sm text-muted-foreground leading-relaxed">
          Sobald deine Posts Likes &amp; Kommentare sammeln, lernt die KI hier,
          welche Inhalte und Uhrzeiten am besten ziehen.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Beste Säule" value={topPillar ? topPillar.label.split(" ")[0] : "—"} icon={Trophy} />
            <MiniStat label="Beste Zeit" value={insights.bestHour ? `${insights.bestHour.hour}:00` : "—"} icon={Clock} />
            <MiniStat
              label="Plattform"
              value={insights.bestPlatform ? PLATFORM_NAME[insights.bestPlatform.platform] ?? insights.bestPlatform.platform : "—"}
              icon={TrendingUp}
            />
          </div>

          <div className="space-y-2 pt-1">
            {insights.pillars.map((p) => {
              const max = Math.max(1, ...insights.pillars.map((x) => x.avgEngagement));
              const pct = Math.round((p.avgEngagement / max) * 100);
              return (
                <div key={p.key} className="flex items-center gap-2">
                  <div className="w-28 text-xs text-muted-foreground truncate">{p.label}</div>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: "var(--brand-primary)" }}
                    />
                  </div>
                  <div className="w-12 text-right text-xs tabular-nums font-medium">
                    {p.avgEngagement}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Basis: {insights.sampleSize} Posts · Ø = Likes + 2×Kommentare + 2×Shares
          </p>
        </>
      )}
    </div>
  );
}

function MiniStat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Heart }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-2.5 text-center">
      <Icon className="w-3.5 h-3.5 mx-auto mb-1 text-muted-foreground" />
      <div className="text-sm font-bold truncate">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

export default function AnalyticsDashboard({ posts, insights }: Props) {
  const [activeTab, setActiveTab] = useState<string>("all");

  const filteredPosts = useMemo(
    () => (activeTab === "all" ? posts : posts.filter((p) => p.platform === activeTab)),
    [posts, activeTab],
  );

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
    <div className="flex-1 bg-background pb-24 md:pb-6">
      {/* Hero-Header */}
      <div
        className="px-4 pt-5 pb-6 md:px-6"
        style={{
          background: "linear-gradient(135deg, var(--brand-primary) 0%, #1a4a2a 100%)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Sparkles className="w-4 h-4 text-white/70" />
              <span className="text-white/70 text-xs font-medium uppercase tracking-wider">Analytics</span>
            </div>
            <h1 className="text-white text-xl font-bold">Performance</h1>
          </div>
          <div className="text-right">
            <div className="text-white/60 text-[11px]">Veröffentlicht</div>
            <div className="text-white text-2xl font-bold">{posts.length}</div>
          </div>
        </div>

        {/* KPI-Grid im Header */}
        <div className="grid grid-cols-2 gap-2">
          <KpiCard icon={Heart} value={totals.likes} label="Likes" color="#ff6b8a" bgColor="rgba(255,255,255,0.12)" />
          <KpiCard icon={Eye} value={totals.views} label="Views" color="#6ee7b7" bgColor="rgba(255,255,255,0.12)" />
          <KpiCard icon={MessageCircle} value={totals.comments} label="Kommentare" color="#93c5fd" bgColor="rgba(255,255,255,0.12)" />
          <KpiCard icon={Users} value={totals.reach} label="Reichweite" color="#c4b5fd" bgColor="rgba(255,255,255,0.12)" />
        </div>
      </div>

      <div className="px-3 md:px-5 space-y-4 mt-4">
        {/* Lern-Schleife */}
        <InsightsCard insights={insights} />

        {/* Plattform-Filter */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {platformsWithPosts.map((p) => {
            const isActive = activeTab === p.key;
            const color = p.key === "all" ? "var(--brand-primary)" : PLATFORM_COLOR[p.key] ?? "#666";
            const count = p.key === "all" ? posts.length : countByPlatform[p.key] ?? 0;
            return (
              <button
                key={p.key}
                onClick={() => setActiveTab(p.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all shrink-0",
                  isActive
                    ? "text-white shadow-sm scale-[1.02]"
                    : "text-muted-foreground bg-muted hover:bg-muted/70 hover:text-foreground",
                )}
                style={isActive ? { background: color } : {}}
              >
                {p.label}
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                    isActive ? "bg-white/25" : "bg-background text-muted-foreground",
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
            <div className="rounded-2xl border bg-card p-10 text-center">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 text-muted-foreground/20" />
              <p className="text-sm font-medium text-muted-foreground">
                {activeTab === "all"
                  ? "Noch keine Posts veröffentlicht"
                  : `Noch keine ${PLATFORMS.find((p) => p.key === activeTab)?.label}-Posts`}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Freigegebene Posts erscheinen hier nach der Veröffentlichung.
              </p>
            </div>
          ) : (
            filteredPosts.map((post, i) => <PostCard key={post.id} post={post} rank={i + 1} />)
          )}
        </div>

        <p className="text-[11px] text-center text-muted-foreground pb-2 px-4">
          Daten von Blotato — direkt nach dem Posten können Likes/Views noch 0 sein.
        </p>
      </div>
    </div>
  );
}
