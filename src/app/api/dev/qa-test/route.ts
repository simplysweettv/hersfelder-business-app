import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { renderPoster, renderedTextOf, type PosterContent } from "@/lib/render-poster";
import { runQaGate } from "@/lib/qa-gate";
import { loadSettings } from "@/lib/settings";

/**
 * Dev-only: prüft, ob die 2-Agenten-Freigabe (QA + Social) funktioniert.
 * Rendert ein Poster mit dem Platzhalter-Foto (3 lachende Personen in
 * dunkelgrünen Uniformen) und lässt das Gate zwei Fälle bewerten:
 *
 *  - ?case=match    → Motiv/Text passen zum Bild  → sollte BESTEHEN
 *  - ?case=mismatch → Motiv/Text behaupten "diese beiden Westen" (Bild zeigt
 *                     aber DREI Personen in Jacken) → QA-Agent sollte den
 *                     Logik-/Motiv-Fehler FANGEN (pass=false, failArea=image)
 *
 * In Produktion: 404.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function photo(): string | null {
  const p = path.join(process.cwd(), "public", "brand-guide", "instagram", "post-lifestyle.jpg");
  if (fs.existsSync(p)) return `data:image/jpeg;base64,${fs.readFileSync(p).toString("base64")}`;
  return null;
}

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  }
  const settings = await loadSettings();
  const apiKey = process.env.OPENAI_API_KEY || settings["openai_api_key"] || undefined;
  if (!apiKey) return NextResponse.json({ error: "Kein OPENAI_API_KEY." }, { status: 400 });

  const which = req.nextUrl.searchParams.get("case") ?? "match";

  const content: PosterContent =
    which === "mismatch"
      ? {
          layout: "karte-unten",
          kicker: "Im Vergleich",
          headline: ["Vergleicht diese", "beiden Westen."],
          sub: "Zwei Westen, ein Unterschied.",
        }
      : {
          layout: "karte-unten",
          kicker: "Seit Generationen",
          headline: ["Gemeinsam lachen,", "gemeinsam feiern."],
          scriptAccent: "Das ist Verein.",
          sub: "Drei, die zusammengehören.",
        };

  const motif =
    which === "mismatch"
      ? "Produktvergleich von genau ZWEI Damenwesten nebeneinander auf Büsten"
      : "Drei lachende Vereinsmitglieder (zwei Männer, eine Frau) in dunkelgrünen Uniformjacken am Festplatz, warmes Abendlicht";

  const p = photo();
  if (!p) {
    return NextResponse.json(
      { error: "Kein Platzhalter-Foto gefunden — lege eins unter public/brand-guide/instagram/ ab." },
      { status: 400 },
    );
  }
  // renderPoster liefert PNG; das Gate akzeptiert jeden Bild-Buffer als Data-URL.
  const jpeg = await renderPoster(content, p);

  const result = await runQaGate({
    apiKey,
    jpeg,
    renderedText: renderedTextOf(content),
    motif,
    caption: "Test-Caption für die QA-Gate-Prüfung. Ihr gehört zusammen — teilt eure schönsten Momente. #hersfelder",
    kind: content.layout,
    lane: "emotional",
  });

  return NextResponse.json({
    case: which,
    expected: which === "mismatch" ? "pass=false (QA fängt Motiv-Widerspruch)" : "pass=true",
    result,
  });
}
