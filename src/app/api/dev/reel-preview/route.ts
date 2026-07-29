import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { createReel } from "@/lib/reel";
import type { ReelContent } from "@/lib/render-reel";

/**
 * Dev-only Vorschau der Reel-Pipeline (9:16 MP4). In Produktion: 404.
 *
 *   GET /api/dev/reel-preview?sample=emotional|produkt[&sec=7]
 *
 * Liefert direkt ein abspielbares MP4 — im Browser öffnen und ansehen.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SAMPLES: Record<string, ReelContent> = {
  emotional: {
    eyebrow: "Hersfelder Schützenbekleidung",
    headline: ["Wenn der Verein", "zur Familie wird."],
    scriptLine: "Seit Generationen.",
    cta: "Mehr entdecken",
    url: "schuetzen-ausstatter.de",
  },
  produkt: {
    eyebrow: "Hersfelder Schützenbekleidung",
    headline: ["Größe 23 bis 70.", "Alle zum", "gleichen Preis."],
    cta: "Musterkollektion anfragen",
    url: "schuetzen-ausstatter.de",
  },
};

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  }

  const key = req.nextUrl.searchParams.get("sample") ?? "emotional";
  const content = SAMPLES[key];
  if (!content) {
    return NextResponse.json({ error: "sample=emotional|produkt" }, { status: 400 });
  }
  const sec = Number(req.nextUrl.searchParams.get("sec") ?? "7");

  // Platzhalter-Foto aus dem Brand-Guide (im echten Flow von gpt-image-1).
  const p = path.join(process.cwd(), "public", "brand-guide", "instagram", "post-lifestyle.jpg");
  if (!fs.existsSync(p)) {
    return NextResponse.json({ error: `Testfoto fehlt: ${p}` }, { status: 500 });
  }

  const started = Date.now();
  const { mp4, width, height } = await createReel({
    photo: fs.readFileSync(p),
    content,
    durationSec: Number.isFinite(sec) ? Math.min(15, Math.max(2, sec)) : 7,
  });

  return new Response(new Uint8Array(mp4), {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(mp4.length),
      "Cache-Control": "no-store",
      "X-Render-Ms": String(Date.now() - started),
      "X-Reel-Size": `${width}x${height}`,
    },
  });
}
