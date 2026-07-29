import fs from "node:fs";
import path from "node:path";
import { BRAND_ICONS, type IconKey } from "./brand-icons";

/**
 * Gemeinsames Render-Werkzeug für alle Satori-Layouts (Feed-Poster + Reel).
 *
 * Hier liegen nur die Bausteine — Farben, Fonts, Wappen, Element-Helfer,
 * Icons, Schriftgrad-Anpassung. Die eigentlichen Layouts stehen in
 * `render-poster.tsx` (Feed) bzw. `render-reel.tsx` (9:16).
 *
 * Vorher lagen diese Bausteine in `render-post.tsx` — zusammen mit einer
 * ZWEITEN, konkurrierenden Layout-Engine. Dass zwei Engines nebeneinander
 * standen, war die Ursache dafür, dass monatelang die falsche live war.
 */

// Markenfarben (aus Wappen + Brand-Guide abgeleitet)
export const BRAND_COLORS = {
  gruen900: "#142B20",
  gruen700: "#1E3B2C", // Markengrün: Leisten, CTA-Feld
  gruen500: "#1A4C2A", // Jagdgrün (Brand-Guide)
  gruen300: "#2E5941",
  creme: "#F5F0E6",
  cremeHell: "#FBF8F2",
  weiss: "#FFFFFF",
  rot: "#CB212E", // Wappenrot (aus Logo gemessen)
  gold: "#C9A227", // Akzentlinie der Produkt-Plakate
  ink: "#1B2A22", // Headline-Dunkel (grünstichig, nie #000)
  inkSoft: "#5A6159",
  copy: "#33403A",
} as const;

// ---------------------------------------------------------------------------
// Fonts + Wappen (lazy, pro Lambda-Instanz einmal geladen)
// ---------------------------------------------------------------------------

export type FontSpec = { name: string; data: Buffer; weight: 400 | 500 | 600 | 700; style: "normal" };

let fontsPromise: Promise<FontSpec[]> | null = null;
export function loadFonts(): Promise<FontSpec[]> {
  if (!fontsPromise) {
    fontsPromise = (async () => {
      const dir = path.join(process.cwd(), "src", "assets", "fonts");
      const read = (f: string) => fs.promises.readFile(path.join(dir, f));
      const [playfair, vibes, mont600, mont700, inter400, inter500, inter700] = await Promise.all([
        read("playfairdisplay-600.ttf"),
        read("greatvibes-400.ttf"),
        read("montserrat-600.ttf"),
        read("montserrat-700.ttf"),
        read("inter-400.ttf"),
        read("inter-500.ttf"),
        read("inter-700.ttf"),
      ]);
      return [
        { name: "Playfair Display", data: playfair, weight: 600, style: "normal" },
        { name: "Great Vibes", data: vibes, weight: 400, style: "normal" },
        { name: "Montserrat", data: mont600, weight: 600, style: "normal" },
        { name: "Montserrat", data: mont700, weight: 700, style: "normal" },
        { name: "Inter", data: inter400, weight: 400, style: "normal" },
        { name: "Inter", data: inter500, weight: 500, style: "normal" },
        { name: "Inter", data: inter700, weight: 700, style: "normal" },
      ] as FontSpec[];
    })();
  }
  return fontsPromise;
}

let wappenCache: string | null = null;
export function wappenDataUrl(): string {
  if (!wappenCache) {
    const buf = fs.readFileSync(path.join(process.cwd(), "src", "assets", "brand", "wappen.png"));
    wappenCache = `data:image/png;base64,${buf.toString("base64")}`;
  }
  return wappenCache;
}

/** Wappen-Seitenverhältnis 940:1234 → Höhe = Breite × 1.313 */
export const wappenH = (w: number) => Math.round(w * 1.313);

// ---------------------------------------------------------------------------
// Element-Builder (Satori-kompatibel)
// ---------------------------------------------------------------------------

export type El = { type: string; props: Record<string, unknown> };

export function el(type: string, props: Record<string, unknown> = {}, children?: unknown): El {
  return { type, props: children === undefined ? props : { ...props, children } };
}

export function box(style: Record<string, unknown>, children?: unknown): El {
  return el("div", { style: { display: "flex", ...style } }, children);
}

export const kids = (arr: (El | null | undefined | false)[]) => arr.filter(Boolean) as El[];

/** Lucide-Linien-Icon als Inline-SVG */
export function icon(name: IconKey, size: number, stroke: string, strokeWidth = 1.8): El {
  const nodes = BRAND_ICONS[name] ?? BRAND_ICONS["sparkles"];
  return el("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke,
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: nodes.map(([tag, attrs]) => el(tag, attrs)),
  });
}

/** Gefülltes Icon (z. B. Herz als Emotional-Signet) */
export function iconFilled(name: IconKey, size: number, fill: string): El {
  const nodes = BRAND_ICONS[name] ?? BRAND_ICONS["heart"];
  return el("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill,
    stroke: fill,
    strokeWidth: 1,
    children: nodes.map(([tag, attrs]) => el(tag, attrs)),
  });
}

/**
 * Schriftgrad so wählen, dass die längste Zeile weder das Zeichen-Budget noch
 * (optional) die verfügbare Pixel-Breite sprengt — verhindert Umbruch/Überlauf.
 * - maxChars: weiche Grenze (proportionales Verkleinern).
 * - maxWidthPx: harte Breiten-Grenze für die längste Zeile, damit eine
 *   Headline-Zeile im schmalen Panel nie umbricht.
 */
export function fitSize(base: number, lines: string[], maxChars: number, maxWidthPx?: number): number {
  const longest = Math.max(1, ...lines.map((l) => l.length));
  let size = longest <= maxChars ? base : (base * maxChars) / longest;
  if (maxWidthPx) {
    // Serifen-/Sans-Glyphen belegen im Schnitt ~0.53 × Schriftgrad an Breite.
    const widthCap = maxWidthPx / (0.53 * longest);
    size = Math.min(size, widthCap);
    return Math.max(Math.round(size), Math.round(base * 0.5));
  }
  return Math.max(Math.round(size), Math.round(base * 0.62));
}

export type { IconKey };
