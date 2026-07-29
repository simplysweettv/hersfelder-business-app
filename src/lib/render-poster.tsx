import { ImageResponse } from "next/og";
import fs from "node:fs";
import path from "node:path";

/**
 * Poster-Engine v2 (Juli 2026) — ersetzt die alten 4 „Foto + dezenter Text"-
 * Layouts durch echte PLAKAT-Optik mit Bandbreite:
 *
 *  - PLAKAT: Foto + GROSSER Text (3 Layout-Varianten: Bottom-Block, Zentral,
 *    Split-Band) — Scroll-Stopper wie ein gedrucktes Poster
 *  - FOTO: reines starkes Foto, nur kleines Wappen — kein Text
 *  - TYPO: Typografie-Poster ohne Foto (dunkelgrün-editorial oder creme-galerie)
 *  - KARUSSELL: Cover im Plakat-Look + nummerierte Story-Slides + CTA-Outro
 *
 * Sämtlicher Text wird programmatisch gerendert (Marken-Fonts, pixel-scharf),
 * das Wappen ist immer das echte PNG. Foto liefert gpt-image-1 ohne Text.
 */

const W = 1024;
const H = 1536;
const CW = 1080; // Karussell-Slides
const CH = 1350;

export const BRAND_COLORS = {
  gruen900: "#142B20",
  gruen700: "#1E3B2C",
  gruen500: "#1A4C2A",
  creme: "#F5F0E6",
  weiss: "#FFFFFF",
  rot: "#CB212E",
  ink: "#1B2A22",
  inkSoft: "#5A6159",
} as const;

export type PostKind = "plakat" | "foto" | "typo" | "karussell";

export type PosterContent = {
  kind: "plakat" | "foto" | "typo";
  /** Layout-Variante innerhalb des Typs (Abwechslung im Feed) */
  variant: number;
  /** Kleine Versalien-Zeile über der Headline */
  kicker?: string;
  /** Die große Plakat-Headline, Zeilen fest umbrochen */
  headline?: string[];
  /** Schreibschrift-Akzentzeile */
  scriptAccent?: string;
  /** Kleine Begleitzeile */
  sub?: string;
  url?: string;
};

export type CarouselContent = {
  cover: { kicker?: string; headline: string[]; scriptAccent?: string };
  slides: { heading: string; body?: string }[];
  outro: { headline: string; cta: string };
};

// ---------------------------------------------------------------------------
// Fonts + Wappen (lazy, einmal pro Instanz)
// ---------------------------------------------------------------------------

type FontSpec = { name: string; data: Buffer; weight: 400 | 600 | 700; style: "normal" };

let fontsPromise: Promise<FontSpec[]> | null = null;
function loadFonts(): Promise<FontSpec[]> {
  if (!fontsPromise) {
    fontsPromise = (async () => {
      const dir = path.join(process.cwd(), "src", "assets", "fonts");
      const read = (f: string) => fs.promises.readFile(path.join(dir, f));
      const [playfair, vibes, mont600, mont700, inter400, inter700] = await Promise.all([
        read("playfairdisplay-600.ttf"),
        read("greatvibes-400.ttf"),
        read("montserrat-600.ttf"),
        read("montserrat-700.ttf"),
        read("inter-400.ttf"),
        read("inter-700.ttf"),
      ]);
      return [
        { name: "Playfair Display", data: playfair, weight: 600, style: "normal" },
        { name: "Great Vibes", data: vibes, weight: 400, style: "normal" },
        { name: "Montserrat", data: mont600, weight: 600, style: "normal" },
        { name: "Montserrat", data: mont700, weight: 700, style: "normal" },
        { name: "Inter", data: inter400, weight: 400, style: "normal" },
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
const wappenH = (w: number) => Math.round(w * 1.313);

// ---------------------------------------------------------------------------
// Element-Builder (Satori)
// ---------------------------------------------------------------------------

type El = { type: string; props: Record<string, unknown> };
function el(type: string, props: Record<string, unknown> = {}, children?: unknown): El {
  return { type, props: children === undefined ? props : { ...props, children } };
}
function box(style: Record<string, unknown>, children?: unknown): El {
  return el("div", { style: { display: "flex", ...style } }, children);
}
const kids = (arr: (El | null | undefined | false)[]) => arr.filter(Boolean) as El[];

/**
 * Schriftgrad an Zeichenbudget + Pixel-Breite anpassen (kein Umbruch/Überlauf).
 */
export function fitSize(base: number, lines: string[], maxChars: number, maxWidthPx?: number): number {
  const longest = Math.max(1, ...lines.map((l) => l.length));
  let size = longest <= maxChars ? base : (base * maxChars) / longest;
  if (maxWidthPx) {
    const widthCap = maxWidthPx / (0.53 * longest);
    size = Math.min(size, widthCap);
    return Math.max(Math.round(size), Math.round(base * 0.5));
  }
  return Math.max(Math.round(size), Math.round(base * 0.62));
}

function photoLayer(photoDataUrl: string | undefined, w: number, h: number): El {
  if (photoDataUrl) {
    return el("img", {
      src: photoDataUrl,
      width: w,
      height: h,
      style: { position: "absolute", top: 0, left: 0, width: w, height: h, objectFit: "cover" },
    });
  }
  return box({
    position: "absolute",
    top: 0,
    left: 0,
    width: w,
    height: h,
    backgroundImage: `linear-gradient(155deg, ${BRAND_COLORS.gruen700}, ${BRAND_COLORS.gruen900})`,
  });
}

function wappenImg(left: number | undefined, top: number, width: number, opts?: { center?: boolean; right?: number }): El {
  const style: Record<string, unknown> = { position: "absolute", top, width, height: wappenH(width) };
  if (opts?.center) style.left = Math.round((W - width) / 2);
  else if (opts?.right !== undefined) style.right = opts.right;
  else style.left = left ?? 64;
  return el("img", { src: wappenDataUrl(), width, height: wappenH(width), style });
}

const kickerEl = (text: string, color: string, size = 26): El =>
  box(
    {
      fontFamily: "Montserrat",
      fontWeight: 700,
      fontSize: size,
      letterSpacing: Math.round(size * 0.22),
      textTransform: "uppercase",
      color,
    },
    text,
  );

const divider = (color: string, width = 56): El => box({ width, height: 5, backgroundColor: color });

// ---------------------------------------------------------------------------
// PLAKAT — Foto + GROSSER Text
// ---------------------------------------------------------------------------

function plakatBottomBlock(c: PosterContent, photo?: string): El {
  const lines = c.headline ?? [];
  const size = fitSize(112, lines, 13, 900);
  return box({ position: "relative", width: W, height: H, fontFamily: "Inter" }, kids([
    photoLayer(photo, W, H),
    // kräftiger Scrim unten — Poster-Standard für Text auf Foto
    box({
      position: "absolute",
      left: 0,
      top: Math.round(H * 0.4),
      width: W,
      height: Math.round(H * 0.6),
      backgroundImage: "linear-gradient(to bottom, rgba(20,43,32,0) 0%, rgba(20,43,32,0.62) 34%, rgba(20,43,32,0.95) 100%)",
    }),
    wappenImg(64, 152, 96),
    box({ position: "absolute", left: 72, right: 60, bottom: 170, flexDirection: "column" }, kids([
      c.kicker ? kickerEl(c.kicker, "rgba(245,240,230,0.85)") : null,
      box(
        { flexDirection: "column", marginTop: c.kicker ? 22 : 0 },
        lines.map((l) =>
          box(
            {
              fontFamily: "Playfair Display",
              fontWeight: 600,
              fontSize: size,
              lineHeight: 1.06,
              color: BRAND_COLORS.creme,
              whiteSpace: "nowrap",
            },
            l,
          ),
        ),
      ),
      c.scriptAccent
        ? box(
            { marginTop: 10, fontFamily: "Great Vibes", fontSize: fitSize(88, [c.scriptAccent], 22, 880), color: "rgba(245,240,230,0.96)", whiteSpace: "nowrap" },
            c.scriptAccent,
          )
        : null,
      box({ marginTop: 30, alignItems: "center" }, kids([
        divider(BRAND_COLORS.rot),
        c.sub
          ? box({ marginLeft: 22, fontSize: 27, color: "rgba(245,240,230,0.82)", lineHeight: 1.35, maxWidth: 700 }, c.sub)
          : null,
      ])),
    ])),
  ]));
}

function plakatZentral(c: PosterContent, photo?: string): El {
  const lines = c.headline ?? [];
  const size = fitSize(104, lines, 14, 900);
  return box({ position: "relative", width: W, height: H, fontFamily: "Inter" }, kids([
    photoLayer(photo, W, H),
    box({ position: "absolute", top: 0, left: 0, width: W, height: H, backgroundColor: "rgba(16,28,22,0.48)" }),
    wappenImg(undefined, 150, 92, { center: true }),
    box(
      { position: "absolute", left: 60, right: 60, top: 0, height: H, flexDirection: "column", alignItems: "center", justifyContent: "center" },
      kids([
        c.kicker ? kickerEl(c.kicker, "rgba(245,240,230,0.8)") : null,
        box(
          { flexDirection: "column", alignItems: "center", marginTop: c.kicker ? 26 : 0 },
          lines.map((l) =>
            box(
              { fontFamily: "Playfair Display", fontWeight: 600, fontSize: size, lineHeight: 1.08, color: BRAND_COLORS.creme, whiteSpace: "nowrap", textShadow: "0 4px 30px rgba(16,28,22,0.55)" },
              l,
            ),
          ),
        ),
        c.scriptAccent
          ? box({ marginTop: 14, fontFamily: "Great Vibes", fontSize: fitSize(92, [c.scriptAccent], 22, 880), color: BRAND_COLORS.creme, whiteSpace: "nowrap", textShadow: "0 4px 26px rgba(16,28,22,0.55)" }, c.scriptAccent)
          : null,
        box({ marginTop: 34 }, divider(BRAND_COLORS.rot)),
      ]),
    ),
    c.url
      ? box({ position: "absolute", bottom: 160, left: 0, width: W, justifyContent: "center", fontFamily: "Montserrat", fontWeight: 600, fontSize: 22, letterSpacing: 4, color: "rgba(245,240,230,0.7)" }, c.url)
      : null,
  ]));
}

function plakatSplitBand(c: PosterContent, photo?: string): El {
  const lines = c.headline ?? [];
  const bandTop = Math.round(H * 0.6);
  const size = fitSize(88, lines, 15, 896);
  return box({ position: "relative", width: W, height: H, fontFamily: "Inter" }, kids([
    // Foto oben
    box({ position: "absolute", top: 0, left: 0, width: W, height: bandTop, overflow: "hidden" },
      photoDataCrop(photo, W, bandTop)),
    // Marken-Band unten (Bleed bis Kante)
    box({ position: "absolute", left: 0, top: bandTop, width: W, height: H - bandTop, backgroundColor: BRAND_COLORS.gruen700 }),
    box({ position: "absolute", left: 0, top: bandTop, width: W, height: 6, backgroundColor: BRAND_COLORS.rot }),
    wappenImg(64, 150, 92),
    box({ position: "absolute", left: 72, right: 60, top: bandTop + 58, flexDirection: "column" }, kids([
      c.kicker ? kickerEl(c.kicker, "rgba(245,240,230,0.66)", 24) : null,
      box(
        { flexDirection: "column", marginTop: c.kicker ? 20 : 0 },
        lines.map((l) =>
          box({ fontFamily: "Playfair Display", fontWeight: 600, fontSize: size, lineHeight: 1.1, color: BRAND_COLORS.creme, whiteSpace: "nowrap" }, l),
        ),
      ),
      // Schreibschrift-Akzent: fehlte hier als einziges Plakat-Layout — die
      // Konzept-KI liefert ihn, und ohne ihn blieb das Band unten leer.
      c.scriptAccent
        ? box(
            { marginTop: 14, fontFamily: "Great Vibes", fontSize: fitSize(86, [c.scriptAccent], 22, 880), color: "rgba(245,240,230,0.95)", whiteSpace: "nowrap" },
            c.scriptAccent,
          )
        : null,
      c.sub
        ? box({ marginTop: 24, fontSize: 27, color: "rgba(245,240,230,0.8)", lineHeight: 1.4, maxWidth: 760 }, c.sub)
        : null,
      c.url
        ? box({ marginTop: 26, fontFamily: "Montserrat", fontWeight: 600, fontSize: 21, letterSpacing: 3.2, color: "rgba(245,240,230,0.6)" }, c.url)
        : null,
    ])),
  ]));
}

function photoDataCrop(photo: string | undefined, w: number, h: number): El {
  if (photo) {
    return el("img", { src: photo, width: w, height: h, style: { width: w, height: h, objectFit: "cover" } });
  }
  return box({ width: w, height: h, backgroundImage: `linear-gradient(155deg, ${BRAND_COLORS.gruen700}, ${BRAND_COLORS.gruen900})` });
}

// ---------------------------------------------------------------------------
// FOTO — reines Foto, nur Wappen
// ---------------------------------------------------------------------------

function fotoPur(c: PosterContent, photo?: string): El {
  const topLeft = c.variant % 2 === 0;
  return box({ position: "relative", width: W, height: H, fontFamily: "Inter" }, kids([
    photoLayer(photo, W, H),
    // dezente Vignette hinter dem Wappen für Lesbarkeit auf jedem Foto
    box({
      position: "absolute",
      ...(topLeft ? { top: 0, left: 0 } : { bottom: 0, right: 0 }),
      width: 340,
      height: 340,
      backgroundImage: topLeft
        ? "radial-gradient(circle at 20% 20%, rgba(20,43,32,0.34), rgba(20,43,32,0) 70%)"
        : "radial-gradient(circle at 80% 80%, rgba(20,43,32,0.34), rgba(20,43,32,0) 70%)",
    }),
    topLeft ? wappenImg(64, 152, 88) : wappenImg(undefined, H - 152 - wappenH(88), 88, { right: 64 }),
  ]));
}

// ---------------------------------------------------------------------------
// TYPO — Typografie-Poster ohne Foto
// ---------------------------------------------------------------------------

function typoDark(c: PosterContent): El {
  const lines = c.headline ?? [];
  const size = fitSize(108, lines, 13, 856);
  return box(
    {
      position: "relative",
      width: W,
      height: H,
      fontFamily: "Inter",
      backgroundImage: `linear-gradient(150deg, ${BRAND_COLORS.gruen700} 0%, ${BRAND_COLORS.gruen900} 100%)`,
    },
    kids([
      // klassischer Poster-Rahmen
      box({
        position: "absolute",
        top: 44,
        left: 44,
        width: W - 88,
        height: H - 88,
        borderWidth: 2,
        borderStyle: "solid",
        borderColor: "rgba(245,240,230,0.28)",
      }),
      wappenImg(undefined, 150, 100, { center: true }),
      box(
        { position: "absolute", left: 84, right: 84, top: 0, height: H, flexDirection: "column", alignItems: "center", justifyContent: "center" },
        kids([
          c.kicker ? kickerEl(c.kicker, "rgba(245,240,230,0.6)", 24) : null,
          box(
            { flexDirection: "column", alignItems: "center", marginTop: c.kicker ? 30 : 0 },
            lines.map((l) =>
              box({ fontFamily: "Playfair Display", fontWeight: 600, fontSize: size, lineHeight: 1.12, color: BRAND_COLORS.creme, whiteSpace: "nowrap" }, l),
            ),
          ),
          c.scriptAccent
            ? box({ marginTop: 18, fontFamily: "Great Vibes", fontSize: fitSize(100, [c.scriptAccent], 20, 840), color: "rgba(245,240,230,0.95)", whiteSpace: "nowrap" }, c.scriptAccent)
            : null,
          box({ marginTop: 40 }, divider(BRAND_COLORS.rot, 64)),
          c.sub
            ? box({ marginTop: 30, fontSize: 27, color: "rgba(245,240,230,0.72)", lineHeight: 1.45, maxWidth: 700, textAlign: "center", justifyContent: "center" }, c.sub)
            : null,
        ]),
      ),
      box(
        { position: "absolute", bottom: 96, left: 0, width: W, justifyContent: "center", fontFamily: "Montserrat", fontWeight: 600, fontSize: 21, letterSpacing: 4.4, color: "rgba(245,240,230,0.55)" },
        c.url ?? "schuetzen-ausstatter.de",
      ),
    ]),
  );
}

function typoCreme(c: PosterContent): El {
  const lines = c.headline ?? [];
  const size = fitSize(112, lines, 13, 880);
  return box(
    { position: "relative", width: W, height: H, fontFamily: "Inter", backgroundColor: BRAND_COLORS.creme },
    kids([
      wappenImg(72, 150, 96),
      box({ position: "absolute", left: 72, right: 72, top: 400, flexDirection: "column" }, kids([
        c.kicker ? kickerEl(c.kicker, BRAND_COLORS.gruen500, 24) : null,
        box(
          { flexDirection: "column", marginTop: c.kicker ? 28 : 0 },
          lines.map((l) =>
            box({ fontFamily: "Playfair Display", fontWeight: 600, fontSize: size, lineHeight: 1.1, color: BRAND_COLORS.ink, whiteSpace: "nowrap" }, l),
          ),
        ),
        c.scriptAccent
          ? box({ marginTop: 16, fontFamily: "Great Vibes", fontSize: fitSize(96, [c.scriptAccent], 21, 860), color: BRAND_COLORS.gruen700, whiteSpace: "nowrap" }, c.scriptAccent)
          : null,
        box({ marginTop: 42 }, divider(BRAND_COLORS.rot, 64)),
        c.sub
          ? box({ marginTop: 30, fontSize: 28, color: BRAND_COLORS.inkSoft, lineHeight: 1.5, maxWidth: 720 }, c.sub)
          : null,
      ])),
      box(
        { position: "absolute", bottom: 96, left: 72, fontFamily: "Montserrat", fontWeight: 600, fontSize: 21, letterSpacing: 4.2, color: BRAND_COLORS.gruen500 },
        c.url ?? "schuetzen-ausstatter.de",
      ),
    ]),
  );
}

// ---------------------------------------------------------------------------
// KARUSSELL — Cover + Story-Slides + Outro (1080×1350)
// ---------------------------------------------------------------------------

function carouselCover(cover: CarouselContent["cover"], photo?: string): El {
  const lines = cover.headline;
  const size = fitSize(104, lines, 13, 950);
  return box({ position: "relative", width: CW, height: CH, fontFamily: "Inter" }, kids([
    photoLayer(photo, CW, CH),
    box({
      position: "absolute",
      left: 0,
      top: Math.round(CH * 0.34),
      width: CW,
      height: Math.round(CH * 0.66),
      backgroundImage: "linear-gradient(to bottom, rgba(20,43,32,0) 0%, rgba(20,43,32,0.66) 36%, rgba(20,43,32,0.96) 100%)",
    }),
    el("img", { src: wappenDataUrl(), width: 92, height: wappenH(92), style: { position: "absolute", left: 64, top: 60, width: 92, height: wappenH(92) } }),
    box({ position: "absolute", left: 72, right: 64, bottom: 150, flexDirection: "column" }, kids([
      cover.kicker ? kickerEl(cover.kicker, "rgba(245,240,230,0.85)") : null,
      box(
        { flexDirection: "column", marginTop: cover.kicker ? 20 : 0 },
        lines.map((l) =>
          box({ fontFamily: "Playfair Display", fontWeight: 600, fontSize: size, lineHeight: 1.06, color: BRAND_COLORS.creme, whiteSpace: "nowrap" }, l),
        ),
      ),
      cover.scriptAccent
        ? box({ marginTop: 10, fontFamily: "Great Vibes", fontSize: fitSize(84, [cover.scriptAccent], 24, 920), color: "rgba(245,240,230,0.95)", whiteSpace: "nowrap" }, cover.scriptAccent)
        : null,
    ])),
    box(
      { position: "absolute", right: 64, bottom: 64, fontFamily: "Montserrat", fontWeight: 700, fontSize: 26, color: "rgba(245,240,230,0.9)", letterSpacing: 2 },
      "Wische →",
    ),
  ]));
}

function carouselSlide(slide: CarouselContent["slides"][number], index: number, total: number): El {
  const heading = slide.heading;
  return box(
    {
      position: "relative",
      width: CW,
      height: CH,
      fontFamily: "Inter",
      backgroundImage: `linear-gradient(150deg, ${BRAND_COLORS.gruen700} 0%, ${BRAND_COLORS.gruen900} 100%)`,
      flexDirection: "column",
      justifyContent: "center",
      padding: 96,
    },
    kids([
      box({ position: "absolute", top: 0, left: 0, width: 180, height: 8, backgroundColor: BRAND_COLORS.rot }),
      box(
        { position: "absolute", top: 44, left: 84, fontFamily: "Playfair Display", fontWeight: 600, fontSize: 220, color: "rgba(245,240,230,0.12)", lineHeight: 1 },
        String(index + 1).padStart(2, "0"),
      ),
      box(
        { fontFamily: "Playfair Display", fontWeight: 600, fontSize: fitSize(76, [heading], 22, 888), lineHeight: 1.14, color: BRAND_COLORS.creme, maxWidth: 888 },
        heading,
      ),
      slide.body
        ? box({ marginTop: 30, fontSize: 34, color: "rgba(245,240,230,0.82)", lineHeight: 1.45, maxWidth: 860 }, slide.body)
        : null,
      box(
        { position: "absolute", bottom: 60, left: 84, fontFamily: "Montserrat", fontWeight: 700, fontSize: 24, letterSpacing: 4, color: "rgba(245,240,230,0.6)" },
        "HERSFELDER",
      ),
      box(
        { position: "absolute", bottom: 60, right: 84, fontFamily: "Montserrat", fontWeight: 600, fontSize: 24, color: "rgba(245,240,230,0.55)" },
        `${index + 2} / ${total}`,
      ),
    ]),
  );
}

function carouselOutro(outro: CarouselContent["outro"], total: number): El {
  return box(
    {
      position: "relative",
      width: CW,
      height: CH,
      fontFamily: "Inter",
      backgroundImage: `linear-gradient(160deg, ${BRAND_COLORS.gruen700} 0%, ${BRAND_COLORS.gruen900} 100%)`,
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 90,
    },
    kids([
      el("img", { src: wappenDataUrl(), width: 116, height: wappenH(116), style: { width: 116, height: wappenH(116) } }),
      box(
        { marginTop: 46, fontFamily: "Playfair Display", fontWeight: 600, fontSize: fitSize(80, [outro.headline], 20, 880), color: BRAND_COLORS.creme, lineHeight: 1.15, textAlign: "center", justifyContent: "center", maxWidth: 880 },
        outro.headline,
      ),
      box(
        { marginTop: 50, backgroundColor: BRAND_COLORS.creme, borderRadius: 44, height: 88, paddingLeft: 52, paddingRight: 52, alignItems: "center", boxShadow: "0 8px 24px rgba(0,0,0,0.28)" },
        box({ fontFamily: "Montserrat", fontWeight: 700, fontSize: 30, color: BRAND_COLORS.gruen700, whiteSpace: "nowrap" }, outro.cta),
      ),
      box(
        { marginTop: 34, fontFamily: "Montserrat", fontWeight: 600, fontSize: 24, letterSpacing: 3.6, color: "rgba(245,240,230,0.65)" },
        "schuetzen-ausstatter.de",
      ),
      box(
        { position: "absolute", bottom: 60, right: 84, fontFamily: "Montserrat", fontWeight: 600, fontSize: 24, color: "rgba(245,240,230,0.55)" },
        `${total} / ${total}`,
      ),
    ]),
  );
}

// ---------------------------------------------------------------------------
// Einstieg
// ---------------------------------------------------------------------------

async function toPng(element: El, w: number, h: number): Promise<Buffer> {
  const fonts = await loadFonts();
  const res = new ImageResponse(element as unknown as React.ReactElement, {
    width: w,
    height: h,
    fonts: fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
  });
  return Buffer.from(await res.arrayBuffer());
}

/** Einzelbild-Poster rendern (1024×1536 PNG). */
export async function renderPoster(content: PosterContent, photoDataUrl?: string): Promise<Buffer> {
  let element: El;
  if (content.kind === "plakat") {
    const v = content.variant % 3;
    element = v === 0 ? plakatBottomBlock(content, photoDataUrl) : v === 1 ? plakatZentral(content, photoDataUrl) : plakatSplitBand(content, photoDataUrl);
  } else if (content.kind === "foto") {
    element = fotoPur(content, photoDataUrl);
  } else {
    element = content.variant % 2 === 0 ? typoDark(content) : typoCreme(content);
  }
  return toPng(element, W, H);
}

/** Karussell rendern: Cover + Slides + Outro (je 1080×1350 PNG). */
export async function renderCarousel(content: CarouselContent, coverPhotoDataUrl?: string): Promise<Buffer[]> {
  const total = content.slides.length + 2;
  const buffers: Buffer[] = [];
  buffers.push(await toPng(carouselCover(content.cover, coverPhotoDataUrl), CW, CH));
  for (let i = 0; i < content.slides.length; i++) {
    buffers.push(await toPng(carouselSlide(content.slides[i], i, total), CW, CH));
  }
  buffers.push(await toPng(carouselOutro(content.outro, total), CW, CH));
  return buffers;
}

/** Alle gerenderten Textzeilen eines Posts (für das QA-Gate). */
export function renderedTextOf(content: PosterContent | CarouselContent): string {
  if ("cover" in content) {
    return [
      content.cover.kicker,
      ...content.cover.headline,
      content.cover.scriptAccent,
      ...content.slides.flatMap((s) => [s.heading, s.body]),
      content.outro.headline,
      content.outro.cta,
    ]
      .filter(Boolean)
      .join(" | ");
  }
  return [content.kicker, ...(content.headline ?? []), content.scriptAccent, content.sub, content.url]
    .filter(Boolean)
    .join(" | ");
}
