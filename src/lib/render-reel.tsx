import { ImageResponse } from "next/og";
import {
  BRAND_COLORS,
  box,
  el,
  fitSize,
  kids,
  loadFonts,
  wappenDataUrl,
  wappenH,
  type El,
} from "./render-kit";

/**
 * Reel-Layer-Engine (9:16, 1080×1920).
 *
 * Ein Reel ist KEIN skalierter Feed-Post: Instagram und TikTok legen über das
 * untere Drittel (Caption, Buttons, Username) und über den rechten Rand ihre
 * eigene Bedienoberfläche. Deshalb ein eigenes Layout statt eines Crops der
 * 1024×1536-Templates — dort säße die Headline sonst unter dem Play-Button.
 *
 * Sicherer Bereich (beide Plattformen zusammen):
 *   y  240 – 1400   (oben Status/Profil, unten Caption + Buttons)
 *   x   90 –  900   (rechts die Aktions-Buttons)
 *
 * Gerendert werden nur TRANSPARENTE Layer — das Foto kommt in `reel.ts`
 * darunter und bewegt sich (Ken Burns). Deshalb hier nie ein Hintergrund auf
 * dem Wurzel-Element, sonst ist das Video eine Standbild-Diashow.
 */

export const REEL_W = 1080;
export const REEL_H = 1920;

/** Untere Grenze des sicheren Bereichs — darunter liegt die Plattform-UI. */
const SAFE_BOTTOM = 1400;
const MARGIN_X = 90;
const CONTENT_W = 810; // 1080 − 90 links − 180 rechts (Aktions-Buttons)

// Vertikaler Rhythmus, von der unteren Sicherheitsgrenze nach oben gerechnet:
// Domain-Zeile endet auf SAFE_BOTTOM, darüber der Button, darüber die Headline.
const CTA_PILL_H = 84;
const URL_BLOCK_H = 61; // Zeilenhöhe 39 + 22 Abstand
const CTA_TOP = SAFE_BOTTOM - (CTA_PILL_H + URL_BLOCK_H);
const HEADLINE_GAP = 72; // Luft zwischen Textblock und Button
const SCRIPT_RATIO = 0.86; // Schreibschrift relativ zur Headline
const SCRIPT_GAP = 18;
const CTA_FONT = 30;
const CTA_TRACKING = 1.6;
const CTA_PAD_X = 36;

export type ReelContent = {
  /** Versalien-Zeile neben dem Wappen, z. B. "HERSFELDER SCHÜTZENBEKLEIDUNG" */
  eyebrow?: string;
  /** Serifen-Headline mit festen Zeilenumbrüchen (max. 4 Zeilen sinnvoll) */
  headline: string[];
  /** Schreibschrift-Akzent unter der Headline */
  scriptLine?: string;
  /** Text im CTA-Button */
  cta?: string;
  /** Domain unter dem CTA */
  url?: string;
};

/** Die drei Ebenen, die nacheinander eingeblendet werden. */
export type ReelLayerKey = "base" | "headline" | "cta";

// ---------------------------------------------------------------------------
// Ebenen
// ---------------------------------------------------------------------------

/**
 * Ebene 1 — Abdunklung + Absender.
 *
 * Der Verlauf ist nicht Deko: ohne ihn ist heller Text auf einem hellen Foto
 * (Sommer, Festzelt) nicht lesbar. Oben und unten dunkel, Mitte offen, damit
 * das Foto sichtbar bleibt.
 */
function layerBase(c: ReelContent): El {
  return box({ position: "relative", width: REEL_W, height: REEL_H }, kids([
    // Verlauf oben
    box({
      position: "absolute",
      top: 0,
      left: 0,
      width: REEL_W,
      height: 640,
      backgroundImage: `linear-gradient(180deg, rgba(20,43,32,0.82) 0%, rgba(20,43,32,0.45) 45%, rgba(20,43,32,0) 100%)`,
    }),
    // Verlauf unten (trägt Headline + CTA)
    box({
      position: "absolute",
      top: 820,
      left: 0,
      width: REEL_W,
      height: REEL_H - 820,
      backgroundImage: `linear-gradient(180deg, rgba(20,43,32,0) 0%, rgba(20,43,32,0.62) 38%, rgba(20,43,32,0.92) 100%)`,
    }),
    // Wappen
    el("img", {
      src: wappenDataUrl(),
      width: 132,
      height: wappenH(132),
      style: { position: "absolute", left: MARGIN_X, top: 232, width: 132, height: wappenH(132) },
    }),
    // Absenderzeile neben dem Wappen
    c.eyebrow
      ? box(
          {
            position: "absolute",
            left: MARGIN_X + 132 + 28,
            top: 232 + Math.round(wappenH(132) / 2) - 34,
            width: CONTENT_W - 132 - 28,
            flexDirection: "column",
          },
          kids([
            el(
              "div",
              {
                style: {
                  fontFamily: "Montserrat",
                  fontWeight: 700,
                  fontSize: 30,
                  letterSpacing: 3.2,
                  lineHeight: 1.32,
                  color: BRAND_COLORS.creme,
                },
              },
              c.eyebrow.toUpperCase(),
            ),
            box({
              marginTop: 16,
              width: 92,
              height: 4,
              backgroundColor: BRAND_COLORS.rot,
            }),
          ]),
        )
      : null,
  ]));
}

/**
 * Ebene 2 — Headline.
 *
 * Sitzt bewusst über der unteren Sicherheitsgrenze. Der Schriftgrad wird an
 * die längste Zeile angepasst (`fitSize`), damit eine lange Headline nicht
 * umbricht und aus dem sicheren Bereich läuft.
 */
function layerHeadline(c: ReelContent): El {
  const lines = c.headline.filter(Boolean);
  const size = Math.round(fitSize(96, lines, 18, CONTENT_W));
  const lineH = Math.round(size * 1.16);
  const scriptH = c.scriptLine ? Math.round(size * SCRIPT_RATIO * 1.3) + SCRIPT_GAP : 0;
  const blockH = lines.length * lineH + scriptH;
  // Von unten aufgebaut: der Textblock endet mit festem Abstand über dem
  // CTA-Button. Vorher wurde die Höhe der Schreibschrift-Zeile zu klein
  // geschätzt — dadurch klebte "Seit Generationen." am Button.
  const top = Math.max(560, CTA_TOP - HEADLINE_GAP - blockH);

  return box({ position: "relative", width: REEL_W, height: REEL_H }, kids([
    box(
      { position: "absolute", left: MARGIN_X, top, width: CONTENT_W, flexDirection: "column" },
      kids([
        ...lines.map((line) =>
          el(
            "div",
            {
              style: {
                fontFamily: "Playfair Display",
                fontWeight: 600,
                fontSize: size,
                lineHeight: 1.16,
                color: BRAND_COLORS.weiss,
              },
            },
            line,
          ),
        ),
        c.scriptLine
          ? el(
              "div",
              {
                style: {
                  fontFamily: "Great Vibes",
                  fontWeight: 400,
                  fontSize: Math.round(size * SCRIPT_RATIO),
                  lineHeight: 1.3,
                  marginTop: SCRIPT_GAP,
                  color: BRAND_COLORS.creme,
                },
              },
              c.scriptLine,
            )
          : null,
      ]),
    ),
  ]));
}

/**
 * Ebene 3 — Handlungsaufforderung.
 *
 * Knapp über der Plattform-UI: tiefer wäre der Button vom Caption-Block
 * verdeckt, höher würde er in die Headline laufen.
 */
function layerCta(c: ReelContent): El {
  if (!c.cta && !c.url) return box({ width: REEL_W, height: REEL_H });
  const label = (c.cta ?? "").toUpperCase();

  // Button-Breite aus der tatsächlichen Textbreite. Montserrat 700 in
  // Versalien belegt rund 0.70 × Schriftgrad pro Zeichen, dazu die Laufweite.
  // Passt ein langer CTA ("Musterkollektion anfragen") nicht, wird die Schrift
  // verkleinert statt umgebrochen — ein zweizeiliger Button sprengt die Pille.
  const advance = (fs: number) => fs * 0.7 + CTA_TRACKING;
  const maxLabelW = CONTENT_W - 2 * CTA_PAD_X;
  let ctaFont = CTA_FONT;
  if (label.length * advance(ctaFont) > maxLabelW) {
    ctaFont = Math.max(20, Math.floor((maxLabelW / label.length - CTA_TRACKING) / 0.7));
  }
  const pillW = Math.min(
    CONTENT_W,
    Math.round(label.length * advance(ctaFont)) + 2 * CTA_PAD_X,
  );

  return box({ position: "relative", width: REEL_W, height: REEL_H }, kids([
    box(
      {
        position: "absolute",
        left: MARGIN_X,
        top: CTA_TOP,
        width: CONTENT_W,
        flexDirection: "column",
      },
      kids([
        c.cta
          ? box(
              {
                width: pillW,
                height: CTA_PILL_H,
                flexShrink: 0,
                borderRadius: CTA_PILL_H / 2,
                backgroundColor: BRAND_COLORS.rot,
                alignItems: "center",
                justifyContent: "center",
              },
              kids([
                el(
                  "div",
                  {
                    style: {
                      fontFamily: "Montserrat",
                      fontWeight: 700,
                      fontSize: ctaFont,
                      letterSpacing: CTA_TRACKING,
                      whiteSpace: "nowrap",
                      color: BRAND_COLORS.weiss,
                    },
                  },
                  label,
                ),
              ]),
            )
          : null,
        c.url
          ? el(
              "div",
              {
                style: {
                  fontFamily: "Inter",
                  fontWeight: 500,
                  fontSize: 30,
                  letterSpacing: 0.8,
                  marginTop: 22,
                  color: BRAND_COLORS.creme,
                },
              },
              c.url,
            )
          : null,
      ]),
    ),
  ]));
}

const LAYERS: Record<ReelLayerKey, (c: ReelContent) => El> = {
  base: layerBase,
  headline: layerHeadline,
  cta: layerCta,
};

/**
 * Rendert eine Reel-Ebene als transparentes PNG (1080×1920).
 * Der Alphakanal ist Absicht — `reel.ts` legt die Ebenen über das bewegte Foto.
 */
export async function renderReelLayer(layer: ReelLayerKey, content: ReelContent): Promise<Buffer> {
  const fonts = await loadFonts();
  const res = new ImageResponse(LAYERS[layer](content) as unknown as React.ReactElement, {
    width: REEL_W,
    height: REEL_H,
    fonts: fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
  });
  return Buffer.from(await res.arrayBuffer());
}
