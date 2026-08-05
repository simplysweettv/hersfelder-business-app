import { ImageResponse } from "next/og";
import {
  BRAND_COLORS,
  box,
  el,
  fitSize,
  icon,
  iconFilled,
  kids,
  loadFonts,
  wappenDataUrl,
  wappenH,
  type El,
  type IconKey,
} from "./render-kit";
import type { FeatureTile } from "./render-poster";

/**
 * Karussell-Engine (Juli 2026) — die Slides NACH dem Cover.
 *
 * Arbeitsteilung, bewusst so geschnitten:
 *  - Slide 1 (Cover) ist ein ganz normaler Feed-Post und wird deshalb von der
 *    Poster-Engine v3 gerendert (`renderPoster` mit `swipeHint`). Es bleibt bei
 *    EINER Feed-Engine — zwei konkurrierende Engines waren schon einmal die
 *    Ursache dafür, dass monatelang die falsche live war.
 *  - Diese Datei rendert nur die Folge-Slides. Die sieht man erst NACH dem
 *    Wischen, sie brauchen also kein Scroll-Stopper-Foto, sondern Ruhe,
 *    Lesbarkeit und einen klaren Rhythmus — klassischer Karussell-Aufbau.
 *
 * Die Marken-Regeln der v3 gelten trotzdem weiter:
 *  - Text steht auf einer HELLEN Marken-Fläche, nie helle Schrift auf Dunkel.
 *  - Grün ist Akzent (Zahl, Linie, CTA-Feld), NIE Flächen-Hintergrund. Genau
 *    dieser grüne Verlaufs-Look war der Grund, warum das alte Karussell
 *    (Slides = Typo auf grünem Verlauf) wieder ausgebaut wurde.
 *
 * Canvas 1024×1280 = 4:5, identisch zum Cover — Instagram schneidet sonst
 * einzelne Slides anders zu als das Cover.
 */

const W = 1024;
const H = 1280;

export type CarouselPointSlide = {
  kind: "punkt";
  /** Laufende Nummer im Karussell-Inhalt (1 = erste Inhalts-Slide) */
  number: number;
  icon?: IconKey;
  kicker?: string;
  /** Fest umbrochene Zeilen */
  heading: string[];
  body?: string;
};

export type CarouselOutroSlide = {
  kind: "abschluss";
  heading: string[];
  scriptAccent?: string;
  cta: { title: string; sub?: string };
  benefits?: FeatureTile[];
  url?: string;
};

export type CarouselSlide = CarouselPointSlide | CarouselOutroSlide;

// ---------------------------------------------------------------------------
// Gemeinsamer Rahmen
// ---------------------------------------------------------------------------

/** Creme-Fläche + feine Kopfleiste in Wappenrot — auf jeder Slide gleich. */
function frame(children: (El | null | undefined | false)[]): El {
  return box(
    { position: "relative", width: W, height: H, backgroundColor: BRAND_COLORS.cremeHell, fontFamily: "Inter" },
    kids([box({ position: "absolute", left: 0, top: 0, width: W, height: 6, backgroundColor: BRAND_COLORS.rot }), ...children]),
  );
}

function wappenSmall(width = 84): El {
  return el("img", {
    src: wappenDataUrl(),
    width,
    height: wappenH(width),
    style: { position: "absolute", left: 64, top: 62, width, height: wappenH(width) },
  });
}

/** Seitenzähler unten rechts — die klassische Karussell-Orientierung. */
function counter(index: number, total: number): El {
  return box(
    {
      position: "absolute",
      right: 64,
      top: H - 84,
      fontFamily: "Montserrat",
      fontWeight: 600,
      fontSize: 20,
      letterSpacing: 2,
      color: "rgba(90,97,89,0.75)",
    },
    `${index} / ${total}`,
  );
}

const serifLines = (lines: string[], size: number, color: string, lineHeight = 1.16): El =>
  box(
    { flexDirection: "column" },
    lines.map((l) =>
      box({ fontFamily: "Playfair Display", fontWeight: 600, fontSize: size, lineHeight, color, whiteSpace: "nowrap" }, l),
    ),
  );

const kickerEl = (text: string, color: string, size = 19): El =>
  box(
    {
      fontFamily: "Montserrat",
      fontWeight: 700,
      fontSize: size,
      letterSpacing: Math.round(size * 0.24),
      textTransform: "uppercase",
      color,
    },
    text,
  );

// ---------------------------------------------------------------------------
// 1 — PUNKT-SLIDE (der Arbeiter des Karussells)
// ---------------------------------------------------------------------------

function punktSlide(s: CarouselPointSlide, index: number, total: number): El {
  const heading = s.heading.slice(0, 3);
  const hlSize = fitSize(62, heading, 22, 856);

  return frame([
    wappenSmall(),
    // Große Ordnungszahl als ruhiger Hintergrund-Akzent — gibt dem Karussell
    // den Takt, ohne mit der Headline um Aufmerksamkeit zu konkurrieren.
    box(
      {
        position: "absolute",
        right: 56,
        top: 96,
        fontFamily: "Playfair Display",
        fontWeight: 600,
        fontSize: 230,
        lineHeight: 1,
        color: "rgba(30,59,44,0.10)",
      },
      String(s.number).padStart(2, "0"),
    ),
    // Der Inhalt sitzt optisch mittig statt auf fester Höhe — sonst hängt eine
    // kurze Slide oben und lässt das untere Drittel leer.
    box({
      position: "absolute",
      left: 64,
      top: 0,
      width: W - 128,
      height: H,
      flexDirection: "column",
      justifyContent: "center",
    }, kids([
      s.icon ? box({ marginBottom: 26 }, icon(s.icon, 54, BRAND_COLORS.gruen500, 1.7)) : null,
      s.kicker ? box({ marginBottom: 18 }, kickerEl(s.kicker, BRAND_COLORS.gruen500)) : null,
      serifLines(heading, hlSize, BRAND_COLORS.ink),
      box({ marginTop: 30, width: 96, height: 5, backgroundColor: BRAND_COLORS.rot }),
      s.body
        ? box({ marginTop: 30, fontSize: 30, color: BRAND_COLORS.copy, lineHeight: 1.5, width: 830 }, s.body)
        : null,
    ])),
    counter(index, total),
  ]);
}

// ---------------------------------------------------------------------------
// 2 — ABSCHLUSS-SLIDE (Fazit + CTA + Beweise)
// ---------------------------------------------------------------------------

function abschlussSlide(s: CarouselOutroSlide, index: number, total: number): El {
  const heading = s.heading.slice(0, 3);
  const hlSize = fitSize(56, heading, 22, 840);
  const benefits = (s.benefits ?? []).slice(0, 3);

  return frame([
    box({ position: "absolute", top: 156, left: 0, width: W, flexDirection: "column", alignItems: "center" }, kids([
      el("img", { src: wappenDataUrl(), width: 116, height: wappenH(116), style: { width: 116, height: wappenH(116) } }),
      box({ marginTop: 40, flexDirection: "column", alignItems: "center" },
        heading.map((l) =>
          box(
            { fontFamily: "Playfair Display", fontWeight: 600, fontSize: hlSize, lineHeight: 1.18, color: BRAND_COLORS.ink, whiteSpace: "nowrap" },
            l,
          ),
        )),
      s.scriptAccent
        ? box(
            {
              marginTop: 8,
              fontFamily: "Great Vibes",
              fontSize: fitSize(66, [s.scriptAccent], 24, 840),
              color: BRAND_COLORS.gruen700,
              whiteSpace: "nowrap",
            },
            s.scriptAccent,
          )
        : null,
      box({ marginTop: 22, opacity: 0.9 }, iconFilled("heart", 26, BRAND_COLORS.rot)),
    ])),

    // CTA — dasselbe grüne Feld mit Goldkante wie auf den Produkt-Plakaten.
    box(
      {
        position: "absolute",
        left: 88,
        top: 758,
        width: W - 176,
        backgroundColor: BRAND_COLORS.gruen700,
        boxShadow: "0 8px 22px rgba(20,43,32,0.28)",
      },
      kids([
        box({ width: 8, backgroundColor: BRAND_COLORS.gold }),
        box({ flexDirection: "column", paddingTop: 26, paddingBottom: 26, paddingLeft: 30, paddingRight: 30 }, kids([
          box(
            { fontFamily: "Montserrat", fontWeight: 700, fontSize: fitSize(28, [s.cta.title], 34, 760), color: BRAND_COLORS.weiss },
            s.cta.title,
          ),
          s.cta.sub
            ? box({ marginTop: 9, fontSize: 21, color: "rgba(245,240,230,0.84)", lineHeight: 1.35, width: 760 }, s.cta.sub)
            : null,
        ])),
      ]),
    ),

    // Beweis-Trio: dieselben Marken-Konstanten wie in der grünen Benefit-Leiste.
    benefits.length
      ? box(
          { position: "absolute", left: 64, right: 64, top: 1000, width: W - 128, justifyContent: "space-between" },
          kids(
            benefits.map((b) =>
              box({ width: 288, flexDirection: "column", alignItems: "center" }, kids([
                icon(b.icon, 36, BRAND_COLORS.gruen500),
                box(
                  {
                    marginTop: 14,
                    fontFamily: "Montserrat",
                    fontWeight: 700,
                    fontSize: 17,
                    letterSpacing: 1.8,
                    textTransform: "uppercase",
                    color: BRAND_COLORS.gruen500,
                    textAlign: "center",
                    justifyContent: "center",
                    width: 276,
                  },
                  b.title,
                ),
              ])),
            ),
          ),
        )
      : null,

    s.url
      ? box(
          {
            position: "absolute",
            left: 64,
            top: H - 84,
            fontFamily: "Montserrat",
            fontWeight: 600,
            fontSize: 19,
            letterSpacing: 1.6,
            color: BRAND_COLORS.gruen500,
          },
          s.url,
        )
      : null,
    counter(index, total),
  ]);
}

// ---------------------------------------------------------------------------
// Einstieg
// ---------------------------------------------------------------------------

/** Rendert EINE Folge-Slide (1024×1280 PNG). Das Cover läuft über `renderPoster`. */
export async function renderCarouselSlide(slide: CarouselSlide, index: number, total: number): Promise<Buffer> {
  const element = slide.kind === "punkt" ? punktSlide(slide, index, total) : abschlussSlide(slide, index, total);
  const fonts = await loadFonts();
  const res = new ImageResponse(element as unknown as React.ReactElement, {
    width: W,
    height: H,
    fonts: fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
  });
  return Buffer.from(await res.arrayBuffer());
}

/** Alle gerenderten Textzeilen einer Slide (für das QA-Gate). */
export function slideTextOf(slide: CarouselSlide): string {
  const parts =
    slide.kind === "punkt"
      ? [slide.kicker, ...slide.heading, slide.body]
      : [
          ...slide.heading,
          slide.scriptAccent,
          slide.cta.title,
          slide.cta.sub,
          ...(slide.benefits ?? []).map((b) => b.title),
          slide.url,
        ];
  return parts.filter(Boolean).join(" | ");
}
