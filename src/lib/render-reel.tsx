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
} from "./render-post";

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
  const blockH = lines.length * lineH + (c.scriptLine ? Math.round(size * 0.9) : 0);
  const top = Math.max(700, SAFE_BOTTOM - 190 - blockH);

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
                  fontSize: Math.round(size * 0.86),
                  lineHeight: 1.3,
                  marginTop: 10,
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
  const pillW = Math.min(CONTENT_W, 72 + label.length * 19);

  return box({ position: "relative", width: REEL_W, height: REEL_H }, kids([
    box(
      {
        position: "absolute",
        left: MARGIN_X,
        top: SAFE_BOTTOM - 128,
        width: CONTENT_W,
        flexDirection: "column",
      },
      kids([
        c.cta
          ? box(
              {
                width: pillW,
                height: 84,
                borderRadius: 42,
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
                      fontSize: 30,
                      letterSpacing: 1.6,
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
