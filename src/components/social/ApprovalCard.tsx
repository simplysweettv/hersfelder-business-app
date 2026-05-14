"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { PlatformPills } from "./PlatformDots";
import { Pencil, Check, Sparkles } from "lucide-react";
import type { Post } from "@/types";
import { formatDateTime } from "@/lib/date-utils";

export function ApprovalCard({ post }: { post: Post }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function approve() {
    start(async () => {
      const res = await fetch(`/api/posts/${post.id}/approve`, {
        method: "POST",
      });
      if (!res.ok) {
        toast.error("Freigabe fehlgeschlagen");
        return;
      }
      toast.success("Post freigegeben");
      router.refresh();
    });
  }

  return (
    <Card className="p-3 flex items-center gap-4">
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
    </Card>
  );
}
