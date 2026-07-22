import { ImageResponse } from "next/og";
import fs from "node:fs";
import path from "node:path";
import { BRAND_ICONS, type IconKey } from "./brand-icons";

/**
 * Template-Engine für designte Posts (Zwei-Säulen-System, Juli 2026).
 *
 * Rendert die vier Marken-Layouts nach den Vorbild-Posts des echten
 * Instagram-Accounts — Foto von gpt-image-1 (OHNE Text), alles andere
 * (Wappen, Typografie, Icon-Leisten, CTA) wird hier deterministisch
 * composited. Gleiches Prinzip wie das Karussell-Cover (`carousel.tsx`),
 * nur generalisiert: Text ist immer perfekt lesbar, das Wappen ist immer
 * das echte PNG, die Fonts sind immer die Marken-Fonts.
 *
 * Canvas 1024×1536 (gpt-image-1-Portrait). Instagram croppt im Feed auf
 * 4:5 → sichtbare Zone y 128–1408. Inhalte bleiben in dieser Zone,
 * Flächen laufen als Bleed bis zum Rand durch.
 */

const W = 1024;
const H = 1536;

// Markenfarben (Design-System, aus Wappen + Brand-Guide abgeleitet)
export const BRAND_COLORS = {
  gruen900: "#142B20",
  gruen700: "#1E3B2C", // Markengrün: Panels, Leisten, CTA
  gruen500: "#1A4C2A", // Jagdgrün (Brand-Guide)
  gruen300: "#2E5941",
  creme: "#F5F0E6",
  weiss: "#FFFFFF",
  rot: "#CB212E", // Wappenrot (aus Logo gemessen)
  ink: "#1B2A22", // Headline-Dunkel (grünstichig, nie #000)
  inkSoft: "#5A6159",
  copy: "#33403A",
} as const;

export type PostTemplateKey =
  | "product-feature" // Vorbild A: Creme-Panel + Benefit-Leiste
  | "emotional-minimal" // Vorbild B: Wappen + Serife + Schreibschrift
  | "product-reactive" // Vorbild C: Panel + CTA + Icon-Leiste
  | "emotional-statement"; // Vorbild D: dunkles Statement-Feld

export type FeatureTile = { icon: IconKey; title: string; text: string };

export type OverlayContent = {
  template: PostTemplateKey;
  /** A/C: Serifen-Headline mit festen Zeilenumbrüchen */
  headline?: string[];
  /** B: Zeile 1 (Serife) */
  serifLine?: string;
  /** B: Zeile 2 (Schreibschrift) */
  scriptLine?: string;
  /** A: graue Subline unter der Headline */
  subline?: string;
  /** C: Fließtext im Panel */
  copy?: string;
  /** C: Versalien-Mikro-Claim mit Blatt-Icon */
  microClaim?: string;
  /** C: Versalien-Tagline neben dem Wappen */
  tagline?: string;
  /** C: CTA-Button-Text */
  cta?: string;
  /** A: genau 3 Benefit-Kacheln für die Leiste */
  features?: FeatureTile[];
  /** C: Icons der unteren Leiste */
  footerIcons?: IconKey[];
  /** D: Statement (bricht natürlich um) */
  statement?: string;
  /** C/D: Website-URL */
  url?: string;
  /** C: Icon über der Headline (z. B. "sun" bei Hitze-Hook) */
  accentIcon?: IconKey;
};

// ---------------------------------------------------------------------------
// Fonts + Wappen (lazy, pro Lambda-Instanz einmal geladen)
// ---------------------------------------------------------------------------

type FontSpec = { name: string; data: Buffer; weight: 400 | 500 | 600 | 700; style: "normal" };

let fontsPromise: Promise<FontSpec[]> | null = null;
function loadFonts(): Promise<FontSpec[]> {
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
function wappenDataUrl(): string {
  if (!wappenCache) {
    const buf = fs.readFileSync(path.join(process.cwd(), "src", "assets", "brand", "wappen.png"));
    wappenCache = `data:image/png;base64,${buf.toString("base64")}`;
  }
  return wappenCache;
}

// Wappen-Seitenverhältnis 940:1234 → Höhe = Breite × 1.313
const wappenH = (w: number) => Math.round(w * 1.313);

// ---------------------------------------------------------------------------
// Element-Builder (Satori-kompatibel, wie carousel.tsx)
// ---------------------------------------------------------------------------

type El = { type: string; props: Record<string, unknown> };

function el(type: string, props: Record<string, unknown> = {}, children?: unknown): El {
  return { type, props: children === undefined ? props : { ...props, children } };
}
function box(style: Record<string, unknown>, children?: unknown): El {
  return el("div", { style: { display: "flex", ...style } }, children);
}
const kids = (arr: (El | null | undefined | false)[]) => arr.filter(Boolean) as El[];

/** Lucide-Linien-Icon als Inline-SVG */
function icon(name: IconKey, size: number, stroke: string, strokeWidth = 2): El {
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

/** Gefülltes Icon (z. B. Herz) */
function iconFilled(name: IconKey, size: number, fill: string): El {
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

function photoLayer(photoDataUrl?: string): El {
  if (photoDataUrl) {
    return el("img", {
      src: photoDataUrl,
      width: W,
      height: H,
      style: { position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover" },
    });
  }
  // Fallback ohne Foto: Marken-Verlauf (sollte im Betrieb nie sichtbar sein)
  return box({
    position: "absolute",
    top: 0,
    left: 0,
    width: W,
    height: H,
    backgroundImage: `linear-gradient(160deg, ${BRAND_COLORS.gruen700}, ${BRAND_COLORS.gruen900})`,
  });
}

function wappenImg(left: number, top: number, width: number): El {
  return el("img", {
    src: wappenDataUrl(),
    width,
    height: wappenH(width),
    style: { position: "absolute", left, top, width, height: wappenH(width) },
  });
}

/**
 * Schriftgrad so wählen, dass die längste Zeile weder das Zeichen-Budget noch
 * (optional) die verfügbare Pixel-Breite sprengt — verhindert Umbruch/Überlauf.
 * - maxChars: weiche Grenze (proportionales Verkleinern, min. 68 %).
 * - maxWidthPx: harte Breiten-Grenze für die längste Zeile (min. 55 %),
 *   damit eine Headline-Zeile im schmalen Panel nie umbricht.
 */
export function fitSize(base: number, lines: string[], maxChars: number, maxWidthPx?: number): number {
  const longest = Math.max(1, ...lines.map((l) => l.length));
  let size = longest <= maxChars ? base : (base * maxChars) / longest;
  if (maxWidthPx) {
    // Serifen-/Sans-Glyphen belegen im Schnitt ~0.53 × Schriftgrad an Breite.
    const widthCap = maxWidthPx / (0.53 * longest);
    size = Math.min(size, widthCap);
    return Math.max(Math.round(size), Math.round(base * 0.55));
  }
  return Math.max(Math.round(size), Math.round(base * 0.68));
}

// ---------------------------------------------------------------------------
// Template A — PRODUCT-FEATURE (Vorbild „Damenweste")
// ---------------------------------------------------------------------------

function templateProductFeature(c: OverlayContent, photo?: string): El {
  const headline = (c.headline ?? []).slice(0, 5);
  // Panel-Textbreite 372px → Zeilen dürfen nicht umbrechen.
  const hlSize = fitSize(58, headline, 14, 372);
  const features = (c.features ?? []).slice(0, 3);

  return box({ position: "relative", width: W, height: H, fontFamily: "Inter" }, kids([
    photoLayer(photo),
    // Creme-Panel links mit weichem Verlauf ins Foto
    box({ position: "absolute", left: 0, top: 0, width: 460, height: 1132, backgroundColor: BRAND_COLORS.creme }),
    box({
      position: "absolute",
      left: 460,
      top: 0,
      width: 160,
      height: 1132,
      backgroundImage: `linear-gradient(to right, ${BRAND_COLORS.creme}, rgba(245,240,230,0))`,
    }),
    wappenImg(64, 176, 128),
    // Headline + Subline (bleibt oberhalb der Feature-Leiste bei y=1132)
    box({ position: "absolute", left: 64, top: 400, width: 384, flexDirection: "column" }, kids([
      ...headline.map((line) =>
        box(
          {
            fontFamily: "Playfair Display",
            fontWeight: 600,
            fontSize: hlSize,
            lineHeight: 1.16,
            color: BRAND_COLORS.ink,
            whiteSpace: "nowrap",
          },
          line,
        ),
      ),
      c.subline
        ? box(
            { marginTop: 26, fontSize: 25, fontWeight: 400, color: BRAND_COLORS.inkSoft, lineHeight: 1.4, width: 360 },
            c.subline,
          )
        : null,
    ])),
    // Dunkelgrüne Feature-Leiste (Bleed bis Bildunterkante)
    box(
      {
        position: "absolute",
        left: 0,
        top: 1132,
        width: W,
        height: H - 1132,
        backgroundColor: BRAND_COLORS.gruen700,
        paddingTop: 36,
        justifyContent: "center",
      },
      kids(
        features.map((f) =>
          box({ width: 320, flexDirection: "column", alignItems: "center", marginLeft: 8, marginRight: 8 }, kids([
            box(
              {
                width: 64,
                height: 64,
                borderRadius: 32,
                borderWidth: 3,
                borderStyle: "solid",
                borderColor: "rgba(245,240,230,0.9)",
                alignItems: "center",
                justifyContent: "center",
              },
              icon(f.icon, 32, "rgba(245,240,230,0.95)"),
            ),
            box(
              {
                marginTop: 16,
                fontFamily: "Montserrat",
                fontWeight: 700,
                fontSize: 22,
                letterSpacing: 3,
                color: BRAND_COLORS.creme,
                textTransform: "uppercase",
                textAlign: "center",
                justifyContent: "center",
                width: 300,
              },
              f.title,
            ),
            box(
              {
                marginTop: 8,
                fontSize: 19,
                color: "rgba(245,240,230,0.75)",
                textAlign: "center",
                justifyContent: "center",
                width: 290,
                lineHeight: 1.3,
              },
              f.text,
            ),
          ])),
        ),
      ),
    ),
  ]));
}

// ---------------------------------------------------------------------------
// Template B — EMOTIONAL-MINIMAL (Vorbild „Gemeinsam heute.")
// ---------------------------------------------------------------------------

function templateEmotionalMinimal(c: OverlayContent, photo?: string): El {
  return box({ position: "relative", width: W, height: H, fontFamily: "Inter" }, kids([
    photoLayer(photo),
    // Heller Lesbarkeits-Verlauf oben
    box({
      position: "absolute",
      top: 0,
      left: 0,
      width: W,
      height: 580,
      backgroundImage:
        "linear-gradient(to bottom, rgba(245,240,230,0.72) 0%, rgba(245,240,230,0.35) 55%, rgba(245,240,230,0) 100%)",
    }),
    box({ position: "absolute", top: 176, left: 0, width: W, flexDirection: "column", alignItems: "center" }, kids([
      el("img", {
        src: wappenDataUrl(),
        width: 96,
        height: wappenH(96),
        style: { width: 96, height: wappenH(96) },
      }),
      c.serifLine
        ? box(
            {
              marginTop: 34,
              fontFamily: "Playfair Display",
              fontWeight: 600,
              fontSize: fitSize(60, [c.serifLine], 22, 940),
              color: BRAND_COLORS.ink,
              textShadow: "0 1px 22px rgba(245,240,230,0.85)",
              whiteSpace: "nowrap",
            },
            c.serifLine,
          )
        : null,
      c.scriptLine
        ? box(
            {
              marginTop: 6,
              fontFamily: "Great Vibes",
              fontWeight: 400,
              fontSize: fitSize(84, [c.scriptLine], 26, 960),
              color: BRAND_COLORS.gruen700,
              textShadow: "0 1px 22px rgba(245,240,230,0.85)",
              whiteSpace: "nowrap",
            },
            c.scriptLine,
          )
        : null,
      box({ marginTop: 18, opacity: 0.85 }, iconFilled("heart", 30, BRAND_COLORS.rot)),
    ])),
  ]));
}

// ---------------------------------------------------------------------------
// Template C — PRODUCT-REACTIVE (Vorbild „Wenn andere ins Schwitzen kommen.")
// ---------------------------------------------------------------------------

function templateProductReactive(c: OverlayContent, photo?: string): El {
  const headline = c.headline ?? [];
  // Panel-Innenbreite ~528px (616 − 2×44 Padding).
  const hlSize = fitSize(54, headline, 16, 528);
  const footerIcons = (c.footerIcons ?? ["shield-check", "repeat", "users"]).slice(0, 3);

  return box({ position: "relative", width: W, height: H, fontFamily: "Inter" }, kids([
    photoLayer(photo),
    // Kopf: Wappen + Tagline
    box({ position: "absolute", left: 64, top: 176, alignItems: "center" }, kids([
      el("img", {
        src: wappenDataUrl(),
        width: 100,
        height: wappenH(100),
        style: { width: 100, height: wappenH(100) },
      }),
      c.tagline
        ? box(
            {
              marginLeft: 28,
              fontFamily: "Montserrat",
              fontWeight: 700,
              fontSize: 22,
              letterSpacing: 6.6,
              color: BRAND_COLORS.creme,
              textShadow: "0 2px 8px rgba(20,43,32,0.55)",
              textTransform: "uppercase",
            },
            c.tagline,
          )
        : null,
    ])),
    // Helles Panel mit Headline, Copy, Mikro-Claim, CTA
    box(
      {
        position: "absolute",
        left: 56,
        top: 560,
        width: 616,
        flexDirection: "column",
        backgroundColor: "rgba(245,240,230,0.86)",
        borderRadius: 24,
        padding: 44,
      },
      kids([
        icon(c.accentIcon ?? "sun", 56, BRAND_COLORS.gruen700),
        box(
          { marginTop: 24, flexDirection: "column" },
          headline.map((line) =>
            box(
              {
                fontFamily: "Playfair Display",
                fontWeight: 600,
                fontSize: hlSize,
                lineHeight: 1.15,
                color: BRAND_COLORS.ink,
                whiteSpace: "nowrap",
              },
              line,
            ),
          ),
        ),
        c.copy
          ? box({ marginTop: 24, fontSize: 27, color: BRAND_COLORS.copy, lineHeight: 1.5 }, c.copy)
          : null,
        c.microClaim
          ? box({ marginTop: 20, alignItems: "center" }, kids([
              icon("leaf", 24, BRAND_COLORS.gruen300),
              box(
                {
                  marginLeft: 12,
                  fontFamily: "Montserrat",
                  fontWeight: 600,
                  fontSize: 20,
                  letterSpacing: 2.4,
                  color: BRAND_COLORS.gruen300,
                  textTransform: "uppercase",
                },
                c.microClaim,
              ),
            ]))
          : null,
        c.cta
          ? box(
              {
                marginTop: 32,
                alignSelf: "flex-start",
                height: 76,
                borderRadius: 38,
                backgroundColor: BRAND_COLORS.gruen700,
                paddingLeft: 40,
                paddingRight: 40,
                alignItems: "center",
                boxShadow: "0 6px 18px rgba(20,43,32,0.30)",
              },
              box(
                {
                  fontFamily: "Montserrat",
                  fontWeight: 700,
                  fontSize: fitSize(27, [c.cta], 27),
                  color: BRAND_COLORS.weiss,
                  whiteSpace: "nowrap",
                },
                c.cta,
              ),
            )
          : null,
      ]),
    ),
    // Untere Icon-Leiste (Bleed bis Bildunterkante)
    box(
      {
        position: "absolute",
        left: 0,
        top: 1322,
        width: W,
        height: H - 1322,
        backgroundColor: "rgba(30,59,44,0.95)",
        flexDirection: "column",
      },
      box(
        { height: 86, alignItems: "center", paddingLeft: 64, paddingRight: 64, justifyContent: "space-between", width: W },
        kids([
          box(
            { alignItems: "center" },
            kids(footerIcons.map((k) => box({ marginRight: 28 }, icon(k, 36, "rgba(245,240,230,0.9)")))),
          ),
          c.url
            ? box(
                { fontFamily: "Montserrat", fontWeight: 600, fontSize: 21, letterSpacing: 1.7, color: BRAND_COLORS.creme },
                c.url,
              )
            : null,
        ]),
      ),
    ),
  ]));
}

// ---------------------------------------------------------------------------
// Template D — EMOTIONAL-STATEMENT (Vorbild „Kirmes-Vorfreude")
// ---------------------------------------------------------------------------

function templateEmotionalStatement(c: OverlayContent, photo?: string): El {
  return box({ position: "relative", width: W, height: H, fontFamily: "Inter" }, kids([
    photoLayer(photo),
    wappenImg(64, 176, 100),
    box(
      {
        position: "absolute",
        left: 400,
        top: 1020,
        width: 560,
        flexDirection: "column",
        backgroundColor: "rgba(16,28,22,0.66)",
        borderRadius: 20,
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "rgba(255,255,255,0.14)",
        padding: 44,
      },
      kids([
        box({ fontSize: 34, fontWeight: 500, color: BRAND_COLORS.weiss, lineHeight: 1.45 }, c.statement ?? ""),
        box({ marginTop: 26, width: 40, height: 3, backgroundColor: BRAND_COLORS.rot }),
        c.url
          ? box(
              {
                marginTop: 18,
                fontFamily: "Montserrat",
                fontWeight: 600,
                fontSize: 21,
                letterSpacing: 2.9,
                color: "rgba(255,255,255,0.85)",
              },
              c.url,
            )
          : null,
      ]),
    ),
  ]));
}

// ---------------------------------------------------------------------------
// Einstieg
// ---------------------------------------------------------------------------

const TEMPLATES: Record<PostTemplateKey, (c: OverlayContent, photo?: string) => El> = {
  "product-feature": templateProductFeature,
  "emotional-minimal": templateEmotionalMinimal,
  "product-reactive": templateProductReactive,
  "emotional-statement": templateEmotionalStatement,
};

/** Rendert einen designten Post (1024×1536 PNG) aus Overlay-Content + Foto. */
export async function renderPost(content: OverlayContent, photoDataUrl?: string): Promise<Buffer> {
  const fonts = await loadFonts();
  const element = TEMPLATES[content.template](content, photoDataUrl);
  const res = new ImageResponse(element as unknown as React.ReactElement, {
    width: W,
    height: H,
    fonts: fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
  });
  return Buffer.from(await res.arrayBuffer());
}
