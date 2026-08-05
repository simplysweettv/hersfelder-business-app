import { NextRequest, NextResponse } from "next/server";
import { renderCarouselSlide, type CarouselSlide } from "@/lib/render-carousel";

/**
 * Dev-only Look-Vorschau der Karussell-Slides mit festen Beispiel-Inhalten —
 * zum visuellen Abnehmen des LAYOUTS ohne KI-Kosten. In Produktion: 404.
 *
 *   GET /api/dev/carousel-preview?slide=punkt
 *   GET /api/dev/carousel-preview?slide=abschluss
 *
 * Das COVER ist ein normaler designter Post und liegt deshalb bei der
 * Poster-Vorschau: /api/dev/poster-preview?layout=karte-unten&swipe=1
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SAMPLES: Record<string, CarouselSlide> = {
  punkt: {
    kind: "punkt",
    number: 2,
    icon: "ruler",
    kicker: "Der Größen-Check",
    heading: ["Einer misst nach.", "Alle passen rein."],
    body: "Ein Musterset geht einmal durch den Verein — danach steht jede Größe fest, und niemand muss beim Anprobieren raten.",
  },
  abschluss: {
    kind: "abschluss",
    heading: ["Ein Auftritt.", "Ein Verein."],
    scriptAccent: "Bis zum nächsten Fest.",
    cta: {
      title: "Musterkollektion für euren Verein anfragen",
      sub: "Für Schützenvereine, Spielmannszüge und Bruderschaften.",
    },
    benefits: [
      { icon: "badge-check", title: "Eigene Fertigung", text: "" },
      { icon: "package", title: "Dauerhaft lieferbar", text: "" },
      { icon: "repeat", title: "Nachkaufgarantie", text: "" },
    ],
    url: "schuetzen-ausstatter.de",
  },
};

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const key = req.nextUrl.searchParams.get("slide") ?? "punkt";
  const slide = SAMPLES[key];
  if (!slide) {
    return NextResponse.json(
      { error: `Unbekannte Slide „${key}". Erlaubt: ${Object.keys(SAMPLES).join(", ")}` },
      { status: 400 },
    );
  }

  const png = await renderCarouselSlide(slide, key === "abschluss" ? 6 : 2, 6);
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
