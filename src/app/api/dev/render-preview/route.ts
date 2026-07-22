import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { renderPost, type OverlayContent } from "@/lib/render-post";

/**
 * Dev-only Vorschau der vier Post-Templates mit Beispiel-Content
 * (Inhalte der vier Vorbild-Posts). In Produktion: 404.
 *
 *   GET /api/dev/render-preview?template=a|b|c|d[&photo=none]
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SAMPLES: Record<string, OverlayContent> = {
  a: {
    template: "product-feature",
    headline: ["Die Damenweste", "für alle, die", "Tradition modern", "leben."],
    subline: "Moderner Schnitt, perfekter Sitz und faire Vereinspreise für Schützinnen und Damenkompanien.",
    features: [
      { icon: "shirt", title: "Moderner Schnitt", text: "zeitlos, elegant, bequem" },
      { icon: "ruler", title: "Perfekter Sitz", text: "Optimal angepasst für einen starken Auftritt" },
      { icon: "handshake", title: "Faire Vereinspreise", text: "Top Qualität zu attraktiven Konditionen" },
    ],
  },
  b: {
    template: "emotional-minimal",
    serifLine: "Gemeinsam heute.",
    scriptLine: "Tradition für morgen.",
  },
  c: {
    template: "product-reactive",
    tagline: "Tradition. Verbunden.",
    headline: ["Wenn andere ins", "Schwitzen kommen."],
    copy: "Unsere leichten Stoffqualitäten sorgen auch an heißen Schützenfesttagen für angenehmen Tragekomfort.",
    microClaim: "Entwickelt für lange Schützenfesttage",
    cta: "Jetzt Musterkollektion anfragen",
    url: "schuetzen-ausstatter.de",
    accentIcon: "sun",
  },
  d: {
    template: "emotional-statement",
    statement: "Die Schützenvereine blicken schon jetzt voller Vorfreude auf die Kirmes im nächsten Jahr!",
    url: "www.schuetzen-ausstatter.de",
  },
};

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  }
  const key = req.nextUrl.searchParams.get("template") ?? "b";
  const content = SAMPLES[key];
  if (!content) {
    return NextResponse.json({ error: "template=a|b|c|d" }, { status: 400 });
  }

  // Platzhalter-Foto aus dem Brand-Guide (im echten Flow kommt es von gpt-image-1)
  let photo: string | undefined;
  if (req.nextUrl.searchParams.get("photo") !== "none") {
    const p = path.join(process.cwd(), "public", "brand-guide", "instagram", "post-lifestyle.jpg");
    if (fs.existsSync(p)) {
      photo = `data:image/jpeg;base64,${fs.readFileSync(p).toString("base64")}`;
    }
  }

  const buf = await renderPost(content, photo);
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
