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
import { PublicationDetail } from "./PublicationDetail";
import { TrafficLightDot, TrafficLightChip } from "./TrafficLight";
import { postHealth } from "@/lib/post-health";
import { splitCaption, AI_DISCLOSURE, hasAiDisclosure } from "@/lib/caption";
import { formatDateTime } from "@/lib/date-utils";
import type { Post, Platform } from "@/types";
import { Eye, Images } from "lucide-react";
import { MediaLightbox } from "./MediaLightbox";

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
  // Lightbox: null = zu, sonst Index des zuerst gezeigten Bildes.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const captionEntries = Object.entries(splitCaption(post.caption ?? "")) as [
    Platform,
    string,
  ][];
  const slides =
    post.image_urls && post.image_urls.length > 1 ? post.image_urls : null;
  const allImages = slides ?? (post.image_url ? [post.image_url] : []);

  // Die Ampel: eine Antwort auf "ist der Post rausgegangen?".
  const health = postHealth(post, pubs);

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
        // flex-row muss explizit sein: die Card-Basis bringt flex-col mit.
        className="group p-3 flex flex-row items-start gap-3 cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* Ampel ganz links: eine Spalte zum Runterscannen. */}
        <TrafficLightDot
          light={health.light}
          label={health.label}
          className="mt-4"
        />
        <div
          className="w-12 h-12 rounded-md shrink-0"
          style={{
            background: post.image_url
              ? `center / cover no-repeat url(${post.image_url})`
              : "linear-gradient(135deg, var(--brand-primary), var(--brand-sidebar))",
          }}
        />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Auf dem Handy bekommt der Titel eine eigene Zeile — sonst
                drängt ihn die Ampel-Pille auf drei Buchstaben zusammen. */}
            <div className="font-medium text-sm basis-full sm:basis-0 sm:flex-1 min-w-0 line-clamp-2 sm:truncate">
              {post.title}
            </div>
            {post.quality_score != null && (
              <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:inline">
                TÜV {post.quality_score}
              </span>
            )}
            <TrafficLightChip light={health.light} label={health.label} />
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
            <TrafficLightChip light={health.light} label={health.label} />
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
                <button
                  key={i}
                  type="button"
                  aria-label={`Slide ${i + 1} groß ansehen`}
                  title="Zum Vergrößern klicken"
                  onClick={() => setLightboxIndex(i)}
                  className="relative shrink-0 cursor-zoom-in rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <img
                    src={url}
                    alt={`Slide ${i + 1}`}
                    className="h-56 w-auto rounded-md border border-border"
                  />
                  <span className="absolute top-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                    {i + 1}/{slides.length}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            post.image_url && (
              <button
                type="button"
                aria-label="Groß ansehen"
                title="Zum Vergrößern klicken"
                onClick={() => setLightboxIndex(0)}
                className="block mx-auto cursor-zoom-in rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <img
                  src={post.image_url}
                  alt={post.title ?? "Post-Bild"}
                  className="max-h-[55vh] w-auto rounded-md border border-border object-contain"
                />
              </button>
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
                  {/* Pflicht-Kennzeichnung: wird beim Posten automatisch angehängt. */}
                  {!hasAiDisclosure(text) && (
                    <p className="mt-1.5 text-xs text-muted-foreground italic">
                      {AI_DISCLOSURE}
                      <span className="not-italic"> · wird automatisch angehängt</span>
                    </p>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Was ist passiert — Ampel, exakter Fehler, Handlungsempfehlung */}
          <div className="pt-3 border-t border-border">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Veröffentlichung
            </h3>
            <PublicationDetail postId={post.id} health={health} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Große Lightbox-Ansicht für alle Bilder des Posts */}
      {allImages.length > 0 && (
        <MediaLightbox
          images={allImages}
          title={post.title || "Ohne Titel"}
          open={lightboxIndex !== null}
          onOpenChange={(o) => setLightboxIndex(o ? (lightboxIndex ?? 0) : null)}
          startIndex={lightboxIndex ?? 0}
        />
      )}
    </>
  );
}
