import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeInsights } from "@/lib/learning";
import { formatDateTime } from "@/lib/date-utils";
import { Card } from "@/components/ui/card";
import {
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Clock,
  Heart,
  Brain,
  ShieldCheck,
  AlertTriangle,
  CalendarClock,
} from "lucide-react";
import {
  PLATFORM_COLOR,
  PLATFORM_SHORT,
  type Platform,
  type PostStatus,
} from "@/types";

export const dynamic = "force-dynamic";

type UpcomingPost = {
  id: string;
  title: string;
  image_url: string | null;
  scheduled_at: string | null;
  platforms: Platform[];
  quality_score: number | null;
  status: PostStatus;
};

export default async function DashboardPage() {
  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();

  const [
    { count: pending },
    { count: scheduled },
    { count: published },
    { data: upcomingRaw },
    insights,
    { data: fbIssues },
  ] = await Promise.all([
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("status", "scheduled")
      .gte("scheduled_at", nowIso),
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("status", "published"),
    supabase
      .from("posts")
      .select("id, title, image_url, scheduled_at, platforms, quality_score, status")
      .in("status", ["pending", "scheduled", "approved"])
      .gte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(4),
    computeInsights(supabase),
    supabase
      .from("post_publications")
      .select("error")
      .eq("platform", "facebook")
      .eq("status", "skipped")
      .ilike("error", "%Page%")
      .limit(1),
  ]);

  const upcoming = (upcomingRaw ?? []) as UpcomingPost[];
  const pendingCount = pending ?? 0;
  const topPillar = insights.pillars.find((p) => p.posts > 0);

  const openaiOk = Boolean(process.env.OPENAI_API_KEY);
  const blotatoOk = Boolean(process.env.BLOTATO_API_KEY);
  const fbOk = !(fbIssues && fbIssues.length > 0);

  return (
    <div className="flex-1 p-3 md:p-6 bg-background space-y-4 md:space-y-5 pb-24 md:pb-6">
      {/* Begrüßung */}
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">Hallo Andreas 👋</h1>
        <p className="text-sm text-muted-foreground">Dein Social-Media-Leitstand</p>
      </div>

      {/* Maschinen-Status */}
      <Card className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <span className="font-medium text-sm">Content-Maschine läuft</span>
        </div>
        <div className="hidden sm:block h-4 w-px bg-border" />
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarClock className="w-3.5 h-3.5" />
          Nächster Lauf: täglich 5:00
        </div>
        <div className="hidden sm:block h-4 w-px bg-border" />
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{scheduled ?? 0}</span> Posts eingeplant
        </div>
      </Card>

      {/* Primär-Aktion */}
      {pendingCount > 0 ? (
        <Link href="/social/freigaben" className="block">
          <Card
            className="p-4 md:p-5 flex items-center gap-4 transition-shadow hover:shadow-md border-l-4"
            style={{ borderLeftColor: "var(--brand-primary)" }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0"
              style={{ background: "var(--brand-primary)" }}
            >
              <Clock className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold">
                {pendingCount} Post{pendingCount === 1 ? "" : "s"} warte
                {pendingCount === 1 ? "t" : "n"} auf dich
              </div>
              <div className="text-sm text-muted-foreground">
                Kurz prüfen & freigeben — dann gehen sie automatisch zur geplanten Zeit raus.
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-muted-foreground shrink-0" />
          </Card>
        </Link>
      ) : (
        <Card className="p-4 md:p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-emerald-100 text-emerald-700 shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="font-semibold">Alles freigegeben ✓</div>
            <div className="text-sm text-muted-foreground">
              Nichts zu tun — die Maschine plant die nächsten Posts von allein.
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Nächste Posts */}
        <Card className="p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4" style={{ color: "var(--brand-primary)" }} />
              Nächste Posts
            </h2>
            <Link href="/social/kalender" className="text-xs text-muted-foreground hover:text-foreground">
              Kalender →
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Noch nichts geplant — die Maschine füllt morgen früh nach.
            </p>
          ) : (
            <div className="space-y-2">
              {upcoming.map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-lg shrink-0 bg-muted"
                    style={
                      p.image_url
                        ? { background: `center/cover no-repeat url(${p.image_url})` }
                        : undefined
                    }
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.title}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {p.scheduled_at ? formatDateTime(p.scheduled_at) : "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {p.quality_score != null && (
                      <span className="text-[10px] font-medium text-muted-foreground">
                        TÜV {p.quality_score}
                      </span>
                    )}
                    <div className="flex gap-1">
                      {p.platforms.map((pl) => (
                        <span
                          key={pl}
                          className="w-4 h-4 rounded-full text-white text-[8px] font-bold flex items-center justify-center"
                          style={{ background: PLATFORM_COLOR[pl] ?? "#999" }}
                        >
                          {PLATFORM_SHORT[pl]}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Rechte Spalte: Performance + Health */}
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="font-semibold text-sm flex items-center gap-2 mb-3">
              <Brain className="w-4 h-4" style={{ color: "var(--brand-primary)" }} />
              Lern-Schleife
            </h2>
            {insights.sampleSize === 0 ? (
              <p className="text-xs text-muted-foreground">
                Sammelt noch Daten — sobald Posts Likes bekommen, steht hier die
                beste Säule &amp; Zeit.
              </p>
            ) : (
              <div className="space-y-2 text-sm">
                <Row label="Beste Säule" value={topPillar ? topPillar.label.split(" ")[0] : "—"} />
                <Row
                  label="Beste Zeit"
                  value={insights.bestHour ? `${insights.bestHour.hour}:00` : "—"}
                />
                <Row
                  label="Status"
                  value={insights.learnedWeights ? "Optimiert" : "lernt"}
                />
              </div>
            )}
            <Link
              href="/social/analytics"
              className="text-xs text-muted-foreground hover:text-foreground mt-3 inline-block"
            >
              Analytics →
            </Link>
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold text-sm mb-3">System-Status</h2>
            <div className="space-y-2">
              <Health ok={openaiOk} label="KI (OpenAI)" />
              <Health ok={blotatoOk} label="Veröffentlichung (Blotato)" />
              <Health ok={fbOk} label="Facebook-Seite" warnText="Seite in Blotato verbinden" />
            </div>
          </Card>
        </div>
      </div>

      {/* Mini-Statistik */}
      <div className="grid grid-cols-3 gap-3">
        <MiniKpi icon={Clock} label="Offen" value={pendingCount} />
        <MiniKpi icon={CalendarClock} label="Geplant" value={scheduled ?? 0} />
        <MiniKpi icon={CheckCircle2} label="Veröffentlicht" value={published ?? 0} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Health({ ok, label, warnText }: { ok: boolean; label: string; warnText?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
      ) : (
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
      )}
      <span className="flex-1">{label}</span>
      <span className={`text-xs ${ok ? "text-emerald-600" : "text-amber-600"}`}>
        {ok ? "OK" : warnText ?? "Problem"}
      </span>
    </div>
  );
}

function MiniKpi({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Heart;
  label: string;
  value: number;
}) {
  return (
    <Card className="p-3 md:p-4 text-center">
      <Icon className="w-4 h-4 mx-auto mb-1.5 text-muted-foreground" />
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </Card>
  );
}
