import sharp from "sharp";
import { AI_PROVENANCE_XMP } from "./ai-provenance";
import { getOpenAIClient } from "./openai";
import { recordAiUsage } from "./ai-cost";
import { BANNED_PHRASES, type ConceptFormat } from "./concepts";
import { createDesignedPostImage, type DesignedConcept } from "./designed-post";
import { renderCarouselSlide, slideTextOf, type CarouselSlide } from "./render-carousel";
import type { FeatureTile, PosterLayoutKey } from "./render-poster";
import type { IconKey } from "./brand-icons";

/**
 * Karussell-Posts (Wiedereinführung Juli 2026).
 *
 * Warum das alte Karussell rausflog: Seine Slides waren Typografie auf grünem
 * Verlauf — genau der Look, den die Poster-Engine v3 abgeschafft hat — und es
 * war eine dritte Render-Engine neben Poster und Reel.
 *
 * Der neue Aufbau vermeidet beides:
 *  - Slide 1 (Cover) ist ein vollwertiger designter Post aus der Poster-Engine:
 *    echtes Foto + eine starke Aussage + Wisch-Hinweis. Das ist die Slide, die
 *    im Feed erscheint — sie MUSS für sich allein funktionieren, sonst wischt
 *    niemand weiter.
 *  - Slides 2…n sind klassische Karussell-Inhaltsslides (helle Marken-Fläche,
 *    Ordnungszahl, Serifen-Headline, ruhiger Fließtext) und die letzte Slide
 *    schließt mit Fazit + CTA + Beweisen ab.
 *
 * Die Idee kommt aus demselben Konzept-System wie alle anderen Posts — das
 * Karussell erzählt also nichts Fremdes, sondern faltet EINE Idee auf.
 */

/**
 * Cover-Layouts: nur die drei Statement-Layouts. Ein Karussell-Cover soll eine
 * Aussage groß setzen und Neugier machen — Benefit-Leiste (`panel-links`) und
 * CTA-Feld (`panel-cta`) gehören ans ENDE des Karussells, nicht auf Slide 1.
 */
export const CAROUSEL_COVER_LAYOUTS: readonly PosterLayoutKey[] = [
  "zentral-minimal",
  "karte-unten",
  "band-unten",
];

export const SWIPE_HINT = "Wischen";

/** Wie viele Inhalts-Slides zwischen Cover und Abschluss. */
export const MIN_POINTS = 3;
export const MAX_POINTS = 5;

/** Icons, aus denen die KI je Inhalts-Slide eines wählen darf. */
const SLIDE_ICONS: IconKey[] = [
  "users",
  "shirt",
  "ruler",
  "euro",
  "repeat",
  "package",
  "badge-check",
  "shield-check",
  "handshake",
  "calendar-check",
  "heart",
  "gem",
  "sparkles",
  "leaf",
];

/** Beweis-Trio für die Abschluss-Slide, wenn das Format keines mitbringt. */
const DEFAULT_BENEFITS: FeatureTile[] = [
  { icon: "badge-check", title: "Eigene Fertigung", text: "Entwickelt und produziert im Haus" },
  { icon: "ruler", title: "Normal- & Kurzgrößen", text: "Für jede Statur die passende Größe" },
  { icon: "repeat", title: "Nachkaufgarantie", text: "Festes Design, jederzeit nachbestellbar" },
];

/** CTA der Abschluss-Slide, wenn das Format keinen eigenen hat (Emotional-Säule). */
const DEFAULT_CTA = {
  title: "Musterkollektion für euren Verein anfragen",
  sub: "Für Schützenvereine, Spielmannszüge und Bruderschaften.",
};

const BRAND_URL = "schuetzen-ausstatter.de";

// Zeichen-Budgets der Inhalts-Slides. Großzügiger als beim Plakat: Hier hat man
// die volle Fläche und der Leser ist schon eingestiegen.
const B_KICKER = 24;
const B_HEAD_LINE = 22;
const B_HEAD_LINES = 3;
const B_BODY = 165;
const B_OUTRO_LINE = 22;
const B_SCRIPT = 24;

const clamp = (s: unknown, max: number): string => {
  const t = String(s ?? "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:–-]+$/, "");
};

const ensurePunct = (s: string): string => (!s || /[.!?…]$/.test(s) ? s : `${s}.`);

const toLines = (v: unknown, maxLines: number, maxLen: number): string[] =>
  (Array.isArray(v) ? v : v ? [v] : [])
    .map((l) => clamp(l, maxLen))
    .filter(Boolean)
    .slice(0, maxLines);

/** Rohantwort der Story-KI (bewusst tolerant typisiert). */
export type RawCarouselStory = {
  points?: { icon?: string; kicker?: string; heading?: unknown; body?: string }[];
  outro?: { heading?: unknown; scriptAccent?: string; ctaTitle?: string; ctaSub?: string };
};

/**
 * Baut aus der KI-Rohantwort die fertigen Slides — deterministisch und ohne
 * Netzwerk, damit genau dieser Schritt testbar bleibt.
 *
 * Wie beim Plakat gilt die Arbeitsteilung: Die KI liefert die IDEE-Texte, der
 * Marken-Rahmen (Beweis-Trio, CTA-Feld, Adresse) kommt fest aus dem Format.
 */
export function buildCarouselSlides(raw: RawCarouselStory, format: ConceptFormat): CarouselSlide[] {
  const points = (raw.points ?? [])
    .map((p, i) => {
      const heading = toLines(p.heading, B_HEAD_LINES, B_HEAD_LINE);
      if (!heading.length) return null;
      heading[heading.length - 1] = ensurePunct(heading[heading.length - 1]);
      const icon = SLIDE_ICONS.includes(p.icon as IconKey) ? (p.icon as IconKey) : SLIDE_ICONS[i % SLIDE_ICONS.length];
      const kicker = clamp(p.kicker, B_KICKER);
      const body = ensurePunct(clamp(p.body, B_BODY));
      return {
        kind: "punkt" as const,
        number: 0, // wird unten fortlaufend gesetzt
        icon,
        kicker: kicker || undefined,
        heading,
        body: body || undefined,
      };
    })
    .filter(Boolean)
    .slice(0, MAX_POINTS) as Extract<CarouselSlide, { kind: "punkt" }>[];

  points.forEach((p, i) => {
    p.number = i + 1;
  });

  const outroHeading = toLines(raw.outro?.heading, 2, B_OUTRO_LINE);
  if (outroHeading.length) outroHeading[outroHeading.length - 1] = ensurePunct(outroHeading[outroHeading.length - 1]);

  const outro: CarouselSlide = {
    kind: "abschluss",
    heading: outroHeading.length ? outroHeading : ["Ein Auftritt.", "Ein Verein."],
    scriptAccent: ensurePunct(clamp(raw.outro?.scriptAccent, B_SCRIPT)) || undefined,
    // Marken-Rahmen: fest aus dem Format, nicht von der KI.
    cta: format.cta ?? DEFAULT_CTA,
    benefits: format.benefits ?? DEFAULT_BENEFITS,
    url: BRAND_URL,
  };

  return [...points, outro];
}

/**
 * Erzeugt die Folge-Slides zu einem bereits fertigen Cover-Konzept. Die
 * Cover-Headline wird bewusst mitgegeben: Das Karussell soll GENAU diese
 * Aussage auffalten, nicht ein neues Thema aufmachen.
 */
export async function generateCarouselStory(opts: {
  apiKey?: string;
  concept: DesignedConcept;
  format: ConceptFormat;
  /** Gewünschte Anzahl Inhalts-Slides (ohne Cover und Abschluss). */
  points?: number;
}): Promise<CarouselSlide[]> {
  const client = getOpenAIClient(opts.apiKey);
  const count = Math.min(MAX_POINTS, Math.max(MIN_POINTS, opts.points ?? 4));
  const cover = opts.concept.poster;
  const coverText = [cover.kicker, ...(cover.headline ?? []), cover.scriptAccent, cover.sub].filter(Boolean).join(" ");

  const prompt = `Du bist Kreativ-Direktor für "Hersfelder Schützenbekleidung" (schuetzen-ausstatter.de) — Standardsortiment-Marke für Schützenvereine, Spielmannszüge, Musikzüge und Bruderschaften. Eigene Marke, eigene Fertigung, jede Größe zum gleichen Preis, KEINE Maßschneiderei.

DU BAUST EIN INSTAGRAM-KARUSSELL. Das COVER steht schon fest:
Cover-Aussage: „${coverText}"
Cover-Motiv: ${opts.concept.photoIdea}
Kernbotschaft: ${opts.concept.message}
Konzept-Format ${opts.format.code} „${opts.format.name}" (Säule: ${opts.format.lane === "emotional" ? "EMOTIONAL" : "PRODUKT"}):
${opts.format.brief}

DEINE AUFGABE: Falte GENAU DIESE Aussage in ${count} Inhalts-Slides auf — kein neues Thema. Slide für Slide ein eigener Gedanke, der aufeinander aufbaut und beim Wischen belohnt: erst der Einstieg, dann die konkreten Punkte, am Ende der stärkste.

SO DENKT DIE ZIELGRUPPE: Vereinsmitglieder UND die Menschen, die beschaffen (Vorstand, Uniformwart, Einkauf). Sie wollen wissen, was ihnen das konkret bringt — kein Katalog-Sprech.

REGELN FÜR JEDE SLIDE:
- "heading": 1-3 Zeilen, je max ${B_HEAD_LINE} Zeichen. Über alle Zeilen gelesen EIN vollständiger, korrekter Satz. Die letzte Zeile schließt den Satz ab — NIEMALS mit Präposition, Artikel oder Konjunktion enden.
- "body": 1-2 vollständige Sätze, max ${B_BODY} Zeichen — konkret, ruhig, ohne Superlative.
- "kicker": kurze Versalien-Einordnung, max ${B_KICKER} Zeichen. Darf die Headline NICHT wiederholen. (oder null)
- "icon": genau EIN Schlüssel aus dieser Liste, passend zum Inhalt: ${SLIDE_ICONS.join(", ")}
- Groß-/Kleinschreibung wie in einem durchgehenden Satz. Grammatik und Fälle müssen einwandfrei sein.
- ANSPRACHE: immer „ihr/euch/euer" — NIEMALS „Sie/Ihnen".
- SPEZIFITÄT: jede Slide braucht etwas Konkretes (Zahl, Detail, Situation, Kontrast). Austauschbare Sätze streichen.

HARTE VERBOTE (bei Verstoß ist das Karussell unbrauchbar):
- NIEMALS Schießen/Zielen/Gewehre/Waffen erwähnen.
- VERBOTENE CLAIMS: maßgeschneidert, handgeschneidert, Einzelanfertigung, Maßkonfektion, Schneiderhandwerk, atmungsaktiv, klimaregulierend, kühlend, temperaturregulierend, Funktionsstoff. Komfort darf man FÜHLEN lassen („leicht", „angenehm"), nie technisch BEHAUPTEN.
- VERBOTENE FLOSKELN: ${BANNED_PHRASES.join(" · ")}
- Keine erfundenen Produktdetails, keine Fantasie-Ausstattung, keine Preisangaben.

ABSCHLUSS-SLIDE: nur eine kurze Fazit-Zeile (max 2 Zeilen à ${B_OUTRO_LINE} Zeichen) plus optional eine Schreibschrift-Zeile (max ${B_SCRIPT} Zeichen). Den CTA setzt die Marke selbst — erfinde KEINEN.

Antworte NUR als JSON:
{
  "points": [
    { "icon": "…", "kicker": "… (oder null)", "heading": ["Zeile 1", "Zeile 2"], "body": "1-2 Sätze" }
  ],
  "outro": { "heading": ["Zeile 1", "Zeile 2"], "scriptAccent": "… (oder null)" }
}
Genau ${count} Einträge in "points".`;

  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Antworte ausschließlich mit validem JSON ohne Markdown." },
      { role: "user", content: prompt },
    ],
    temperature: 0.9,
    max_tokens: 1100,
    response_format: { type: "json_object" },
  });
  await recordAiUsage({ operation: "carousel", model: "gpt-4o-mini", usage: res.usage });

  const raw = JSON.parse(res.choices?.[0]?.message?.content ?? "{}") as RawCarouselStory;
  const slides = buildCarouselSlides(raw, opts.format);

  // Ohne Inhalts-Slides wäre es kein Karussell, sondern ein Einzelpost mit
  // Anhang — dann lieber laut scheitern und neu versuchen.
  if (slides.filter((s) => s.kind === "punkt").length < MIN_POINTS) {
    throw new Error("Karussell-Story: zu wenige verwertbare Inhalts-Slides von der KI.");
  }
  return slides;
}

export type CarouselImages = {
  /** Cover (Slide 1) — der Post, der im Feed erscheint. */
  cover: Buffer;
  /** Folge-Slides in Reihenfolge. */
  slides: Buffer[];
  photoPrompt: string;
};

/**
 * Rendert das komplette Karussell: Cover über die Poster-Engine (inkl. Foto und
 * Wisch-Hinweis), Folge-Slides über die Karussell-Engine. Alle Bilder bekommen
 * die KI-Kennzeichnung in den Metadaten — auch die reinen Text-Slides, denn
 * ihre Inhalte stammen ebenfalls aus der KI.
 */
export async function createCarouselImages(opts: {
  apiKey?: string;
  concept: DesignedConcept;
  slides: CarouselSlide[];
  brandStyle?: string | null;
}): Promise<CarouselImages> {
  const total = opts.slides.length + 1; // + Cover

  const rendered = await createDesignedPostImage({
    apiKey: opts.apiKey,
    concept: opts.concept,
    brandStyle: opts.brandStyle,
  });

  const slides: Buffer[] = [];
  for (let i = 0; i < opts.slides.length; i++) {
    const png = await renderCarouselSlide(opts.slides[i], i + 2, total);
    slides.push(await sharp(png).withXmp(AI_PROVENANCE_XMP).jpeg({ quality: 90 }).toBuffer());
  }

  return { cover: rendered.jpeg, slides, photoPrompt: rendered.photoPrompt };
}

/** Alle gerenderten Slide-Texte — Grundlage für Caption-Kontext und Protokoll. */
export function carouselTextOf(slides: CarouselSlide[]): string {
  return slides.map(slideTextOf).join(" || ");
}
