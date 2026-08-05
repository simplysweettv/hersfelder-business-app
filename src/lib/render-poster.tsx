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

/**
 * Poster-Engine v3 (Juli 2026) — der Referenz-Look des echten Accounts.
 *
 * Vorgeschichte: v2 hatte „Plakat/Foto/Typo" — darunter zwei Typo-Layouts ganz
 * OHNE Foto (Text auf grünem Verlauf) und ein Plakat mit ganzflächigem grünem
 * Schleier. Ergebnis im Feed: zu oft einfach nur ein grüner Hintergrund.
 * v3 baut stattdessen exakt den Aufbau der Vorbild-Posts nach:
 *
 *   Foto trägt das Bild · Text sitzt auf einer HELLEN Marken-Fläche ·
 *   Serifen-Headline in Dunkelgrün · farbige Trennlinie · Benefit-/Fußleiste
 *
 * Harte Regeln dieser Engine:
 *  1. JEDER Post hat ein echtes Foto — es gibt keinen Layout-Pfad ohne Bild
 *     und keinen Farbverlauf als Ersatz. Fehlt das Foto, scheitert der Render.
 *  2. Text steht nie als helle Schrift auf abgedunkeltem Foto, sondern immer
 *     auf Creme — dadurch ist er auf jedem Motiv gleich gut lesbar.
 *  3. Grün ist Akzent (Leiste, CTA-Feld), nie Bildhintergrund.
 *
 * Canvas 1024×1280 = 4:5. Das ist exakt das Format, das Instagram im Feed
 * zeigt — anders als früher (2:3) wird nichts mehr wegge­croppt, und das
 * Bild sieht auf Facebook/LinkedIn/TikTok genauso aus wie im Feed.
 */

const W = 1024;
const H = 1280;

export { BRAND_COLORS };

export type PosterLayoutKey =
  | "panel-links" // Produkt: Creme-Panel links + grüne Benefit-Leiste   (Vorbild „Damenweste")
  | "panel-cta" // Produkt: heller Wash + CTA-Feld + helle Fußleiste     (Vorbild „Ins Schwitzen")
  | "zentral-minimal" // Emotional: zentriert, Serife + Schreibschrift   (Vorbild „Gemeinsam heute")
  | "karte-unten" // Emotional: Creme-Karte unten links über dem Foto
  | "band-unten"; // Beide: Foto oben, Creme-Band unten

export type FeatureTile = { icon: IconKey; title: string; text: string };
export type FooterNote = { icon: IconKey; label: string };

export type PosterContent = {
  layout: PosterLayoutKey;
  /** Kleine Versalien-Zeile über der Headline */
  kicker?: string;
  /** Die Plakat-Headline, Zeilen fest umbrochen */
  headline?: string[];
  /** Schreibschrift-Akzentzeile */
  scriptAccent?: string;
  /** Ruhige Begleitzeile unter der Trennlinie */
  sub?: string;
  /** Fließtext im Panel (nur panel-cta) */
  copy?: string;
  /** Versalien-Zeile unter dem Wappen (nur panel-cta) */
  tagline?: string;
  /** Handlungsaufforderung im dunkelgrünen Feld (nur panel-cta) */
  cta?: { title: string; sub?: string };
  /** Genau 3 Benefit-Kacheln für die grüne Leiste (nur panel-links) */
  features?: FeatureTile[];
  /** Icon-/Label-Paare der hellen Fußleiste (nur panel-cta) */
  footerNotes?: FooterNote[];
  /** Icon über der Headline (z. B. "sun" beim Hitze-Aufhänger) */
  accentIcon?: IconKey;
  url?: string;
  /**
   * Wisch-Hinweis am rechten Bildrand — nur für Karussell-Cover.
   * Sitzt bewusst mittig rechts: dort liegt in JEDEM Layout Foto und nie eine
   * Leiste, ein CTA-Feld oder die Adresse.
   */
  swipeHint?: string;
};

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

/**
 * Das Foto als Vollflächen-Ebene. Bewusst OHNE Fallback: Ein Post ohne Foto
 * ist in dieser Marke kein gültiger Post — lieber laut scheitern (der Cron
 * fängt den Fehler und versucht es erneut) als still ein Farbfeld ausliefern.
 */
function photoLayer(photoDataUrl: string): El {
  return el("img", {
    src: photoDataUrl,
    width: W,
    height: H,
    style: { position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover" },
  });
}

function wappenImg(left: number, top: number, width: number, centered = false): El {
  const style: Record<string, unknown> = { position: "absolute", top, width, height: wappenH(width) };
  if (centered) style.left = Math.round((W - width) / 2);
  else style.left = left;
  return el("img", { src: wappenDataUrl(), width, height: wappenH(width), style });
}

/** Weiche Aufhellung hinter einem freistehenden Wappen — auf jedem Motiv lesbar. */
function wappenVignette(top: number, left: number): El {
  return box({
    position: "absolute",
    top: top - 60,
    left: left - 60,
    width: 360,
    height: 360,
    backgroundImage: "radial-gradient(circle at 32% 30%, rgba(245,240,230,0.62), rgba(245,240,230,0) 68%)",
  });
}

const kickerEl = (text: string, color: string, size = 20): El =>
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

const rule = (color: string, width = 88, height = 4): El => box({ width, height, backgroundColor: color });

const serifLines = (lines: string[], size: number, color: string, lineHeight = 1.15): El =>
  box(
    { flexDirection: "column" },
    lines.map((l) =>
      box({ fontFamily: "Playfair Display", fontWeight: 600, fontSize: size, lineHeight, color, whiteSpace: "nowrap" }, l),
    ),
  );

// ---------------------------------------------------------------------------
// 1 — PANEL-LINKS  (Vorbild „Die Damenweste für alle, die …")
// ---------------------------------------------------------------------------

function panelLinks(c: PosterContent, photo: string): El {
  const headline = (c.headline ?? []).slice(0, 5);
  const hlSize = fitSize(56, headline, 14, 372);
  const features = (c.features ?? []).slice(0, 3);
  const barTop = features.length ? 1092 : H;

  return box({ position: "relative", width: W, height: H, fontFamily: "Inter" }, kids([
    photoLayer(photo),
    // Creme-Panel links, danach weicher Übergang ins Foto
    box({ position: "absolute", left: 0, top: 0, width: 448, height: barTop, backgroundColor: BRAND_COLORS.creme }),
    box({
      position: "absolute",
      left: 448,
      top: 0,
      width: 168,
      height: barTop,
      backgroundImage: `linear-gradient(to right, ${BRAND_COLORS.creme}, rgba(245,240,230,0))`,
    }),
    wappenImg(60, 76, 128),
    box({ position: "absolute", left: 60, top: 300, width: 380, flexDirection: "column" }, kids([
      c.kicker ? box({ marginBottom: 20 }, kickerEl(c.kicker, BRAND_COLORS.gruen500, 19)) : null,
      serifLines(headline, hlSize, BRAND_COLORS.ink, 1.16),
      box({ marginTop: 28 }, rule(BRAND_COLORS.rot)),
      c.sub
        ? box(
            { marginTop: 24, fontSize: 24, fontWeight: 400, color: BRAND_COLORS.inkSoft, lineHeight: 1.45, width: 356 },
            c.sub,
          )
        : null,
    ])),
    // Grüne Benefit-Leiste (Bleed bis zur Unterkante)
    features.length
      ? box(
          {
            position: "absolute",
            left: 0,
            top: barTop,
            width: W,
            height: H - barTop,
            backgroundColor: BRAND_COLORS.gruen700,
            alignItems: "center",
            justifyContent: "center",
          },
          kids(
            features.map((f, i) =>
              box({ width: 316, flexDirection: "column", alignItems: "center" }, kids([
                // dünne Trennlinie zwischen den Kacheln, wie im Vorbild
                i > 0
                  ? box({ position: "absolute", left: 0, top: 26, width: 1, height: 120, backgroundColor: "rgba(245,240,230,0.24)" })
                  : null,
                icon(f.icon, 42, "rgba(245,240,230,0.92)"),
                box(
                  {
                    marginTop: 16,
                    fontFamily: "Montserrat",
                    fontWeight: 700,
                    fontSize: 19,
                    letterSpacing: 2.4,
                    color: BRAND_COLORS.creme,
                    textTransform: "uppercase",
                    textAlign: "center",
                    justifyContent: "center",
                    width: 292,
                  },
                  f.title,
                ),
                box(
                  {
                    marginTop: 9,
                    fontSize: 17,
                    color: "rgba(245,240,230,0.74)",
                    textAlign: "center",
                    justifyContent: "center",
                    width: 280,
                    lineHeight: 1.32,
                  },
                  f.text,
                ),
              ])),
            ),
          ),
        )
      : null,
  ]));
}

// ---------------------------------------------------------------------------
// 2 — PANEL-CTA  (Vorbild „Wenn andere ins Schwitzen kommen.")
// ---------------------------------------------------------------------------

function panelCta(c: PosterContent, photo: string): El {
  const headline = (c.headline ?? []).slice(0, 4);
  const hlSize = fitSize(52, headline, 16, 512);
  const notes = (c.footerNotes ?? []).slice(0, 2);
  const footTop = 1150;

  return box({ position: "relative", width: W, height: H, fontFamily: "Inter" }, kids([
    photoLayer(photo),
    // Heller Wash von links — Foto bleibt rechts sichtbar
    box({
      position: "absolute",
      left: 0,
      top: 0,
      width: 720,
      height: footTop,
      backgroundImage:
        "linear-gradient(to right, rgba(251,248,242,0.97) 0%, rgba(251,248,242,0.94) 46%, rgba(251,248,242,0) 100%)",
    }),
    wappenImg(60, 72, 118),
    // Tagline unter dem Wappen + feine Regel (wie im Vorbild)
    c.tagline
      ? box({ position: "absolute", left: 60, top: 72 + wappenH(118) + 16, flexDirection: "column" }, kids([
          kickerEl(c.tagline, BRAND_COLORS.gruen500, 17),
          box({ marginTop: 12 }, rule("rgba(46,89,65,0.35)", 208, 2)),
        ]))
      : null,
    box({ position: "absolute", left: 60, top: 400, width: 540, flexDirection: "column" }, kids([
      c.accentIcon ? box({ marginBottom: 18 }, icon(c.accentIcon, 46, BRAND_COLORS.gold, 2)) : null,
      c.kicker ? box({ marginBottom: 18 }, kickerEl(c.kicker, BRAND_COLORS.gruen500, 19)) : null,
      serifLines(headline, hlSize, BRAND_COLORS.ink, 1.14),
      box({ marginTop: 26 }, rule(BRAND_COLORS.gold, 78)),
      c.copy
        ? box({ marginTop: 24, fontSize: 24, color: BRAND_COLORS.copy, lineHeight: 1.5, width: 500 }, c.copy)
        : null,
      c.cta
        ? box(
            {
              marginTop: 34,
              width: 520,
              backgroundColor: BRAND_COLORS.gruen700,
              boxShadow: "0 8px 22px rgba(20,43,32,0.28)",
            },
            kids([
              box({ width: 8, backgroundColor: BRAND_COLORS.gold }),
              box({ flexDirection: "column", paddingTop: 22, paddingBottom: 22, paddingLeft: 26, paddingRight: 26 }, kids([
                box(
                  {
                    fontFamily: "Montserrat",
                    fontWeight: 700,
                    fontSize: fitSize(23, [c.cta.title], 34, 448),
                    color: BRAND_COLORS.weiss,
                  },
                  c.cta.title,
                ),
                c.cta.sub
                  ? box({ marginTop: 7, fontSize: 19, color: "rgba(245,240,230,0.82)", lineHeight: 1.35, width: 448 }, c.cta.sub)
                  : null,
              ])),
            ]),
          )
        : null,
    ])),
    // Helle Fußleiste mit Mikro-Beweisen + Adresse
    box(
      {
        position: "absolute",
        left: 0,
        top: footTop,
        width: W,
        height: H - footTop,
        backgroundColor: BRAND_COLORS.cremeHell,
        alignItems: "center",
        paddingLeft: 60,
        paddingRight: 60,
        justifyContent: "space-between",
      },
      kids([
        box(
          { alignItems: "center" },
          kids(
            notes.map((n, i) =>
              box({ alignItems: "center", marginLeft: i > 0 ? 40 : 0 }, kids([
                icon(n.icon, 30, BRAND_COLORS.gruen500),
                box(
                  {
                    marginLeft: 12,
                    fontFamily: "Montserrat",
                    fontWeight: 600,
                    fontSize: 15,
                    letterSpacing: 1.4,
                    color: BRAND_COLORS.gruen500,
                    textTransform: "uppercase",
                    width: 190,
                    lineHeight: 1.3,
                  },
                  n.label,
                ),
              ])),
            ),
          ),
        ),
        c.url
          ? box(
              { fontFamily: "Montserrat", fontWeight: 600, fontSize: 18, letterSpacing: 1.4, color: BRAND_COLORS.gruen500 },
              c.url,
            )
          : null,
      ]),
    ),
  ]));
}

// ---------------------------------------------------------------------------
// 3 — ZENTRAL-MINIMAL  (Vorbild „Gemeinsam heute. / Tradition für morgen.")
// ---------------------------------------------------------------------------

function zentralMinimal(c: PosterContent, photo: string): El {
  const headline = (c.headline ?? []).slice(0, 2);
  const hlSize = fitSize(56, headline, 22, 880);

  return box({ position: "relative", width: W, height: H, fontFamily: "Inter" }, kids([
    photoLayer(photo),
    // Heller Lesbarkeits-Verlauf oben — das Foto bleibt unten voll sichtbar
    box({
      position: "absolute",
      top: 0,
      left: 0,
      width: W,
      height: 620,
      backgroundImage:
        "linear-gradient(to bottom, rgba(245,240,230,0.80) 0%, rgba(245,240,230,0.46) 52%, rgba(245,240,230,0) 100%)",
    }),
    box({ position: "absolute", top: 96, left: 0, width: W, flexDirection: "column", alignItems: "center" }, kids([
      el("img", { src: wappenDataUrl(), width: 100, height: wappenH(100), style: { width: 100, height: wappenH(100) } }),
      c.kicker ? box({ marginTop: 26 }, kickerEl(c.kicker, BRAND_COLORS.gruen500, 18)) : null,
      box(
        { marginTop: c.kicker ? 18 : 30, flexDirection: "column", alignItems: "center" },
        headline.map((l) =>
          box(
            {
              fontFamily: "Playfair Display",
              fontWeight: 600,
              fontSize: hlSize,
              lineHeight: 1.18,
              color: BRAND_COLORS.ink,
              textShadow: "0 1px 20px rgba(245,240,230,0.9)",
              whiteSpace: "nowrap",
            },
            l,
          ),
        ),
      ),
      c.scriptAccent
        ? box(
            {
              marginTop: 6,
              fontFamily: "Great Vibes",
              fontWeight: 400,
              fontSize: fitSize(80, [c.scriptAccent], 24, 900),
              color: BRAND_COLORS.gruen700,
              textShadow: "0 1px 20px rgba(245,240,230,0.9)",
              whiteSpace: "nowrap",
            },
            c.scriptAccent,
          )
        : null,
      box({ marginTop: 20, opacity: 0.9 }, iconFilled("heart", 28, BRAND_COLORS.rot)),
    ])),
  ]));
}

// ---------------------------------------------------------------------------
// 4 — KARTE-UNTEN  (Creme-Karte unten links über vollflächigem Foto)
// ---------------------------------------------------------------------------

function karteUnten(c: PosterContent, photo: string): El {
  const headline = (c.headline ?? []).slice(0, 3);
  const hlSize = fitSize(46, headline, 17, 476);

  return box({ position: "relative", width: W, height: H, fontFamily: "Inter" }, kids([
    photoLayer(photo),
    wappenVignette(72, 60),
    wappenImg(60, 72, 104),
    box(
      {
        position: "absolute",
        left: 56,
        top: 806,
        width: 592,
        flexDirection: "column",
        backgroundColor: "rgba(251,248,242,0.97)",
        paddingTop: 40,
        paddingBottom: 40,
        paddingLeft: 42,
        paddingRight: 42,
      },
      kids([
        box({ position: "absolute", left: 0, top: 0, width: 6, height: 999, backgroundColor: BRAND_COLORS.rot }),
        c.kicker ? box({ marginBottom: 18 }, kickerEl(c.kicker, BRAND_COLORS.gruen500, 18)) : null,
        serifLines(headline, hlSize, BRAND_COLORS.ink, 1.16),
        c.scriptAccent
          ? box(
              {
                marginTop: 8,
                fontFamily: "Great Vibes",
                fontSize: fitSize(58, [c.scriptAccent], 22, 476),
                color: BRAND_COLORS.gruen700,
                whiteSpace: "nowrap",
              },
              c.scriptAccent,
            )
          : null,
        c.sub
          ? box({ marginTop: 22, fontSize: 21, color: BRAND_COLORS.inkSoft, lineHeight: 1.45, width: 480 }, c.sub)
          : null,
        c.url
          ? box(
              {
                marginTop: 22,
                fontFamily: "Montserrat",
                fontWeight: 600,
                fontSize: 17,
                letterSpacing: 1.6,
                color: BRAND_COLORS.gruen500,
              },
              c.url,
            )
          : null,
      ]),
    ),
  ]));
}

// ---------------------------------------------------------------------------
// 5 — BAND-UNTEN  (Foto oben, Creme-Band unten)
// ---------------------------------------------------------------------------

function bandUnten(c: PosterContent, photo: string): El {
  const headline = (c.headline ?? []).slice(0, 3);
  const hlSize = fitSize(52, headline, 18, 880);
  const bandTop = 872;

  return box({ position: "relative", width: W, height: H, fontFamily: "Inter" }, kids([
    // Foto oben (eigener Ausschnitt, damit unten nichts durchscheint)
    box({ position: "absolute", top: 0, left: 0, width: W, height: bandTop, overflow: "hidden" },
      el("img", { src: photo, width: W, height: H, style: { width: W, height: H, objectFit: "cover" } })),
    box({ position: "absolute", left: 0, top: bandTop, width: W, height: H - bandTop, backgroundColor: BRAND_COLORS.cremeHell }),
    box({ position: "absolute", left: 0, top: bandTop, width: W, height: 5, backgroundColor: BRAND_COLORS.rot }),
    wappenVignette(72, 60),
    wappenImg(60, 72, 100),
    box({ position: "absolute", left: 64, right: 64, top: bandTop + 48, flexDirection: "column" }, kids([
      c.kicker ? box({ marginBottom: 16 }, kickerEl(c.kicker, BRAND_COLORS.gruen500, 18)) : null,
      serifLines(headline, hlSize, BRAND_COLORS.ink, 1.14),
      c.scriptAccent
        ? box(
            {
              marginTop: 8,
              fontFamily: "Great Vibes",
              fontSize: fitSize(64, [c.scriptAccent], 22, 860),
              color: BRAND_COLORS.gruen700,
              whiteSpace: "nowrap",
            },
            c.scriptAccent,
          )
        : null,
      // Breite bewusst kleiner als das Band: rechts unten steht die Adresse,
      // eine lange Subline darf ihr nie in die Zeile laufen.
      c.sub
        ? box({ marginTop: 20, fontSize: 22, color: BRAND_COLORS.inkSoft, lineHeight: 1.45, width: 630 }, c.sub)
        : null,
    ])),
    c.url
      ? box(
          {
            position: "absolute",
            right: 64,
            top: H - 72,
            fontFamily: "Montserrat",
            fontWeight: 600,
            fontSize: 17,
            letterSpacing: 1.6,
            color: BRAND_COLORS.gruen500,
          },
          c.url,
        )
      : null,
  ]));
}

// ---------------------------------------------------------------------------
// Einstieg
// ---------------------------------------------------------------------------

/**
 * Wisch-Pille für Karussell-Cover: helle Marken-Fläche mit grünem Pfeil, mittig
 * am rechten Rand. Ohne diesen Hinweis wischt kaum jemand weiter — der Rest des
 * Karussells bliebe ungesehen.
 */
function swipePill(text: string): El {
  return box(
    {
      position: "absolute",
      right: 40,
      top: Math.round(H / 2) - 32,
      alignItems: "center",
      backgroundColor: BRAND_COLORS.cremeHell,
      paddingTop: 14,
      paddingBottom: 14,
      paddingLeft: 24,
      paddingRight: 22,
      borderRadius: 999,
      boxShadow: "0 6px 20px rgba(20,43,32,0.28)",
    },
    kids([
      box(
        {
          fontFamily: "Montserrat",
          fontWeight: 700,
          fontSize: 18,
          letterSpacing: 2.6,
          textTransform: "uppercase",
          color: BRAND_COLORS.gruen500,
        },
        text,
      ),
      box({ marginLeft: 12 }, icon("arrow-right", 26, BRAND_COLORS.rot, 2.4)),
    ]),
  );
}

const LAYOUTS: Record<PosterLayoutKey, (c: PosterContent, photo: string) => El> = {
  "panel-links": panelLinks,
  "panel-cta": panelCta,
  "zentral-minimal": zentralMinimal,
  "karte-unten": karteUnten,
  "band-unten": bandUnten,
};

export const POSTER_LAYOUT_KEYS = Object.keys(LAYOUTS) as PosterLayoutKey[];

/**
 * Rendert einen designten Post (1024×1280 PNG, 4:5) aus Plakat-Inhalt + Foto.
 * `photoDataUrl` ist PFLICHT — ein Post ohne Foto ist kein gültiger Post.
 */
export async function renderPoster(content: PosterContent, photoDataUrl: string): Promise<Buffer> {
  if (!photoDataUrl) {
    throw new Error("renderPoster: Foto fehlt — die Poster-Engine rendert keine Posts ohne Bild.");
  }
  const build = LAYOUTS[content.layout];
  if (!build) throw new Error(`renderPoster: unbekanntes Layout „${content.layout}".`);

  const fonts = await loadFonts();
  const layout = build(content, photoDataUrl);
  // Der Wisch-Hinweis liegt bewusst ÜBER dem fertigen Layout, statt in jedem
  // der fünf Layouts einzeln eingebaut zu werden.
  const element = content.swipeHint
    ? box({ position: "relative", width: W, height: H }, kids([layout, swipePill(content.swipeHint)]))
    : layout;
  const res = new ImageResponse(element as unknown as React.ReactElement, {
    width: W,
    height: H,
    fonts: fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
  });
  return Buffer.from(await res.arrayBuffer());
}

/** Alle gerenderten Textzeilen eines Posts (für das QA-Gate). */
export function renderedTextOf(content: PosterContent): string {
  return [
    content.kicker,
    ...(content.headline ?? []),
    content.scriptAccent,
    content.sub,
    content.copy,
    content.tagline,
    content.cta?.title,
    content.cta?.sub,
    ...(content.features ?? []).flatMap((f) => [f.title, f.text]),
    ...(content.footerNotes ?? []).map((n) => n.label),
    content.url,
    content.swipeHint,
  ]
    .filter(Boolean)
    .join(" | ");
}
