"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "./StatusBadge";
import { PublicationStatus, type PublicationRow } from "./PublicationStatus";
import { splitCaption } from "@/lib/caption";
import { formatDateTime } from "@/lib/date-utils";
import type { Post, Platform } from "@/types";
import { Eye, Images } from "lucide-react";

const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
};

/**
 * Anklickbare Kalender-Zeile: öffnet einen Dialog mit Bild(ern) + allen
 * Plattform-Captions, damit Andreas jeden Post jederzeit wieder ansehen kann.
 */
export function PostDetailDialog({
  post,
  pubs,
}: {
  post: Post;
  pubs: PublicationRow[];
}) {
  const [open, setOpen] = useState(false);

  const captionEntries = Object.entries(splitCaption(post.caption ?? "")) as [
    Platform,
    string,
  ][];
  const slides =
    post.image_urls && post.image_urls.length > 1 ? post.image_urls : null;

  return (
    <>
      <Card
        role="button"
        tabIndex={0}
        aria-label={`Post ansehen: ${post.title || "Ohne Titel"}`}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="group p-3 flex items-start gap-4 cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div
          className="w-12 h-12 rounded-md shrink-0"
          style={{
            background: post.image_url
              ? `center / cover no-repeat url(${post.image_url})`
              : "linear-gradient(135deg, var(--brand-primary), var(--brand-sidebar))",
          }}
        />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="font-medium text-sm truncate flex-1">{post.title}</div>
            {post.quality_score != null && (
              <span className="text-[10px] text-muted-foreground shrink-0">
                TÜV {post.quality_score}
              </span>
            )}
            <StatusBadge status={post.status} />
          </div>
          <div className="text-xs text-muted-foreground">
            {post.scheduled_at ? formatDateTime(post.scheduled_at) : ""}
          </div>
          {/* Live-Links dürfen nicht den Dialog öffnen → Klick hier stoppen */}
          <div onClick={(e) => e.stopPropagation()}>
            <PublicationStatus platforms={post.platforms} publications={pubs} />
          </div>
        </div>
        <Eye className="w-4 h-4 shrink-0 self-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="pr-8">{post.title || "Ohne Titel"}</DialogTitle>
          </DialogHeader>

          {/* Meta-Zeile */}
          <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground -mt-1">
            {post.scheduled_at && <span>{formatDateTime(post.scheduled_at)}</span>}
            <StatusBadge status={post.status} />
            {slides && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                <Images className="w-3 h-3" />
                Karussell · {slides.length}
              </span>
            )}
          </div>

          {/* Bild(er) */}
          {slides ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {slides.map((url, i) => (
                <div key={i} className="relative shrink-0">
                  <img
                    src={url}
                    alt={`Slide ${i + 1}`}
                    className="h-56 w-auto rounded-md border border-border"
                  />
                  <span className="absolute top-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                    {i + 1}/{slides.length}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            post.image_url && (
              <img
                src={post.image_url}
                alt={post.title ?? "Post-Bild"}
                className="max-h-[55vh] w-auto mx-auto rounded-md border border-border object-contain"
              />
            )
          )}

          {/* Captions pro Plattform */}
          <div className="space-y-3">
            {captionEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Caption vorhanden.</p>
            ) : (
              captionEntries.map(([platform, text], i) => (
                <div key={platform} className={i > 0 ? "pt-3 border-t border-border" : ""}>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    {PLATFORM_LABELS[platform]}
                  </div>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{text}</p>
                </div>
              ))
            )}
          </div>

          {/* Veröffentlichungs-Status / Live-Links */}
          <div className="pt-3 border-t border-border">
            <PublicationStatus platforms={post.platforms} publications={pubs} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
