import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { renderPoster, renderCarousel, type PosterContent, type CarouselContent } from "@/lib/render-poster";

/**
 * Dev-only Look-Vorschau der neuen Poster-Engine (Plakat/Foto/Typo/Karussell)
 * mit fixen Beispiel-Inhalten und Platzhalter-Foto — zum schnellen visuellen
 * Abnehmen des LAYOUTS, ohne KI-Kosten. In Produktion: 404.
 *
 *   GET /api/dev/poster-preview?kind=plakat&variant=0
 *   GET /api/dev/poster-preview?kind=foto
 *   GET /api/dev/poster-preview?kind=typo&variant=0|1
 *   GET /api/dev/poster-preview?kind=karussell&slide=0..N
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function photo(): string | undefined {
  const p = path.join(process.cwd(), "public", "brand-guide", "instagram", "post-lifestyle.jpg");
  if (fs.existsSync(p)) return `data:image/jpeg;base64,${fs.readFileSync(p).toString("base64")}`;
  return undefined;
}

const PLAKAT: PosterContent[] = [
  {
    kind: "plakat",
    variant: 0, // Kino-Plakat (Text unten)
    kicker: "Seit 1897 im Verein",
    headline: ["Wenn der Zug", "durchs Dorf zieht,", "geht das Herz mit."],
    scriptAccent: "Das ist Heimat.",
    sub: "Dunkelgrün getragen von Generationen.",
  },
  {
    kind: "plakat",
    variant: 1, // Zentral
    kicker: "Schützenfest 2026",
    headline: ["Eingehakt.", "Eingespielt.", "Eingeschworen."],
    url: "schuetzen-ausstatter.de",
  },
  {
    kind: "plakat",
    variant: 2, // Split-Band
    kicker: "Die Damenweste",
    headline: ["Für Schützinnen,", "die vorne stehen."],
    sub: "Moderner Schnitt, Größen 23–70, ein Preis.",
    url: "schuetzen-ausstatter.de",
  },
];

const FOTO: PosterContent = { kind: "foto", variant: 0 };

const TYPO: PosterContent[] = [
  {
    kind: "typo",
    variant: 0, // dunkel, Swiss Heritage
    kicker: "Hersfelder",
    headline: ["Tradition trägt man", "nicht. Man lebt sie."],
    scriptAccent: "Gemeinsam.",
    url: "schuetzen-ausstatter.de",
  },
  {
    kind: "typo",
    variant: 1, // creme
    kicker: "Für den ganzen Verein",
    headline: ["Größe 23 bis 70.", "Ein Preis für alle."],
    scriptAccent: "Fair.",
    sub: "Kein Größenaufschlag — einheitlicher Auftritt.",
  },
];

const CAROUSEL: CarouselContent = {
  cover: {
    kicker: "Warum diese Weste hält",
    headline: ["3 Dinge, die eine", "gute Vereinsweste", "ausmachen."],
    scriptAccent: "Wische →",
  },
  slides: [
    { heading: "Der Stoff", body: "Robuste Wollqualität, die den Vereinsalltag jahrelang mitmacht — Fest für Fest." },
    { heading: "Der Sitz", body: "Fein abgestufte Größen 23–70, damit jede Schützin ihren Auftritt hat." },
    { heading: "Der Preis", body: "Alle Größen zum gleichen fairen Vereinspreis. Kein Aufschlag, keine Überraschung." },
  ],
  outro: { headline: "Rüstet euren Verein aus.", cta: "Musterkollektion anfragen" },
};

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  }
  const kind = req.nextUrl.searchParams.get("kind") ?? "plakat";
  const variant = Number(req.nextUrl.searchParams.get("variant") ?? "0");

  let buf: Buffer;
  if (kind === "karussell") {
    const slide = Number(req.nextUrl.searchParams.get("slide") ?? "0");
    const all = await renderCarousel(CAROUSEL, photo());
    buf = all[Math.max(0, Math.min(slide, all.length - 1))];
  } else if (kind === "foto") {
    buf = await renderPoster(FOTO, photo());
  } else if (kind === "typo") {
    buf = await renderPoster(TYPO[variant % TYPO.length]);
  } else {
    buf = await renderPoster(PLAKAT[variant % PLAKAT.length], photo());
  }

  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
