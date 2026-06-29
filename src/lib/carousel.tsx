import { ImageResponse } from "next/og";

/**
 * Rendert hochwertige Karussell-Slides (1080×1350).
 * - cover: echtes Foto + dunkler Verlauf + großer Text-Hook (Scroll-Stopper)
 * - point: Verlaufs-Hintergrund, roter Akzent, große Nummer, klare Hierarchie
 * - outro: Abschluss-Slide mit CTA + Handle
 * Text wird scharf gerendert (kein KI-Kauderwelsch).
 */

const GREEN = "#1a5c2a";
const GREEN_DARK = "#0c2e16";
const RED = "#c0392b";
const MINT = "#9be6a8";
const W = 1080;
const H = 1350;

type El = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, children?: unknown): El => ({
  type,
  props: { style, ...(children !== undefined ? { children } : {}) },
});
const kids = (arr: (El | null | undefined | false)[]) => arr.filter(Boolean) as El[];

export type CarouselSlide =
  | { kind: "cover"; title: string; eyebrow?: string; backgroundDataUrl?: string }
  | { kind: "point"; heading: string; body?: string; eyebrow?: string }
  | { kind: "outro"; title: string; handle?: string };

function wordmark(): El {
  return h(
    "div",
    {
      position: "absolute",
      bottom: 50,
      left: 64,
      display: "flex",
      color: "rgba(255,255,255,0.92)",
      fontSize: 26,
      fontWeight: 700,
      letterSpacing: 2,
    },
    "HERSFELDER",
  );
}
function counter(i: number, t: number): El {
  return h(
    "div",
    {
      position: "absolute",
      bottom: 50,
      right: 64,
      display: "flex",
      color: "rgba(255,255,255,0.5)",
      fontSize: 24,
      fontWeight: 600,
    },
    `${i} / ${t}`,
  );
}

export async function renderSlide(
  slide: CarouselSlide,
  index: number,
  total: number,
): Promise<Buffer> {
  let element: El;

  if (slide.kind === "cover") {
    const layers: El[] = [];
    if (slide.backgroundDataUrl) {
      layers.push({
        type: "img",
        props: {
          src: slide.backgroundDataUrl,
          width: W,
          height: H,
          style: { position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover" },
        },
      });
      layers.push(
        h("div", {
          position: "absolute",
          top: 0,
          left: 0,
          width: W,
          height: H,
          display: "flex",
          backgroundImage:
            "linear-gradient(to top, rgba(8,22,13,0.94) 14%, rgba(8,22,13,0.35) 55%, rgba(8,22,13,0.10) 100%)",
        }),
      );
    }
    const textBlock = h(
      "div",
      { position: "absolute", left: 70, right: 70, bottom: 150, display: "flex", flexDirection: "column" },
      kids([
        slide.eyebrow
          ? h(
              "div",
              { display: "flex", fontSize: 30, fontWeight: 700, letterSpacing: 3, color: MINT, marginBottom: 20, textTransform: "uppercase" },
              slide.eyebrow,
            )
          : null,
        h("div", { display: "flex", fontSize: 80, fontWeight: 800, color: "white", lineHeight: 1.04 }, slide.title),
      ]),
    );
    const swipe = h(
      "div",
      { position: "absolute", right: 64, bottom: 60, display: "flex", color: "rgba(255,255,255,0.85)", fontSize: 26, fontWeight: 600 },
      "Wische →",
    );
    element = h(
      "div",
      {
        position: "relative",
        display: "flex",
        width: W,
        height: H,
        backgroundImage: `linear-gradient(135deg, ${GREEN}, ${GREEN_DARK})`,
        fontFamily: "sans-serif",
      },
      kids([...layers, textBlock, wordmark(), swipe]),
    );
  } else if (slide.kind === "outro") {
    element = h(
      "div",
      {
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        width: W,
        height: H,
        padding: 90,
        textAlign: "center",
        backgroundImage: `linear-gradient(135deg, ${GREEN}, ${GREEN_DARK})`,
        fontFamily: "sans-serif",
      },
      kids([
        h("div", { display: "flex", width: 80, height: 8, background: RED, marginBottom: 40 }),
        h("div", { display: "flex", fontSize: 66, fontWeight: 800, color: "white", lineHeight: 1.1, marginBottom: 30 }, slide.title),
        slide.handle
          ? h("div", { display: "flex", fontSize: 36, fontWeight: 700, color: MINT }, slide.handle)
          : null,
        wordmark(),
      ]),
    );
  } else {
    const inner = h(
      "div",
      {
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        width: W,
        height: H,
        padding: 100,
        backgroundImage: `linear-gradient(135deg, ${GREEN}, ${GREEN_DARK})`,
        fontFamily: "sans-serif",
      },
      kids([
        h("div", { position: "absolute", top: 0, left: 0, display: "flex", width: 170, height: 10, background: RED }),
        slide.eyebrow
          ? h(
              "div",
              { display: "flex", fontSize: 26, fontWeight: 700, letterSpacing: 3, color: MINT, marginBottom: 24, textTransform: "uppercase" },
              slide.eyebrow,
            )
          : null,
        h("div", { display: "flex", fontSize: 130, fontWeight: 800, color: "rgba(255,255,255,0.16)", lineHeight: 1 }, String(index - 1).padStart(2, "0")),
        h("div", { display: "flex", fontSize: 64, fontWeight: 800, color: "white", lineHeight: 1.1, marginTop: -10, marginBottom: slide.body ? 26 : 0 }, slide.heading),
        slide.body
          ? h("div", { display: "flex", fontSize: 37, fontWeight: 400, color: "rgba(255,255,255,0.85)", lineHeight: 1.35 }, slide.body)
          : null,
      ]),
    );
    element = h("div", { position: "relative", display: "flex", width: W, height: H }, kids([inner, wordmark(), counter(index, total)]));
  }

  const res = new ImageResponse(element as unknown as React.ReactElement, { width: W, height: H });
  return Buffer.from(await res.arrayBuffer());
}
