import sharp from "sharp";
import { getOpenAIClient, generateImage, generateCaption } from "./openai";
import { recordAiUsage } from "./ai-cost";
import { BANNED_PHRASES, type ConceptFormat, type Lane } from "./concepts";
import { renderPoster, type PosterContent, type PosterLayoutKey } from "./render-poster";

/**
 * Designte Posts (Zwei-Säulen-System): Konzept-KI → Foto (ohne Text) →
 * programmatisches Marken-Layout (Poster-Engine v3) → JPEG.
 *
 * Der Unterschied zum alten Weg: Erst entsteht die IDEE (Konzept mit Headline
 * nach Format-Formel), daraus werden Foto-Prompt UND Plakat-Text abgeleitet —
 * Bild und Text erzählen garantiert dieselbe Geschichte, und der Text ist
 * pixel-perfekt gerendert statt KI-gemalt.
 *
 * Arbeitsteilung KI ↔ Marke:
 *  - Die KI liefert nur die IDEE-Texte (Kicker, Headline, Akzent, Sub, Copy).
 *  - Alles, was die Marke wiedererkennbar macht — Benefit-Kacheln, CTA-Feld,
 *    Fußleiste, Tagline, Adresse — kommt fest aus dem Konzept-Format.
 *    Genau deshalb sehen die Vorbild-Posts konsistent aus und nicht wie
 *    30 verschiedene Absender.
 */

/** Die Marken-Zeile unter dem Wappen auf den Produkt-Plakaten. */
const BRAND_TAGLINE = "Tradition. Verbunden.";
const BRAND_URL = "schuetzen-ausstatter.de";

/**
 * Wählt ein Plakat-Layout aus denen, die zum Format passen — bevorzugt eines,
 * das zuletzt NICHT dran war, damit der Feed abwechslungsreich bleibt.
 */
export function pickPosterLayout(
  format: ConceptFormat,
  avoidCodes: string[] = [],
  random: () => number = Math.random,
): PosterLayoutKey {
  const pool = format.layouts;
  const fresh = pool.filter((l) => !avoidCodes.includes(l));
  const candidates = fresh.length ? fresh : pool;
  return candidates[Math.floor(random() * candidates.length)];
}

export type DesignedConcept = {
  formatCode: string;
  lane: Lane;
  /** Der fertige Plakat-Inhalt für die Poster-Engine. */
  poster: PosterContent;
  /** Layout-Schlüssel für die Rotation, landet in post_briefs.template. */
  posterCode: PosterLayoutKey;
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

/**
 * Der Anschnitt: Wir erzeugen 2:3 und rendern 4:5 — oben und unten fallen je
 * ~8 % weg. Ohne diesen Hinweis landen Köpfe oder Motiv-Kanten im Beschnitt.
 */
const BLOCK_CROP = `Framing safety: the final image is cropped to a 4:5 aspect ratio from the center, so keep the top 10% and the bottom 10% of the frame free of essential subject matter.`;

/** Copy-Space-Regie je Layout — fotografisch formuliert (funktioniert zuverlässig) */
const COMPOSITION_BY_LAYOUT: Record<PosterLayoutKey, string> = {
  "panel-links":
    "Composition: subjects on the RIGHT HALF of the frame; the LEFT 45% is calm, low-detail negative space (soft out-of-focus background) reserved as copy space. Keep the bottom sixth simple.",
  "panel-cta":
    "Composition: subject right-of-center following the rule of thirds; the LEFT 55% of the frame is soft, uncluttered bokeh reserved as copy space.",
  "zentral-minimal":
    "Composition: subjects in the lower two thirds of the frame; the UPPER THIRD is bright hazy sky or soft light with generous empty space reserved as copy space.",
  "karte-unten":
    "Composition: the main subject sits in the upper-right two thirds; the LOWER-LEFT quadrant is calm, low-detail negative space reserved as copy space.",
  "band-unten":
    "Composition: the subject is centered in the upper two thirds of the frame and fully visible there; the lower third may be plain ground, bokeh or shadow.",
};

/** Lichtstimmung je Säule — Produkt klarer, Emotional wärmer. */
const LIGHT_BY_LANE: Record<Lane, string> = {
  product: "Bright soft daylight, gentle diffusion, airy and friendly, clean and true colours.",
  emotional: "Warm golden-hour sunlight, long soft shadows, festive glow.",
};

export function buildDesignedPhotoPrompt(
  layout: PosterLayoutKey,
  lane: Lane,
  photoIdea: string,
  brandStyle?: string | null,
): string {
  return [
    photoIdea.trim(),
    COMPOSITION_BY_LAYOUT[layout],
    BLOCK_CROP,
    LIGHT_BY_LANE[lane],
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

/**
 * Zeichen-Budgets je Layout. Bewusst knapp und pro Layout unterschiedlich:
 * Im schmalen Creme-Panel ist bei ~14 Zeichen Schluss, im breiten Band unten
 * passt gut das Doppelte. Zu lange Zeilen kippen sonst das Layout.
 */
type Budget = {
  kicker: number;
  headlineLine: number;
  headlineLines: number;
  scriptAccent: number;
  sub: number;
  copy: number;
};

const BUDGETS: Record<PosterLayoutKey, Budget> = {
  "panel-links": { kicker: 22, headlineLine: 14, headlineLines: 5, scriptAccent: 0, sub: 82, copy: 0 },
  "panel-cta": { kicker: 22, headlineLine: 17, headlineLines: 4, scriptAccent: 0, sub: 0, copy: 150 },
  "zentral-minimal": { kicker: 22, headlineLine: 24, headlineLines: 2, scriptAccent: 24, sub: 0, copy: 0 },
  "karte-unten": { kicker: 22, headlineLine: 19, headlineLines: 3, scriptAccent: 22, sub: 105, copy: 0 },
  "band-unten": { kicker: 22, headlineLine: 24, headlineLines: 3, scriptAccent: 22, sub: 120, copy: 0 },
};

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

/**
 * Kicker verwerfen, wenn er die Headline nur doppelt: Steht „DIE DAMENWESTE"
 * direkt über „Die Damenweste für alle, die …", liest sich das Plakat wie ein
 * Fehler. Der Prompt allein verhindert das nicht zuverlässig — diese Regel schon.
 */
export function dropRedundantKicker(kicker: string | undefined, headline: string[]): string | undefined {
  const k = (kicker ?? "").trim();
  if (!k) return undefined;
  // Satzzeichen raus, Mehrfach-Leerzeichen zusammen — Umlaute bleiben erhalten.
  const norm = (s: string) =>
    s.toLowerCase().replace(/[.,;:!?…„“"'’‚‘()\[\]{}\-–—/]/g, " ").replace(/\s+/g, " ").trim();
  const nk = norm(k);
  const nh = norm(headline.join(" "));
  if (!nk || !nh) return k;
  // Deckungsgleich, Anfang der Headline, oder komplett darin enthalten → raus.
  if (nh === nk || nh.startsWith(nk) || nh.includes(nk)) return undefined;
  // Auch die ersten zwei Wörter dürfen sich nicht decken.
  const firstTwo = (s: string) => s.split(" ").slice(0, 2).join(" ");
  if (firstTwo(nk).split(" ").length === 2 && firstTwo(nk) === firstTwo(nh)) return undefined;
  return k;
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
  // Bei Abbruch am Token-Limit wirft generateCaption — dann einmal kürzer
  // nachfordern, statt den ganzen Post scheitern zu lassen.
  let first: string;
  try {
    first = await generateCaption({ apiKey: opts.apiKey, prompt: opts.captionPrompt });
  } catch {
    first = await generateCaption({
      apiKey: opts.apiKey,
      prompt: `${opts.captionPrompt}\n\nWICHTIG: Fasse dich deutlich kürzer. Jeder Plattform-Abschnitt maximal 4 Sätze. Jeder Abschnitt MUSS vollständig zu Ende geschrieben sein — niemals mitten im Satz abbrechen.`,
    });
  }
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
  const p = concept.poster;
  const lines = [p.headline?.join(" "), p.scriptAccent, p.sub, p.copy].filter(Boolean);
  return lines.length ? lines.join(" ") : concept.message;
}

/**
 * Ausgabe-Spezifikation für die Konzept-KI. Hängt am gewählten Layout: Das
 * zentrale Emotional-Plakat will zwei kurze Zeilen plus Schreibschrift, das
 * Produkt-Panel eine mehrzeilige Headline plus Nutzen-Zeile.
 */
function outputSpecFor(format: ConceptFormat, layout: PosterLayoutKey): string {
  const b = BUDGETS[layout];
  const parts: string[] = [];

  parts.push(
    `"kicker": "Kleine Versalien-Zeile ÜBER der Headline, max ${b.kicker} Zeichen — eine EINORDNUNG wie „Die Damenweste" oder „Der Tag nach dem Fest". PFLICHT: Der Kicker darf die Headline NICHT wiederholen und nicht mit denselben Wörtern beginnen wie sie. FALSCH: Kicker „Die Damenweste" + Headline „Die Damenweste für alle …" — das steht dann zweimal übereinander. RICHTIG: Kicker „Für Damenkompanien" + Headline „Die Damenweste für alle …". (oder null)"`,
  );
  parts.push(
    `"headline": ["Die Plakat-Headline als Array von ${b.headlineLines === 2 ? "genau 2" : `2-${b.headlineLines}`} Zeilen, je max ${b.headlineLine} Zeichen. Über alle Zeilen gelesen EIN vollständiger, korrekter Satz (oder zwei kurze Sätze). Setze die Umbrüche bewusst an natürlichen Wortgrenzen. PFLICHT: Die LETZTE Zeile schließt den Satz ab — sie darf NIEMALS mit einer Präposition (auf, in, für, mit, an, zu), einem Artikel (der/die/das/ein) oder einer Konjunktion (und, oder, aber) enden. FALSCH: [„Der erste Auftritt im", „neuen Outfit — und", „alle Blicke sind auf."] — hier fehlt das Satzende. RICHTIG: [„Der erste Auftritt", „im neuen Outfit.", „Alle Blicke da."]. Lies die Headline vor der Ausgabe einmal laut und prüfe, ob der Satz wirklich zu Ende ist."]`,
  );

  if (b.scriptAccent > 0) {
    parts.push(
      `"scriptAccent": "Kurze Schreibschrift-Akzentzeile UNTER der Headline, max ${b.scriptAccent} Zeichen — das Gefühl hinter der Headline, ein eigener kurzer Satz (oder null)"`,
    );
  } else {
    parts.push(`"scriptAccent": null`);
  }

  if (b.sub > 0) {
    parts.push(
      `"sub": "Eine ruhige Begleitzeile, max ${b.sub} Zeichen${format.lane === "product" ? " — konkreter Nutzen oder der Größen-USP (23–70, ein Preis)" : ""} (oder null)"`,
    );
  } else {
    parts.push(`"sub": null`);
  }

  if (b.copy > 0) {
    parts.push(
      `"copy": "Fließtext im Panel, 1-2 vollständige Sätze, max ${b.copy} Zeichen — erklärt den Nutzen konkret und ruhig. KEINE Technik-Claims."`,
    );
  } else {
    parts.push(`"copy": null`);
  }

  return parts.join(",\n");
}

/**
 * Baut ein synthetisches Konzept-Format aus den FREIEN Eingaben des manuellen
 * Generators (Thema/Produkt/Botschaft). So läuft auch der manuelle Weg über die
 * designte Pipeline inkl. aller Leitplanken — nur dass Inhalt/Idee vom Nutzer
 * vorgegeben statt aus einer Format-Formel gezogen wird.
 */
export function buildManualFormat(
  lane: Lane,
  input: { theme: string; product: string; message: string },
): ConceptFormat {
  const subject = `Thema: „${input.theme}". Produkt/Kontext: „${input.product}". Kernbotschaft: „${input.message}".`;
  if (lane === "product") {
    return {
      code: "MANUAL-P",
      lane: "product",
      name: input.theme?.slice(0, 40) || "Manueller Produkt-Post",
      layouts: ["panel-links", "panel-cta"],
      brief: `Setze GENAU diese Vorgaben des Nutzers als Produkt-Post um. ${subject} Die Headline dreht sich um genau dieses Produkt/diese Botschaft; erfinde nichts Fremdes hinzu.`,
      exampleHeadlines: [
        "Die Damenweste für alle, die Tradition modern leben.",
        "Vom Jungschützen bis zum Ehrenvorstand. Ein Preis für alle.",
      ],
      photoDirection: `Ein markttreues, authentisches Foto passend zu „${input.product}" und „${input.theme}" — dunkelgrüne Schützenkleidung, schlicht-elegant.`,
      benefits: [
        { icon: "badge-check", title: "Eigene Fertigung", text: "Entwickelt und produziert im Haus" },
        { icon: "ruler", title: "Größen 23–70", text: "Für jedes Mitglied die passende Größe" },
        { icon: "handshake", title: "Faire Vereinspreise", text: "Top Qualität zu attraktiven Konditionen" },
      ],
      cta: { title: "Muster & Beratung anfragen", sub: "Für euren Verein oder Zug." },
      footerNotes: [
        { icon: "shield-check", label: "Konstante Qualität" },
        { icon: "repeat", label: "Jederzeit nachbestellbar" },
      ],
    };
  }
  return {
    code: "MANUAL-E",
    lane: "emotional",
    name: input.theme?.slice(0, 40) || "Manueller Emotional-Post",
    layouts: ["zentral-minimal", "karte-unten", "band-unten"],
    brief: `Setze GENAU diese Vorgaben des Nutzers als emotionalen Post um. ${subject} Formuliere daraus eine Headline, die genau diese Botschaft trägt — kein fremdes Thema.`,
    exampleHeadlines: ["Gemeinsam heute. / Tradition für morgen.", "Eingehakt am Festplatz. / Das Gefühl von Zuhause."],
    photoDirection: `Ein authentisches, warmes Reportage-Foto passend zu „${input.theme}" — Menschen bevorzugt von hinten/Profil in dunkelgrünen Schützenwesten/-jacken, Festplatz-Stimmung, goldenes Licht.`,
  };
}

export async function generateDesignedConcept(opts: {
  apiKey?: string;
  format: ConceptFormat;
  reactiveHook?: string | null;
  topical?: string | null;
  avoid?: string[];
  month: number;
  /** Zuletzt genutzte Layouts — für Abwechslung im Feed. */
  avoidLayouts?: string[];
}): Promise<DesignedConcept> {
  const client = getOpenAIClient(opts.apiKey);
  const f = opts.format;
  // Layout ZUERST wählen: es bestimmt, welche Texte in welcher Länge gebraucht werden.
  const layout = pickPosterLayout(f, opts.avoidLayouts ?? []);
  const b = BUDGETS[layout];

  // Wetter-Aufhänger nur für Formate, die ihn inhaltlich tragen. Vorher bekam
  // JEDES Format den Hook — so entstand „Bei 35 Grad bewegt ihr euch trotzdem
  // mit." auf einem Post über Spielmannszug-Ausstattung. Die Bremse sitzt hier
  // und nicht in den Routen, damit Cron, Generator und Zufall sie gemeinsam erben.
  const reactiveHook = f.weatherReactive ? (opts.reactiveHook ?? null) : null;
  const topical = reactiveHook ? (opts.topical ?? null) : null;

  const prompt = `Du bist Kreativ-Direktor für "Hersfelder Schützenbekleidung" (schuetzen-ausstatter.de) — Standardsortiment-Marke für Schützenvereine, Spielmannszüge, Musikzüge und Bruderschaften. Eigene Marke, eigene Fertigung, Größen 23–70 zum gleichen Preis, KEINE Maßschneiderei.

DEINE AUFGABE: Entwickle EINEN konkreten Post nach diesem erprobten Konzept-Format:

FORMAT ${f.code} „${f.name}" (Säule: ${f.lane === "emotional" ? "EMOTIONAL" : "PRODUKT"}):
${f.brief}

SO GUT MÜSSEN DEINE HEADLINES SEIN (Qualitätsanker — NICHT kopieren, genauso stark NEU erfinden):
${f.exampleHeadlines.map((h) => `- "${h}"`).join("\n")}

FOTO-REGIE (als Basis für deine Szene):
${f.photoDirection}

${reactiveHook ? `AKTUELLER AUFHÄNGER (MUSS die Idee tragen, im Text UND im Bild spürbar): ${reactiveHook}` : ""}
${topical ? `KONTEXT: ${topical}` : ""}
Monat: ${opts.month} — Saisonbezug erlaubt, aber nur wenn er zur Idee beiträgt.

SPEZIFITÄTS-PFLICHT — die Headline braucht mindestens EINES davon: eine konkrete Zahl/Zeit, ein sinnliches Detail, einen Kontrast/Twist oder ein Wortspiel. Testfrage: Könnte der Satz von jedem beliebigen Ausstatter stammen? Dann neu schreiben.

ANSPRACHE: Immer „ihr/euch/euer" (Vereins-Du) — NIEMALS „Sie/Ihnen". Die Zielgruppe sind Vereinsmitglieder UND die Menschen, die beschaffen: Vorstand, Uniformwart, Einkauf.

HARTE LEITPLANKEN (bei Verstoß ist der Post unbrauchbar):
- Die Headline ist EIN vollständiger, grammatikalisch korrekter Satz (über die Zeilen hinweg gelesen) oder zwei kurze vollständige Sätze. NIEMALS ein Fragment, das mit Präposition/Konjunktion abbricht.
- Groß-/Kleinschreibung wie in einem durchgehenden Satz: NUR Satzanfänge und Substantive groß. FALSCH: [„Ein Preis für", „Alle Größen."] — RICHTIG: [„Ein Preis für", „alle Größen."].
- GRAMMATIK/FÄLLE müssen einwandfrei sein. Häufige Fehler vermeiden: „in einer Uniform" (NICHT „in einem"), „für euren Verein" (NICHT „für euer Verein"), „euer Einsatz" (NICHT „eure Einsatz"), „mit eurer Kompanie". Lies die Headline einmal komplett durch und prüfe die Fälle, bevor du sie ausgibst.
- Halte die Zeichen-Budgets ein, statt Sätze zu überlängen. Jede Zeile ist ein sinnvoller, lesbarer Teil.
- KEINE schrägen Metaphern oder Fremd-Vergleiche (keine Tiere, Pferde/Reiter, Autos, Maschinen usw.) — bleib konkret beim Verein, den Menschen und dem Produkt.
- NIEMALS Schießen/Zielen/Gewehre/Waffen erwähnen (kein „Schuss", „Treffer", „schießen", „zielen") — weder im Text noch in der Foto-Szene. Die photoIdea zeigt Gemeinschaft, Fest, Kleidung — nie jemanden, der zielt/schießt/eine Waffe hält.
- ERFINDE KEINE Produktdetails, die nicht zur schlichten dunkelgrün-weißen Uniform passen (keine erfundenen Farben, keine Fantasie-Ausstattung).
- WETTER/Temperatur nur erwähnen, wenn oben ein reaktiver Aufhänger genannt ist — sonst KEINE Gradzahlen oder Wetter-Floskeln.
- Auch wenn ein Wetter-Aufhänger genannt ist: NIE behaupten, die Kleidung kühle, halte kühl oder trocken. Erlaubt ist die Situation („bei 30 Grad im Zug"), verboten ist die Wirkung auf den Körper.
- photoIdea: Menschen bevorzugt von hinten, im Profil, in Mitteldistanz oder als Detail (natürliche Gesichter/Hände, kein Uncanny-Valley); keine lesbare Schrift, keine Schilder, kein Logo im Bild.

VERBOTENE FLOSKELN (niemals verwenden): ${BANNED_PHRASES.join(" · ")}

VERBOTENE CLAIMS (niemals, auch nicht sinngemäß): maßgeschneidert, handgeschneidert, Einzelanfertigung, Maßkonfektion, exklusiv gefertigt, Schneiderhandwerk, Couture, atmungsaktiv, klimaregulierend, kühlend, temperaturregulierend, Funktionsstoff, Hightech-Faser. Komfort darf man FÜHLEN lassen („leicht", „angenehm"), nie technisch BEHAUPTEN.

${opts.avoid?.length ? `KÜRZLICH VERWENDET (nichts Ähnliches): ${opts.avoid.join(" | ")}` : ""}

Antworte NUR als JSON:
{
${outputSpecFor(f, layout)},
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
    max_tokens: 700,
    response_format: { type: "json_object" },
  });
  await recordAiUsage({ operation: "concept", model: "gpt-4o-mini", usage: res.usage });

  const raw = JSON.parse(res.choices?.[0]?.message?.content ?? "{}") as Record<string, unknown>;

  const finishHeadline = (lines: string[]): string[] => {
    const fixed = fixHeadlineCasing(lines);
    // letzten sinnvollen Satz-Abschluss sicherstellen
    if (fixed.length) fixed[fixed.length - 1] = ensurePunct(fixed[fixed.length - 1]) ?? fixed[fixed.length - 1];
    return fixed;
  };

  const headline = finishHeadline(
    (Array.isArray(raw.headline) ? raw.headline : raw.headline ? [String(raw.headline)] : [])
      .map((l) => clamp(String(l), b.headlineLine + 3))
      .filter(Boolean)
      .slice(0, b.headlineLines),
  );

  // Die Adresse nur setzen, wo das Layout sie auch WIRKLICH rendert. Sonst
  // bekäme der QA-Agent Text gemeldet, der im Bild gar nicht steht — und
  // reklamiert zu Recht einen Bild-Text-Widerspruch.
  const zeigtUrl = layout === "panel-cta" || layout === "band-unten";

  const finalHeadline = headline.length ? headline : [f.name];

  const poster: PosterContent = {
    layout,
    kicker: dropRedundantKicker(clamp(raw.kicker as string, b.kicker), finalHeadline),
    headline: finalHeadline,
    // Satzzeichen erzwingen — der QA-Agent wertet eine Zeile ohne Abschluss
    // zu Recht als unvollständigen Satz.
    scriptAccent: b.scriptAccent
      ? ensurePunct(clamp(raw.scriptAccent as string, b.scriptAccent + 4)) || undefined
      : undefined,
    sub: b.sub ? ensurePunct(clamp(raw.sub as string, b.sub + 8)) || undefined : undefined,
    copy: b.copy ? ensurePunct(clamp(raw.copy as string, b.copy + 12)) || undefined : undefined,

    // --- Ab hier: NICHT von der KI, sondern fest aus dem Format. Das ist der
    //     Marken-Rahmen, der die Vorbild-Posts wiedererkennbar macht.
    ...(layout === "panel-links" ? { features: f.benefits } : {}),
    ...(layout === "panel-cta"
      ? { cta: f.cta, footerNotes: f.footerNotes, tagline: BRAND_TAGLINE, accentIcon: f.accentIcon }
      : {}),
    url: zeigtUrl ? BRAND_URL : undefined,
  };

  return {
    formatCode: f.code,
    lane: f.lane,
    poster,
    posterCode: layout,
    photoIdea: String(raw.photoIdea ?? f.photoDirection),
    theme: clamp(raw.theme as string, 50) || f.name,
    product: clamp(raw.product as string, 60) || (f.lane === "product" ? f.name : "Vereinsleben"),
    message: clamp(raw.message as string, 100) || poster.headline?.join(" ") || f.name,
  };
}

// ---------------------------------------------------------------------------
// Orchestrierung: Konzept → Foto → Composite → JPEG
// ---------------------------------------------------------------------------

export type DesignedPostResult = {
  concept: DesignedConcept;
  /** Fertiges Marken-Composite als JPEG (1024×1280, 4:5) */
  jpeg: Buffer;
  photoPrompt: string;
};

export async function createDesignedPostImage(opts: {
  apiKey?: string;
  concept: DesignedConcept;
  brandStyle?: string | null;
}): Promise<DesignedPostResult> {
  const photoPrompt = buildDesignedPhotoPrompt(
    opts.concept.posterCode,
    opts.concept.lane,
    opts.concept.photoIdea,
    opts.brandStyle,
  );

  // Jeder Post bekommt ein echtes Foto — es gibt keinen Pfad ohne Bild mehr.
  const image = await generateImage({ apiKey: opts.apiKey, prompt: photoPrompt, size: "1024x1536" });
  if (!image.b64) throw new Error("Kein Foto von gpt-image-1 erhalten.");
  const photoDataUrl = `data:image/jpeg;base64,${image.b64}`;

  const png = await renderPoster(opts.concept.poster, photoDataUrl);
  // JPEG für alle Plattformen (TikTok akzeptiert kein PNG)
  const jpeg = await sharp(png).jpeg({ quality: 90 }).toBuffer();

  return { concept: opts.concept, jpeg, photoPrompt };
}
