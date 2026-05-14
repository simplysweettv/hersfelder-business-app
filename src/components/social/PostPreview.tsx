"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Heart, MessageCircle, Send, Sparkles } from "lucide-react";
import {
  PLATFORM_LABEL,
  PLATFORM_COLOR,
  type Platform,
} from "@/types";

export function PostPreview({
  imageUrl,
  caption,
  platforms,
}: {
  imageUrl?: string | null;
  caption?: string | null;
  platforms: Platform[];
}) {
  const list = platforms.length ? platforms : (["instagram"] as Platform[]);

  return (
    <Tabs defaultValue={list[0]} className="w-full">
      <TabsList className="w-full grid grid-cols-4 mb-3">
        {(["instagram", "facebook", "tiktok", "linkedin"] as Platform[]).map(
          (p) => (
            <TabsTrigger
              key={p}
              value={p}
              disabled={!list.includes(p)}
              className="text-xs"
            >
              <span
                className="w-2 h-2 rounded-full mr-1.5 inline-block"
                style={{ background: PLATFORM_COLOR[p] }}
              />
              {PLATFORM_LABEL[p]}
            </TabsTrigger>
          ),
        )}
      </TabsList>

      {list.map((p) => (
        <TabsContent key={p} value={p}>
          <PreviewCard platform={p} imageUrl={imageUrl} caption={caption} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function PreviewCard({
  platform,
  imageUrl,
  caption,
}: {
  platform: Platform;
  imageUrl?: string | null;
  caption?: string | null;
}) {
  const isVertical = platform === "tiktok";
  return (
    <div className="rounded-lg border border-border bg-white overflow-hidden max-w-md mx-auto">
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <div
          className="w-8 h-8 rounded-full text-white flex items-center justify-center text-xs font-semibold"
          style={{ background: "var(--brand-primary)" }}
        >
          H
        </div>
        <div className="leading-tight">
          <div className="text-sm font-medium">schuetzenausstatter</div>
          <div className="text-[11px] text-muted-foreground">
            Hersfelder · Bad Hersfeld
          </div>
        </div>
      </div>
      <div
        className={
          isVertical
            ? "aspect-[9/16] w-full max-h-[420px] flex items-center justify-center"
            : "aspect-square w-full flex items-center justify-center"
        }
        style={{
          background: imageUrl
            ? `center / cover no-repeat url(${imageUrl})`
            : "linear-gradient(135deg, var(--brand-primary), var(--brand-sidebar))",
        }}
      >
        {!imageUrl && (
          <div className="text-white/70 flex flex-col items-center gap-2">
            <Sparkles className="w-8 h-8" />
            <span className="text-xs">KI-Bild folgt nach Generierung</span>
          </div>
        )}
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-4 text-muted-foreground">
          <Heart className="w-5 h-5" />
          <MessageCircle className="w-5 h-5" />
          <Send className="w-5 h-5" />
        </div>
        <div className="text-[13px] whitespace-pre-wrap leading-relaxed">
          {caption || (
            <span className="text-muted-foreground italic">
              Caption wird nach Generierung hier angezeigt …
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
