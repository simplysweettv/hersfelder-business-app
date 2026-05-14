import { PlatformDots } from "./PlatformDots";
import { StatusBadge } from "./StatusBadge";
import { Sparkles } from "lucide-react";
import type { Post } from "@/types";
import { formatTime } from "@/lib/date-utils";

export function PostMiniCard({ post }: { post: Post }) {
  return (
    <div className="rounded-md border border-border bg-white overflow-hidden flex flex-col hover:shadow-md transition-shadow cursor-pointer">
      <div
        className="aspect-square w-full flex items-center justify-center"
        style={{
          background: post.image_url
            ? `center / cover no-repeat url(${post.image_url})`
            : "linear-gradient(135deg, var(--brand-primary), var(--brand-sidebar))",
        }}
      >
        {!post.image_url && <Sparkles className="w-6 h-6 text-white/70" />}
      </div>
      <div className="p-2 space-y-1.5">
        <div className="text-[12px] font-medium leading-snug line-clamp-2">
          {post.title || "Ohne Titel"}
        </div>
        <div className="flex items-center justify-between gap-1">
          <PlatformDots platforms={post.platforms} />
          <StatusBadge status={post.status} />
        </div>
        {post.scheduled_at && (
          <div className="text-[10px] text-muted-foreground">
            {formatTime(post.scheduled_at)} Uhr
          </div>
        )}
      </div>
    </div>
  );
}

export function EmptyDayCell({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="aspect-[3/4] rounded-md border border-dashed border-border bg-transparent hover:bg-muted/50 transition-colors flex items-center justify-center text-muted-foreground"
    >
      <span className="text-lg leading-none">+</span>
    </button>
  );
}
