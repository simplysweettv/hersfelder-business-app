import { createClient } from "@/lib/supabase/server";
import { currentWeekInfo } from "@/lib/date-utils";
import { WeekPlanGrid } from "@/components/social/WeekPlanGrid";
import { AIBanner } from "@/components/social/AIBanner";
import { Card } from "@/components/ui/card";
import type { Post } from "@/types";
import { format, parseISO } from "date-fns";

export const dynamic = "force-dynamic";

export default async function WochenplanPage() {
  const supabase = await createClient();
  const { days, week, year } = currentWeekInfo();

  const start = days[0].toISOString();
  const end = new Date(days[6].getTime() + 86_399_000).toISOString();

  const { data: posts } = await supabase
    .from("posts")
    .select("*")
    .or(`week_number.eq.${week},and(scheduled_at.gte.${start},scheduled_at.lte.${end})`)
    .eq("year", year)
    .order("scheduled_at", { ascending: true });

  const list = (posts ?? []) as Post[];

  const postsByDay: Record<string, Post[]> = {};
  for (const p of list) {
    if (!p.scheduled_at) continue;
    const iso = format(parseISO(p.scheduled_at), "yyyy-MM-dd");
    if (!postsByDay[iso]) postsByDay[iso] = [];
    postsByDay[iso].push(p);
  }

  const pending = list.filter((p) => p.status === "pending").length;
  const approved = list.filter((p) =>
    ["approved", "scheduled", "published"].includes(p.status),
  ).length;

  const platforms = new Set<string>();
  list.forEach((p) => p.platforms.forEach((x) => platforms.add(x)));

  const nextPublish = list
    .filter((p) => p.scheduled_at && p.status !== "published")
    .sort((a, b) =>
      (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""),
    )[0];

  return (
    <div className="flex-1 p-5 bg-background space-y-5">
      <AIBanner
        weekNumber={week}
        pendingCount={pending}
        totalForWeek={list.length}
      />

      <WeekPlanGrid days={days} postsByDay={postsByDay} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Posts diese Woche"
          value={String(list.length)}
          hint={`KW ${week} / ${year}`}
        />
        <MetricCard
          label="Freigegeben"
          value={`${approved}/${list.length}`}
          hint={pending > 0 ? `${pending} ausstehend` : "alles freigegeben"}
        />
        <MetricCard
          label="Plattformen"
          value={String(platforms.size)}
          hint={Array.from(platforms).join(", ") || "—"}
        />
        <MetricCard
          label="Nächste Veröffentlichung"
          value={
            nextPublish?.scheduled_at
              ? format(parseISO(nextPublish.scheduled_at), "dd.MM. HH:mm")
              : "—"
          }
          hint={nextPublish?.title ?? "Keine geplant"}
        />
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {hint && (
        <div className="text-xs text-muted-foreground mt-0.5 truncate">
          {hint}
        </div>
      )}
    </Card>
  );
}
