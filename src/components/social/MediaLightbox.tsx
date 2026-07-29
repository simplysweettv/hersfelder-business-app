"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Große Lightbox für Post-Bilder (einzeln oder Karussell).
 * Öffnet Bilder in voller Größe mit ‹ ›-Navigation, Slide-Zähler,
 * Pfeiltasten-Support und Thumbnail-Leiste — weil die kleine Vorschau
 * in der Freigaben-Ansicht nicht reicht.
 */
export function MediaLightbox({
  images,
  title,
  open,
  onOpenChange,
  startIndex = 0,
}: {
  images: string[];
  title?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startIndex?: number;
}) {
  const [index, setIndex] = useState(startIndex);
  const count = images.length;
  const multi = count > 1;

  // Beim Öffnen auf das angeklickte Bild springen.
  useEffect(() => {
    if (open) setIndex(Math.min(Math.max(startIndex, 0), Math.max(count - 1, 0)));
  }, [open, startIndex, count]);

  if (count === 0) return null;

  const prev = () => setIndex((i) => (i - 1 + count) % count);
  const next = () => setIndex((i) => (i + 1) % count);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[min(1200px,calc(100%-2rem))] sm:max-w-[min(1200px,calc(100%-2rem))] p-3 gap-2 bg-black/95 text-white ring-white/10"
        onKeyDown={(e) => {
          if (!multi) return;
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            prev();
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            next();
          }
        }}
      >
        <DialogTitle className="text-sm text-white/90 pr-10 truncate">
          {title || "Bildvorschau"}
          {multi && (
            <span className="ml-2 font-normal text-white/60 tabular-nums">
              {index + 1} / {count}
            </span>
          )}
        </DialogTitle>

        {/* Großes Bild */}
        <div className="relative flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[index]}
            alt={multi ? `Slide ${index + 1} von ${count}` : title || "Post-Bild"}
            className="max-h-[80vh] w-auto max-w-full object-contain rounded-md select-none"
          />

          {multi && (
            <>
              <button
                type="button"
                aria-label="Vorheriges Bild"
                onClick={prev}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 transition-colors"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                type="button"
                aria-label="Nächstes Bild"
                onClick={next}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 transition-colors"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs bg-black/60 text-white px-2 py-0.5 rounded-full tabular-nums">
                {index + 1} / {count}
              </span>
            </>
          )}
        </div>

        {/* Thumbnail-Leiste (nur bei Karussells) */}
        {multi && (
          <div className="flex gap-2 overflow-x-auto pt-1 pb-0.5 justify-start sm:justify-center">
            {images.map((url, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Zu Slide ${i + 1} springen`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
                className={cn(
                  "relative shrink-0 rounded-md overflow-hidden border-2 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                  i === index
                    ? "border-white opacity-100"
                    : "border-transparent opacity-50 hover:opacity-80"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  className="h-14 w-14 object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
