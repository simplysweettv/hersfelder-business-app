import { cn } from "@/lib/utils";
import { weekDayLabels } from "@/lib/date-utils";
import { PostMiniCard, EmptyDayCell } from "./PostMiniCard";
import type { Post } from "@/types";

export function WeekPlanGrid({
  days,
  postsByDay,
}: {
  days: Date[];
  postsByDay: Record<string, Post[]>;
}) {
  const labels = weekDayLabels(days);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      {labels.map((label) => {
        const posts = postsByDay[label.iso] ?? [];
        return (
          <div key={label.iso} className="flex flex-col gap-2">
            <div
              className={cn(
                "rounded-md px-2 py-1.5 text-xs font-medium",
                label.isToday
                  ? "text-white"
                  : "bg-muted/50 text-muted-foreground",
              )}
              style={
                label.isToday
                  ? { background: "var(--brand-primary)" }
                  : undefined
              }
            >
              <div className="uppercase tracking-wide">{label.name}</div>
              <div className="text-[10px] opacity-80">{label.day}.</div>
            </div>
            {posts.length === 0 && <EmptyDayCell />}
            {posts.map((p) => (
              <PostMiniCard key={p.id} post={p} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
