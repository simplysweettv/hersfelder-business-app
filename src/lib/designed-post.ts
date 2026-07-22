import sharp from "sharp";
import { getOpenAIClient, generateImage, generateCaption } from "./openai";
import { recordAiUsage } from "./ai-cost";
import { BANNED_PHRASES, type ConceptFormat } from "./concepts";
import { renderPost, type OverlayContent, type PostTemplateKey } from "./render-post";

/**
 * Designte Posts (Zwei-Säulen-System): Konzept-KI → Foto (ohne Text) →
 * programmatisches Marken-Overlay (render-post.tsx) → JPEG.
 *
 * Der Unterschied zum alten Weg: Erst entsteht die IDEE (Konzept mit Headline
 * nach Format-Formel), daraus werden Foto-Prompt UND Overlay-Text abgeleitet —
 * Bild und Text erzählen garantiert dieselbe Geschichte, und der Text ist
 * pixel-perfekt gerendert statt KI-gemalt.
 */

export type DesignedConcept = {
  formatCode: string;
  template: PostTemplateKey;
  overlay: OverlayContent;
  /** Englische Szenen-Beschreibung fürs Foto (ohne Text-Anweisungen) */
  photoIdea: string;
  /** Für post_briefs + Caption-Erzeugung */
  theme: string;
  product: string;
  message: string;
};

// ---------------------------------------------------------------------------
// Foto-Prompt-Bausteine (Design-System) — Englisch, gpt-image-1
// ---------------------------------------------------------------------------

const BLOCK_UNIFORM = `Clothing realism (strict): authentic German Schützenverein attire from a real off-the-shelf collection — deep fir-green (hunter green) wool-blend vests and jackets with clean simple cuts, plain matte buttons, neat seams, crisp white blouses/shirts. STRICTLY FORBIDDEN: gold braiding, epaulettes, ornate trim, medals, sashes, cords, historical or military styling, fantasy details.`;

const BLOCK_SAFETY = `ABSOLUTELY NO weapons of any kind — no rifles, guns, air rifles, pistols; nobody aiming, shooting, holding or carrying anything gun-like; hands are empty, relaxed, linked or holding harmless festival items. This is about community and celebration, never the shooting sport itself. No flags with symbols, no emblems, no crests, no political imagery. No brand logos. NO lettering, signage, shop names, readable words, letters or numbers ANYWHERE — this includes no size tags, no labels, no letters or numbers printed on collars, garments, hangers, boxes or packaging (garments and boxes must be plain and label-free). Any building signs must be blank or out of focus. No watermark.`;

const BLOCK_CAMERA = `Photorealistic editorial photography, shot on a 35mm lens at f/2.8, shallow depth of field, natural film-like color grading, soft grain, true-to-life skin tones. Documentary feel, not a staged advertising shoot.`;

const LIGHT_BY_TEMPLATE: Record<PostTemplateKey, string> = {
  "product-feature": "Bright soft daylight, gentle diffusion, airy and friendly.",
  "emotional-minimal": "Warm golden-hour sunlight, long soft shadows, festive glow.",
  "product-reactive": "Warm sunlight with gentle flares, festive summer atmosphere.",
  "emotional-statement": "Golden hour, cinematic warm mood, soft evening light.",
};

/** Copy-Space-Regie je Template — fotografisch formuliert (funktioniert zuverlässig) */
const COMPOSITION_BY_TEMPLATE: Record<PostTemplateKey, string> = {
  "product-feature":
    "Composition: subjects on the RIGHT HALF of the frame; the LEFT 40% is calm, low-detail negative space (soft out-of-focus background) reserved as copy space. Keep the bottom fifth of the frame simple.",
  "emotional-minimal":
    "Composition: subjects in the lower two thirds of the frame; the UPPER THIRD is bright hazy sky with generous empty space reserved as copy space.",
  "product-reactive":
    "Composition: subject right-of-center following the rule of thirds; the LEFT 55% of the frame is soft, uncluttered bokeh reserved as copy space; bottom edge simple and dark-toned.",
  "emotional-statement":
    "Composition: subject left-of-center; the LOWER-RIGHT quadrant is kept as calm, dark negative space (evening sky or soft bokeh) reserved as copy space.",
};

export function buildDesignedPhotoPrompt(
  template: PostTemplateKey,
  photoIdea: string,
  brandStyle?: string | null,
): string {
  return [
    photoIdea.trim(),
    COMPOSITION_BY_TEMPLATE[template],
    LIGHT_BY_TEMPLATE[template],
    BLOCK_CAMERA,
    BLOCK_UNIFORM,
    BLOCK_SAFETY,
    brandStyle?.trim() || null,
    "Portrait format.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Konzept-Generierung (gpt-4o-mini) mit Format-Formel + Zeichenbudgets
// ---------------------------------------------------------------------------

// Zeichenbudgets je Template (aus dem Layout abgeleitet; fitSize federt Rest ab)
const BUDGETS = {
  serifLine: 22,
  scriptLine: 26,
  statement: 118,
  headlineLineA: 17,
  headlineLinesA: 4,
  headlineLineC: 18,
  headlineLinesC: 3,
  subline: 88,
  copy: 130,
  microClaim: 34,
  featureTitle: 18,
  featureText: 42,
  cta: 30,
} as const;

/** Hartes Zeichenlimit, aber NIE mitten im Wort abschneiden. */
const clamp = (s: string | undefined, max: number) => {
  const t = (s ?? "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  // Nur am Wortende kürzen, wenn dabei nicht mehr als ~40 % verloren gehen.
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:–-]+$/, "");
};

/** Satz sauber abschließen: Endet er nicht mit Satzzeichen, wird ein Punkt ergänzt. */
export const ensurePunct = (s: string | undefined): string | undefined => {
  const t = (s ?? "").trim();
  if (!t) return t || undefined;
  return /[.!?…]$/.test(t) ? t : `${t}.`;
};

/**
 * Falsche Großschreibung an Zeilen-/Fortsetzungsanfängen korrigieren: Beginnt
 * eine Headline-Zeile mit einem großgeschriebenen Nicht-Substantiv (Artikel,
 * Präposition, Pronomen …) und schließt die vorige Zeile keinen Satz ab, wird
 * klein geschrieben (dt. „Ein Preis für / Alle Größen." → „… / alle Größen.").
 */
const LOWERCASE_CONTINUATION = new Set([
  "Alle","Aller","Allen","Alles","Und","Oder","Aber","Für","Von","Mit","Bei","Nach","Vor","Im","In","An","Am","Auf","Aus","Zum","Zur","Zu","Der","Die","Das","Den","Dem","Des","Ein","Eine","Einen","Einem","Einer","Eines","Wenn","Weil","Dass","Damit","Wie","Als","Ihr","Ihre","Ihren","Euer","Eure","Euren","Sich","Nicht","Kein","Keine","Jede","Jeder","Jedes","Beim","Ums","Übers",
]);
export function fixHeadlineCasing(lines: string[]): string[] {
  return lines.map((line, i) => {
    if (i === 0) return line;
    const prev = lines[i - 1]?.trim() ?? "";
    const prevEndsSentence = /[.!?…:]$/.test(prev);
    if (prevEndsSentence) return line;
    const first = line.split(" ")[0];
    if (LOWERCASE_CONTINUATION.has(first)) {
      return first.charAt(0).toLowerCase() + first.slice(1) + line.slice(first.length);
    }
    return line;
  });
}

/** Findet die erste enthaltene verbotene Floskel (case-insensitiv), sonst null. */
export function findBannedPhrase(text: string, phrases: string[] = BANNED_PHRASES): string | null {
  const hay = text.toLowerCase();
  for (const p of phrases) {
    if (hay.includes(p.toLowerCase())) return p;
  }
  return null;
}

/**
 * Caption erzeugen mit HARTER Floskel-Sperre: Enthält der erste Entwurf eine
 * verbotene Floskel, wird EINMAL gezielt neu getextet (die konkrete Floskel wird
 * benannt). Der Prompt allein reicht nicht immer — dieser Deterministik-Check schon.
 */
export async function generateCompliantCaption(opts: {
  apiKey?: string;
  captionPrompt: string;
  bannedPhrases?: string[];
}): Promise<string> {
  const banned = opts.bannedPhrases ?? BANNED_PHRASES;
  const first = await generateCaption({ apiKey: opts.apiKey, prompt: opts.captionPrompt });
  const hit = findBannedPhrase(first, banned);
  if (!hit) return first;
  const retry = await generateCaption({
    apiKey: opts.apiKey,
    prompt: `${opts.captionPrompt}\n\nACHTUNG: Dein vorheriger Entwurf enthielt die VERBOTENE Floskel „${hit}". Schreibe die Texte komplett neu und verwende diese Floskel (und alle anderen von der Verbotsliste) unter keinen Umständen — auch nicht als Teilsatz oder Variation.`,
  });
  // Zweiter Versuch bevorzugt, falls er sauber ist; sonst der weniger schlechte.
  return findBannedPhrase(retry, banned) ? first : retry;
}

/** Bester Hook-Text eines Konzepts (für die Caption — damit Bild & Text dieselbe Idee tragen). */
export function conceptHookText(concept: DesignedConcept): string {
  const o = concept.overlay;
  if (o.serifLine || o.scriptLine) return [o.serifLine, o.scriptLine].filter(Boolean).join(" ");
  if (o.statement) return o.statement;
  if (o.headline?.length) return o.headline.join(" ");
  return concept.message;
}

function outputSpecFor(format: ConceptFormat): string {
  switch (format.template) {
    case "emotional-minimal":
      return `"serifLine": "Zeile 1, Serifenschrift, max ${BUDGETS.serifLine} Zeichen, endet mit Punkt",
"scriptLine": "Zeile 2, elegante Schreibschrift, max ${BUDGETS.scriptLine} Zeichen — das Gefühl hinter Zeile 1"`;
    case "emotional-statement":
      return `"statement": "Das Statement, max ${BUDGETS.statement} Zeichen, 1-2 Sätze mit einer konkreten Zahl, einem sinnlichen Detail oder einem Kontrast"`;
    case "product-feature":
      return `"headline": ["Serifen-Headline als Array von ${BUDGETS.headlineLinesA} kurzen Zeilen, je max ${BUDGETS.headlineLineA} Zeichen — Umbrüche bewusst setzen"],
"subline": "1 Satz Nutzen-Subline, max ${BUDGETS.subline} Zeichen",
"features": [{"title": "Benefit-Titel max ${BUDGETS.featureTitle} Zeichen", "text": "Mini-Zeile max ${BUDGETS.featureText} Zeichen"}, …genau 3 Stück],
"cta": "CTA-Button-Text max ${BUDGETS.cta} Zeichen"`;
    case "product-reactive":
      return `"headline": ["Serifen-Headline als Array von 2-${BUDGETS.headlineLinesC} Zeilen, je max ${BUDGETS.headlineLineC} Zeichen"],
"copy": "2 Zeilen Fließtext, max ${BUDGETS.copy} Zeichen — Nutzen FÜHLEN lassen, nie technisch behaupten",
"microClaim": "Versalien-Mikro-Claim max ${BUDGETS.microClaim} Zeichen",
"cta": "CTA-Button-Text max ${BUDGETS.cta} Zeichen (oder null bei Soft-Post)"`;
  }
}

export async function generateDesignedConcept(opts: {
  apiKey?: string;
  format: ConceptFormat;
  reactiveHook?: string | null;
  topical?: string | null;
  avoid?: string[];
  month: number;
}): Promise<DesignedConcept> {
  const client = getOpenAIClient(opts.apiKey);
  const f = opts.format;

  const prompt = `Du bist Kreativ-Direktor für "Hersfelder Schützenbekleidung" (schuetzen-ausstatter.de) — Standardsortiment-Marke für Schützenvereine, Größen 23–70 zum gleichen Preis, KEINE Maßschneiderei.

DEINE AUFGABE: Entwickle EINEN konkreten Post nach diesem erprobten Konzept-Format:

FORMAT ${f.code} „${f.name}" (Säule: ${f.lane === "emotional" ? "EMOTIONAL" : "PRODUKT"}):
${f.brief}

SO GUT MÜSSEN DEINE HEADLINES SEIN (Qualitätsanker — NICHT kopieren, genauso stark NEU erfinden):
${f.exampleHeadlines.map((h) => `- "${h}"`).join("\n")}

FOTO-REGIE (als Basis für deine Szene):
${f.photoDirection}

${opts.reactiveHook ? `AKTUELLER AUFHÄNGER (MUSS die Idee tragen, im Text UND im Bild spürbar): ${opts.reactiveHook}` : ""}
${opts.topical ? `KONTEXT: ${opts.topical}` : ""}
Monat: ${opts.month} — Saisonbezug erlaubt, aber nur wenn er zur Idee beiträgt.

SPEZIFITÄTS-PFLICHT — die Headline braucht mindestens EINES davon: eine konkrete Zahl/Zeit, ein sinnliches Detail, einen Kontrast/Twist oder ein Wortspiel. Testfrage: Könnte der Satz von jedem beliebigen Ausstatter stammen? Dann neu schreiben.

ANSPRACHE: Immer „ihr/euch/euer" (Vereins-Du) — NIEMALS „Sie/Ihnen". CTA-Texte benennen konkret, was man anfragt (Muster, Beratung, Ausstattung) — nie generisches „Jetzt entdecken" o. Ä.

HARTE LEITPLANKEN (bei Verstoß ist der Post unbrauchbar):
- Die Headline ist EIN vollständiger, grammatikalisch korrekter Satz (über die Zeilen hinweg gelesen). NIEMALS ein Fragment, das mit Präposition/Konjunktion abbricht. FALSCH: „Für die Tage, an / alle Augen auf euch" (unvollständig). RICHTIG: „Für die Tage, an denen / der ganze Ort zusieht."
- Groß-/Kleinschreibung wie in einem durchgehenden Satz: NUR Satzanfänge und Substantive groß. FALSCH: [„Ein Preis für", „Alle Größen."] — RICHTIG: [„Ein Preis für", „alle Größen."]. Achte darauf, dass Zeilen-Fortsetzungen (Artikel, Präpositionen, Pronomen) klein bleiben.
- GRAMMATIK/FÄLLE müssen einwandfrei sein. Häufige Fehler vermeiden: „in einer Uniform" (NICHT „in einem"), „für euren Verein" (NICHT „für euer Verein"), „mit eurer Kompanie". Lies die Headline einmal komplett durch und prüfe die Fälle, bevor du sie ausgibst.
- Jede Zeile ist ein sinnvoller, lesbarer Teil — keine Wörter, die abgeschnitten wirken. Halte die Zeichen-Budgets ein, statt Sätze zu überlängen.
- KEINE schrägen Metaphern oder Fremd-Vergleiche (keine Tiere, Pferde/Reiter, Autos, Maschinen usw.) — bleib konkret beim Verein, den Menschen und dem Produkt.
- NIEMALS Schießen/Zielen/Gewehre/Waffen erwähnen (kein „Schuss", „Treffer", „schießen", „zielen") — weder im Text noch in der Foto-Szene. Die photoIdea zeigt Gemeinschaft, Fest, Kleidung — nie jemanden, der zielt/schießt/eine Waffe hält.
- ERFINDE KEINE Produktdetails, die nicht zur schlichten dunkelgrün-weißen Uniform passen (keine erfundenen Farben wie „hellblau", keine Fantasie-Ausstattung).
- WETTER/Temperatur nur erwähnen, wenn oben ein reaktiver Aufhänger genannt ist — sonst KEINE Gradzahlen oder Wetter-Floskeln in Headline/Subline/Copy.
- photoIdea: Menschen bevorzugt von hinten, im Profil, in Mitteldistanz oder als Detail/Büste (natürliche Gesichter/Hände, kein Uncanny-Valley); keine lesbare Schrift, keine Schilder, kein Logo im Bild.

VERBOTENE FLOSKELN (niemals verwenden): ${BANNED_PHRASES.join(" · ")}

VERBOTENE CLAIMS (niemals, auch nicht sinngemäß): maßgeschneidert, handgeschneidert, Einzelanfertigung, Maßkonfektion, atmungsaktiv, klimaregulierend, kühlend, temperaturregulierend, Funktionsstoff, Hightech-Faser. Komfort darf man FÜHLEN lassen („leicht", „angenehm"), nie technisch BEHAUPTEN.

${opts.avoid?.length ? `KÜRZLICH VERWENDET (nichts Ähnliches): ${opts.avoid.join(" | ")}` : ""}

Antworte NUR als JSON:
{
${outputSpecFor(f)},
"photoIdea": "Die konkrete Foto-Szene auf ENGLISCH, 2-3 Sätze, fotografisch präzise (wer/was, wo, Stimmung) — OHNE Text/Schrift im Bild, OHNE Logo",
"theme": "Thema in 3-6 Worten (deutsch)",
"product": "${f.lane === "product" ? "Das beworbene Produkt" : "Vereinsleben"}",
"message": "Kernbotschaft für die Caption in 1 Satz (max 90 Zeichen)"
}`;

  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Antworte ausschließlich mit validem JSON ohne Markdown." },
      { role: "user", content: prompt },
    ],
    temperature: 0.95,
    max_tokens: 600,
    response_format: { type: "json_object" },
  });
  await recordAiUsage({ operation: "concept", model: "gpt-4o-mini", usage: res.usage });

  const raw = JSON.parse(res.choices?.[0]?.message?.content ?? "{}") as Record<string, unknown>;

  // Overlay aus KI-Output + Format-Defaults zusammensetzen (Budgets hart erzwingen)
  const overlay: OverlayContent = { template: f.template };
  const finishHeadline = (lines: string[]): string[] => {
    const fixed = fixHeadlineCasing(lines);
    // letzten sinnvollen Satz-Abschluss sicherstellen
    if (fixed.length) fixed[fixed.length - 1] = ensurePunct(fixed[fixed.length - 1]) ?? fixed[fixed.length - 1];
    return fixed;
  };

  if (f.template === "emotional-minimal") {
    overlay.serifLine = ensurePunct(clamp(raw.serifLine as string, BUDGETS.serifLine + 6));
    overlay.scriptLine = ensurePunct(clamp(raw.scriptLine as string, BUDGETS.scriptLine + 6));
  } else if (f.template === "emotional-statement") {
    overlay.statement = ensurePunct(clamp(raw.statement as string, BUDGETS.statement + 20));
    overlay.url = "www.schuetzen-ausstatter.de";
  } else if (f.template === "product-feature") {
    overlay.headline = finishHeadline(
      (Array.isArray(raw.headline) ? raw.headline : [String(raw.headline ?? "")])
        .map((l) => clamp(String(l), BUDGETS.headlineLineA + 2))
        .filter(Boolean)
        .slice(0, BUDGETS.headlineLinesA),
    );
    overlay.subline = clamp(raw.subline as string, BUDGETS.subline + 15);
    const aiFeatures = Array.isArray(raw.features) ? (raw.features as { title?: string; text?: string }[]) : [];
    const defaults = f.benefits ?? [];
    overlay.features = defaults.map((d, i) => ({
      icon: d.icon,
      title: clamp(aiFeatures[i]?.title, BUDGETS.featureTitle + 4) || d.title,
      text: clamp(aiFeatures[i]?.text, BUDGETS.featureText + 8) || d.text,
    }));
    overlay.cta = clamp(raw.cta as string, BUDGETS.cta) || f.cta;
  } else {
    // Bewusst gesetzte Marken-Tagline der Produkt-Lane (steht so auf den echten
    // Vorbild-Posts: „TRADITION. VERBUNDEN."). Als Marken-Element whitelisted —
    // NICHT mit der gesperrten Floskel „Tradition verbindet" verwechseln.
    overlay.tagline = "Tradition. Verbunden.";
    overlay.headline = finishHeadline(
      (Array.isArray(raw.headline) ? raw.headline : [String(raw.headline ?? "")])
        .map((l) => clamp(String(l), BUDGETS.headlineLineC + 2))
        .filter(Boolean)
        .slice(0, BUDGETS.headlineLinesC),
    );
    overlay.copy = clamp(raw.copy as string, BUDGETS.copy + 20);
    overlay.microClaim = clamp(raw.microClaim as string, BUDGETS.microClaim + 6) || undefined;
    overlay.cta = f.cta ? clamp(raw.cta as string, BUDGETS.cta) || f.cta : undefined;
    overlay.url = "schuetzen-ausstatter.de";
    overlay.footerIcons = f.footerIcons;
    overlay.accentIcon = opts.reactiveHook?.toLowerCase().includes("regen")
      ? "cloud-rain"
      : f.code === "P2"
        ? "sun"
        : f.code === "P7"
          ? "gem"
          : f.code === "P10"
            ? "package-open"
            : "sparkles";
  }

  return {
    formatCode: f.code,
    template: f.template,
    overlay,
    photoIdea: String(raw.photoIdea ?? f.photoDirection),
    theme: clamp(raw.theme as string, 50) || f.name,
    product: clamp(raw.product as string, 60) || (f.lane === "product" ? f.name : "Vereinsleben"),
    message: clamp(raw.message as string, 100) || overlay.serifLine || overlay.statement || "",
  };
}

// ---------------------------------------------------------------------------
// Orchestrierung: Konzept → Foto → Composite → JPEG
// ---------------------------------------------------------------------------

export type DesignedPostResult = {
  concept: DesignedConcept;
  /** Fertiges Marken-Composite als JPEG (1024×1536) */
  jpeg: Buffer;
  photoPrompt: string;
};

export async function createDesignedPostImage(opts: {
  apiKey?: string;
  concept: DesignedConcept;
  brandStyle?: string | null;
}): Promise<DesignedPostResult> {
  const photoPrompt = buildDesignedPhotoPrompt(opts.concept.template, opts.concept.photoIdea, opts.brandStyle);

  const image = await generateImage({ apiKey: opts.apiKey, prompt: photoPrompt, size: "1024x1536" });
  if (!image.b64) throw new Error("Kein Foto von gpt-image-1 erhalten.");
  const photoDataUrl = `data:image/jpeg;base64,${image.b64}`;

  const png = await renderPost(opts.concept.overlay, photoDataUrl);
  // JPEG für alle Plattformen (TikTok akzeptiert kein PNG)
  const jpeg = await sharp(png).jpeg({ quality: 90 }).toBuffer();

  return { concept: opts.concept, jpeg, photoPrompt };
}
