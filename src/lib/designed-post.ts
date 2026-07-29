import sharp from "sharp";
import { getOpenAIClient, generateImage, generateCaption } from "./openai";
import { recordAiUsage } from "./ai-cost";
import { BANNED_PHRASES, type ConceptFormat, type Lane } from "./concepts";
import { type PostTemplateKey } from "./render-post";
import { renderPoster, type PosterContent } from "./render-poster";

/**
 * Designte Posts (Zwei-Säulen-System): Konzept-KI → Foto (ohne Text) →
 * programmatisches Marken-Layout (Poster-Engine v2, render-poster.tsx) → JPEG.
 *
 * Der Unterschied zum alten Weg: Erst entsteht die IDEE (Konzept mit Headline
 * nach Format-Formel), daraus werden Foto-Prompt UND Plakat-Text abgeleitet —
 * Bild und Text erzählen garantiert dieselbe Geschichte, und der Text ist
 * pixel-perfekt gerendert statt KI-gemalt.
 *
 * Seit Juli 2026 rendert die Poster-Engine v2: echte Plakat-Optik statt
 * „Foto mit dezenter Textzeile" — drei Plakat-Varianten, reines Foto und
 * zwei Typo-Poster ohne Foto.
 */

/** Ein Layout der Poster-Engine: Art + Variante, als Code für die Rotation. */
export type PosterLayout = { kind: PosterContent["kind"]; variant: number; code: string };

const LAYOUTS: Record<Lane, PosterLayout[]> = {
  // Emotional: Plakat trägt am besten, Typo als Kontrast, reines Foto sparsam.
  emotional: [
    { kind: "plakat", variant: 0, code: "plakat-0" },
    { kind: "plakat", variant: 1, code: "plakat-1" },
    { kind: "plakat", variant: 2, code: "plakat-2" },
    { kind: "typo", variant: 0, code: "typo-0" },
    { kind: "foto", variant: 0, code: "foto-0" },
  ],
  // Produkt braucht immer Text (Nutzen + CTA) → kein reines Foto.
  product: [
    { kind: "plakat", variant: 2, code: "plakat-2" },
    { kind: "plakat", variant: 0, code: "plakat-0" },
    { kind: "typo", variant: 1, code: "typo-1" },
  ],
};

/**
 * Wählt ein Poster-Layout — bevorzugt eines, das zuletzt NICHT dran war,
 * damit der Feed abwechslungsreich bleibt.
 */
export function pickPosterLayout(
  lane: Lane,
  avoidCodes: string[] = [],
  random: () => number = Math.random,
): PosterLayout {
  const pool = LAYOUTS[lane];
  const fresh = pool.filter((l) => !avoidCodes.includes(l.code));
  const candidates = fresh.length ? fresh : pool;
  return candidates[Math.floor(random() * candidates.length)];
}

export type DesignedConcept = {
  formatCode: string;
  /** Steuert weiterhin die Foto-Regie (Bildsprache je Säule/Formattyp). */
  template: PostTemplateKey;
  /** Der fertige Plakat-Inhalt für die Poster-Engine v2. */
  poster: PosterContent;
  /** Layout-Code für die Rotation (z. B. "plakat-1"), landet in post_briefs. */
  posterCode: string;
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

/**
 * Zeichen-Budgets der Poster-Engine v2. Bewusst knapp: ein Plakat lebt von
 * wenigen, großen Worten — zu lange Zeilen kippen das Layout.
 */
const PB = {
  kicker: 26,
  headlineLine: 22,
  headlineLines: 3,
  scriptAccent: 22,
  sub: 52,
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
  const lines = [p.headline?.join(" "), p.scriptAccent, p.sub].filter(Boolean);
  return lines.length ? lines.join(" ") : concept.message;
}

/**
 * Ausgabe-Spezifikation für die Poster-Engine v2. Anders als früher hängt sie
 * nicht am Template, sondern am gewählten Plakat-Layout: Ein reines Foto
 * braucht gar keinen Text, ein Typo-Poster trägt ihn allein.
 */
function outputSpecFor(format: ConceptFormat, layout: PosterLayout): string {
  if (layout.kind === "foto") {
    // Reines Foto: die Wirkung kommt allein aus dem Bild + Caption.
    return `"headline": [],
"kicker": null,
"scriptAccent": null,
"sub": null`;
  }

  const isTypo = layout.kind === "typo";
  const urlLine =
    format.lane === "product" || isTypo
      ? `"url": "schuetzen-ausstatter.de"`
      : `"url": null`;

  return `"kicker": "Kleine Versalien-Zeile ÜBER der Headline, max ${PB.kicker} Zeichen — Einordnung wie „Seit 1897 im Verein" oder „Die Damenweste" (oder null)",
"headline": ["Die GROSSE Plakat-Headline als Array von 2-3 Zeilen, je max ${PB.headlineLine} Zeichen. Über alle Zeilen gelesen EIN vollständiger, korrekter Satz. Setze die Umbrüche bewusst so, dass jede Zeile für sich gut aussieht. PFLICHT: Die LETZTE Zeile schließt den Satz ab — sie darf NIEMALS mit einer Präposition (auf, in, für, mit, an, zu), einem Artikel (der/die/das/ein) oder einer Konjunktion (und, oder, aber) enden. FALSCH: [„Der erste Auftritt im", „neuen Outfit — und", „alle Blicke sind auf."] — hier fehlt das Satzende. RICHTIG: [„Der erste Auftritt", „im neuen Outfit.", „Alle Blicke da."]. Lies die Headline vor der Ausgabe einmal laut und prüfe, ob der Satz wirklich zu Ende ist."],
"scriptAccent": "Kurze Schreibschrift-Akzentzeile, max ${PB.scriptAccent} Zeichen — das Gefühl hinter der Headline (oder null)",
"sub": "Eine ruhige Begleitzeile, max ${PB.sub} Zeichen${format.lane === "product" ? " — konkreter Nutzen oder Größen-USP" : ""} (oder null)",
${urlLine}`;
}

/**
 * Baut ein synthetisches Konzept-Format aus den FREIEN Eingaben des manuellen
 * Generators (Thema/Produkt/Botschaft). So läuft auch der manuelle Weg über die
 * designte Pipeline inkl. aller Leitplanken — nur dass Inhalt/Idee vom Nutzer
 * vorgegeben statt aus einer Format-Formel gezogen wird.
 */
export function buildManualFormat(
  lane: "emotional" | "product",
  input: { theme: string; product: string; message: string },
): ConceptFormat {
  const subject = `Thema: „${input.theme}". Produkt/Kontext: „${input.product}". Kernbotschaft: „${input.message}".`;
  if (lane === "product") {
    return {
      code: "MANUAL-P",
      lane: "product",
      name: input.theme?.slice(0, 40) || "Manueller Produkt-Post",
      template: "product-feature",
      brief: `Setze GENAU diese Vorgaben des Nutzers als Produkt-Post um. ${subject} Die Headline dreht sich um genau dieses Produkt/diese Botschaft; erfinde nichts Fremdes hinzu.`,
      exampleHeadlines: [
        "Die Damenweste für alle, die Tradition modern leben.",
        "Vom Jungschützen bis zum Ehrenvorstand. Ein Preis für alle.",
      ],
      photoDirection: `Ein markttreues, authentisches Foto passend zu „${input.product}" und „${input.theme}" — dunkelgrüne Schützenkleidung, schlicht-elegant, Motiv rechts im Bild, linke Bildhälfte ruhig für Text.`,
      benefits: [
        { icon: "badge-check", title: "Bewährte Qualität", text: "Eigene Produktion, konstante Qualität" },
        { icon: "ruler", title: "Größen 23–70", text: "Für jedes Mitglied die passende Größe" },
        { icon: "handshake", title: "Faire Vereinspreise", text: "Attraktive Konditionen für Vereine" },
      ],
      cta: "Muster & Beratung anfragen",
      footerIcons: ["shield-check", "repeat", "users"],
    };
  }
  return {
    code: "MANUAL-E",
    lane: "emotional",
    name: input.theme?.slice(0, 40) || "Manueller Emotional-Post",
    template: "emotional-minimal",
    brief: `Setze GENAU diese Vorgaben des Nutzers als emotionalen Post um. ${subject} Formuliere daraus eine zweizeilige Headline (Zeile 1 Serife = konkretes Bild/Moment, Zeile 2 Schreibschrift = das Gefühl), die genau diese Botschaft trägt — kein fremdes Thema.`,
    exampleHeadlines: ["Gemeinsam heute. / Tradition für morgen.", "Eingehakt am Festplatz. / Das Gefühl von Zuhause."],
    photoDirection: `Ein authentisches, warmes Reportage-Foto passend zu „${input.theme}" — Menschen bevorzugt von hinten/Profil in dunkelgrünen Schützenwesten/-jacken, Festplatz-Stimmung, goldenes Licht, oberes Bilddrittel ruhig für Text.`,
  };
}

export async function generateDesignedConcept(opts: {
  apiKey?: string;
  format: ConceptFormat;
  reactiveHook?: string | null;
  topical?: string | null;
  avoid?: string[];
  month: number;
  /** Zuletzt genutzte Poster-Layouts — für Abwechslung im Feed. */
  avoidLayouts?: string[];
}): Promise<DesignedConcept> {
  const client = getOpenAIClient(opts.apiKey);
  const f = opts.format;
  // Plakat-Layout ZUERST wählen: es bestimmt, welche Texte überhaupt gebraucht
  // werden (reines Foto = gar keine, Typo-Poster = Text trägt allein).
  const layout = pickPosterLayout(f.lane, opts.avoidLayouts ?? []);

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
    max_tokens: 600,
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

  // Plakat-Inhalt aus KI-Output zusammensetzen (Budgets hart erzwingen).
  const headline = finishHeadline(
    (Array.isArray(raw.headline) ? raw.headline : raw.headline ? [String(raw.headline)] : [])
      .map((l) => clamp(String(l), PB.headlineLine + 3))
      .filter(Boolean)
      .slice(0, PB.headlineLines),
  );

  const poster: PosterContent = {
    kind: layout.kind,
    variant: layout.variant,
    ...(layout.kind === "foto"
      ? {}
      : {
          kicker: clamp(raw.kicker as string, PB.kicker) || undefined,
          headline: headline.length ? headline : undefined,
          scriptAccent: ensurePunct(clamp(raw.scriptAccent as string, PB.scriptAccent + 4)) || undefined,
          // Satzzeichen erzwingen — der QA-Agent wertet eine Zeile ohne
          // Abschluss zu Recht als unvollständigen Satz.
          sub: ensurePunct(clamp(raw.sub as string, PB.sub + 8)) || undefined,
          url: typeof raw.url === "string" && raw.url.trim() ? "schuetzen-ausstatter.de" : undefined,
        }),
  };

  // Typo-Poster trägt den Text allein — ohne Headline wäre es leer.
  if (layout.kind === "typo" && !poster.headline?.length) {
    poster.headline = [f.name];
  }

  return {
    formatCode: f.code,
    template: f.template,
    poster,
    posterCode: layout.code,
    photoIdea: String(raw.photoIdea ?? f.photoDirection),
    theme: clamp(raw.theme as string, 50) || f.name,
    product: clamp(raw.product as string, 60) || (f.lane === "product" ? f.name : "Vereinsleben"),
    message:
      clamp(raw.message as string, 100) ||
      poster.headline?.join(" ") ||
      poster.sub ||
      f.name,
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

  // Typo-Poster kommen ohne Foto aus — dann sparen wir uns den teuersten und
  // langsamsten Schritt der ganzen Pipeline komplett.
  let photoDataUrl: string | undefined;
  if (opts.concept.poster.kind !== "typo") {
    const image = await generateImage({ apiKey: opts.apiKey, prompt: photoPrompt, size: "1024x1536" });
    if (!image.b64) throw new Error("Kein Foto von gpt-image-1 erhalten.");
    photoDataUrl = `data:image/jpeg;base64,${image.b64}`;
  }

  const png = await renderPoster(opts.concept.poster, photoDataUrl);
  // JPEG für alle Plattformen (TikTok akzeptiert kein PNG)
  const jpeg = await sharp(png).jpeg({ quality: 90 }).toBuffer();

  return { concept: opts.concept, jpeg, photoPrompt };
}
