import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { renderPoster, POSTER_LAYOUT_KEYS, type PosterContent, type PosterLayoutKey } from "@/lib/render-poster";

/**
 * Dev-only Look-Vorschau der Poster-Engine v3 mit fixen Beispiel-Inhalten und
 * Platzhalter-Foto — zum schnellen visuellen Abnehmen des LAYOUTS, ohne
 * KI-Kosten. In Produktion: 404.
 *
 *   GET /api/dev/poster-preview?layout=panel-links
 *   GET /api/dev/poster-preview?layout=panel-cta
 *   GET /api/dev/poster-preview?layout=zentral-minimal
 *   GET /api/dev/poster-preview?layout=karte-unten
 *   GET /api/dev/poster-preview?layout=band-unten
 *
 * Optional: &photo=<datei.jpg> nutzt ein anderes Bild aus public/brand-guide/.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Platzhalter-Foto. Die Engine rendert bewusst nicht ohne Bild — findet sich
 * keins, sagen wir das klar, statt ein Farbfeld zu zeigen (genau dieser
 * Fallback war die Ursache der grünen Posts).
 */
function photo(name?: string | null): string | null {
  const dir = path.join(process.cwd(), "public", "brand-guide");
  const candidates = name
    ? [path.join(dir, name), path.join(dir, "instagram", name)]
    : [
        path.join(dir, "instagram", "post-lifestyle.jpg"),
        path.join(dir, "instagram", "post-produkt.jpg"),
      ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return `data:image/jpeg;base64,${fs.readFileSync(p).toString("base64")}`;
  }
  return null;
}

const SAMPLES: Record<PosterLayoutKey, PosterContent> = {
  "panel-links": {
    layout: "panel-links",
    kicker: "Die Damenweste",
    headline: ["Die Damenweste", "für alle, die", "Tradition modern", "leben."],
    sub: "Moderner Schnitt, faire Vereinspreise — für Schützinnen und Damenkompanien.",
    features: [
      { icon: "shirt", title: "Moderner Schnitt", text: "Zeitlos, elegant, bequem" },
      { icon: "ruler", title: "Größen 23–70", text: "Für jedes Mitglied die passende Größe" },
      { icon: "handshake", title: "Faire Vereinspreise", text: "Top Qualität zu attraktiven Konditionen" },
    ],
  },
  "panel-cta": {
    layout: "panel-cta",
    tagline: "Tradition. Verbunden.",
    accentIcon: "sun",
    headline: ["Wenn andere ins", "Schwitzen kommen."],
    copy: "Unsere leichten Stoffqualitäten sorgen auch an heißen Festtagen für angenehmen Tragekomfort.",
    cta: { title: "Jetzt Musterkollektion anfragen", sub: "Für euren Verein oder Spielmannszug." },
    footerNotes: [
      { icon: "shield-check", label: "Konstante Qualität" },
      { icon: "repeat", label: "Jederzeit nachbestellbar" },
    ],
    url: "schuetzen-ausstatter.de",
  },
  "zentral-minimal": {
    layout: "zentral-minimal",
    headline: ["Gemeinsam heute."],
    scriptAccent: "Tradition für morgen.",
  },
  "karte-unten": {
    layout: "karte-unten",
    kicker: "Der Tag nach dem Fest",
    headline: ["Die Wimpel sind ab.", "Die Geschichten", "hängen noch."],
    scriptAccent: "Bis nächstes Jahr.",
    sub: "Sechs Kilometer marschiert — und keinen Meter davon vergessen.",
  },
  "band-unten": {
    layout: "band-unten",
    kicker: "Spielmannszug",
    headline: ["Einer gibt den Takt vor.", "Vierzig halten ihn."],
    scriptAccent: "Zwei Takte Vorlauf.",
    sub: "Einheitlich ausgestattet vom ersten Wirbel an — Größen 23 bis 70, ein Preis.",
    url: "schuetzen-ausstatter.de",
  },
};

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  }

  const sp = req.nextUrl.searchParams;
  const layout = (sp.get("layout") ?? "panel-links") as PosterLayoutKey;
  if (!POSTER_LAYOUT_KEYS.includes(layout)) {
    return NextResponse.json(
      { error: `Unbekanntes Layout „${layout}".`, layouts: POSTER_LAYOUT_KEYS },
      { status: 400 },
    );
  }

  const p = photo(sp.get("photo"));
  if (!p) {
    return NextResponse.json(
      { error: "Kein Platzhalter-Foto gefunden — lege eins unter public/brand-guide/instagram/ ab." },
      { status: 400 },
    );
  }

  const png = await renderPoster(SAMPLES[layout], p);
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
