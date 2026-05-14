"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PlatformPills } from "./PlatformDots";
import { Pencil, Check, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import type { Post } from "@/types";
import { formatDateTime } from "@/lib/date-utils";

const PLATFORM_SEPS = ["---INSTAGRAM---", "---FACEBOOK---", "---TIKTOK---", "---LINKEDIN---"] as const;
type PlatformKey = "instagram" | "facebook" | "tiktok" | "linkedin";

function splitCaption(caption: string): Partial<Record<PlatformKey, string>> {
  const result: Partial<Record<PlatformKey, string>> = {};
  const parts = caption.split(/(---(?:INSTAGRAM|FACEBOOK|TIKTOK|LINKEDIN)---)/);
  let currentKey: PlatformKey | null = null;
  for (const part of parts) {
    const sep = PLATFORM_SEPS.find((s) => s === part.trim());
    if (sep) {
      currentKey = sep.replace(/---/g, "").toLowerCase() as PlatformKey;
    } else if (currentKey && part.trim()) {
      result[currentKey] = part.trim();
    }
  }
  // Fallback: if no separators found, treat whole caption as instagram
  if (Object.keys(result).length === 0 && caption.trim()) {
    result.instagram = caption.trim();
  }
  return result;
}

const PLATFORM_LABELS: Record<PlatformKey, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
};

export function ApprovalCard({ post }: { post: Post }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [expanded, setExpanded] = useState(false);

  const captions = splitCaption(post.caption ?? "");
  const captionEntries = Object.entries(captions) as [PlatformKey, string][];

  function approve() {
    start(async () => {
      const res = await fetch(`/api/posts/${post.id}/approve`, {
        method: "POST",
      });
      if (!res.ok) {
        toast.error("Freigabe fehlgeschlagen");
        return;
      }
      toast.success("Post freigegeben ✓");
      router.refresh();
    });
  }

  return (
    <Card className="overflow-hidden">
      {/* Header row */}
      <div className="p-3 flex items-center gap-3">
        <div
          className="w-[52px] h-[52px] rounded-md shrink-0 flex items-center justify-center"
          style={{
            background: post.image_url
              ? `center / cover no-repeat url(${post.image_url})`
              : "linear-gradient(135deg, var(--brand-primary), var(--brand-sidebar))",
          }}
        >
          {!post.image_url && <Sparkles className="w-4 h-4 text-white/70" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">
            {post.title || "Ohne Titel"}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {post.scheduled_at
              ? `geplant für ${formatDateTime(post.scheduled_at)}`
              : "noch nicht eingeplant"}
          </div>
          <div className="mt-1.5">
            <PlatformPills platforms={post.platforms} />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            className="text-muted-foreground"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {expanded ? "Einklappen" : "Vorschau"}
          </Button>
          <Button variant="outline" size="sm" disabled={pending}>
            <Pencil className="w-3.5 h-3.5" />
            Bearbeiten
          </Button>
          <Button
            size="sm"
            disabled={pending}
            onClick={approve}
            style={{ background: "var(--brand-primary)", color: "white" }}
          >
            <Check className="w-3.5 h-3.5" />
            Freigeben
          </Button>
        </div>
      </div>

      {/* Expanded preview */}
      {expanded && (
        <div className="border-t border-border">
          <div className="flex gap-0 flex-col md:flex-row">
            {/* Image */}
            {post.image_url && (
              <div className="md:w-72 shrink-0">
                <img
                  src={post.image_url}
                  alt={post.title ?? "Post Bild"}
                  className="w-full h-full object-cover max-h-72 md:max-h-none"
                />
              </div>
            )}

            {/* Captions per platform */}
            <div className="flex-1 p-4 space-y-4 bg-muted/30 overflow-y-auto max-h-96">
              {captionEntries.length === 0 && (
                <p className="text-sm text-muted-foreground">Keine Caption vorhanden.</p>
              )}
              {captionEntries.map(([platform, text], i) => (
                <div key={platform} className={i > 0 ? "pt-3 border-t border-border" : ""}>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    {PLATFORM_LABELS[platform]}
                  </div>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
