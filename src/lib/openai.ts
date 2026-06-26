import OpenAI from "openai";
import { CONTENT_PILLARS, type PillarKey } from "@/types";

/**
 * Server-seitige Säulen-Steuerung: pro Säule passende Post-Stile, Themen,
 * inhaltliche Leitplanke (briefHint) und CTA-Stärke. Die Labels/Gewichte
 * liegen in @/types (auch vom Client genutzt).
 */
const PILLAR_GUIDANCE: Record<
  PillarKey,
  {
    styles: ("photo" | "hook" | "typography")[];
    themes: string[];
    cta: "soft" | "hard";
    briefHint: string;
  }
> = {
  community: {
    styles: ["photo", "photo", "hook"],
    themes: [
      "Schützenfest",
      "Vereinsleben",
      "Generationen im Verein",
      "Festzelt-Stimmung",
      "Zusammenhalt",
    ],
    cta: "soft",
    briefHint:
      "Emotionaler, echter Moment aus dem Vereinsleben — Zusammenhalt, Feiern, Stolz. KEIN Verkauf, reine Stimmung.",
  },
  craft: {
    styles: ["photo", "hook"],
    themes: [
      "Qualität & Handwerk",
      "Detail der Uniform",
      "Langlebigkeit",
      "Stoff & Verarbeitung",
    ],
    cta: "soft",
    briefHint:
      "Mach Qualität & Handwerk der Hersfelder Kleidung sichtbar — Detail, saubere Verarbeitung, Langlebigkeit. Vertrauen aufbauen, nicht marktschreierisch.",
  },
  proof: {
    styles: ["photo", "hook"],
    themes: [
      "Verein neu eingekleidet",
      "Erfolgsgeschichte aus dem Verein",
      "Stolz nach der Ausstattung",
    ],
    cta: "soft",
    briefHint:
      "Erzähle eine glaubwürdige Verein-Story: ein Schützenverein wurde von Hersfelder komplett ausgestattet und ist stolz/zufrieden. Social Proof — echt und bodenständig, keine erfundenen Namen großspurig behaupten.",
  },
  service: {
    styles: ["typography", "hook", "photo"],
    themes: [
      "Vereins-Ausstattung anfragen",
      "Persönliche Beratung",
      "Saison-Aktion",
      "Muster kostenlos bestellen",
    ],
    cta: "hard",
    briefHint:
      "Lade Vereine herzlich ein, sich für eine Ausstattung zu melden — warm und konkret (z.B. kostenloser Vereins-Check, persönliche Beratung, Muster anfordern). Einladend, nicht aufdringlich.",
  },
};

/** Gewichtete Zufallsauswahl einer Säule (community häufiger als der Rest). */
export function pickPillar(): PillarKey {
  const total = CONTENT_PILLARS.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of CONTENT_PILLARS) {
    r -= p.weight;
    if (r <= 0) return p.key;
  }
  return "community";
}

/** Wie pickPillar, aber mit (gelernten) Gewichten. Fehlende/0-Gewichte → Basis. */
export function pickPillarWeighted(weights: Partial<Record<PillarKey, number>>): PillarKey {
  const entries = CONTENT_PILLARS.map((p) => ({
    key: p.key,
    w: Math.max(1, weights[p.key] ?? p.weight),
  }));
  const total = entries.reduce((s, e) => s + e.w, 0);
  let r = Math.random() * total;
  for (const e of entries) {
    r -= e.w;
    if (r <= 0) return e.key;
  }
  return "community";
}

/** Passenden Post-Stil und Themen-Vorschlag für eine Säule ziehen. */
export function pillarPick(pillar: PillarKey) {
  const g = PILLAR_GUIDANCE[pillar];
  return {
    styleType: g.styles[Math.floor(Math.random() * g.styles.length)],
    themeCategory: g.themes[Math.floor(Math.random() * g.themes.length)],
    cta: g.cta,
    briefHint: g.briefHint,
  };
}

export function getOpenAIClient(apiKey?: string) {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY ist nicht gesetzt.");
  return new OpenAI({ apiKey: key });
}

const BRAND_DESCRIPTION = `Marke: Hersfelder Schützenbekleidung (schuetzen-ausstatter.de)
Brand-Slogan: "Uniform an - Stimmung hoch!" und "Deine Marke für Deinen Verein!"
Farben: Jagdgrün (Hauptfarbe der Uniformen), Weiß (Hintergrund), Dunkelrot (Logo-Emblem)
Kleidung: Dunkelgrüne Schützen-Jacken, Westen, elegante Uniformen — getragen von echten Vereinsmenschen

Das ECHTE Hersfelder-Logo (nur verwenden, wenn explizit auf die Marke hingewiesen wird):
- Form: Traditionelles Wappenschild (U-förmig, runder Boden) — kein modernes Badge-Design
- Oben am Schild: Rotes heraldisches Schmuckelement (stilisierter Querbalken mit roten Blöcken links und rechts — wie ein historisches Schützenabzeichen)
- Im Schild: Ein botanisch-heraldischer Setzling/Junger Baum mit symmetrisch angeordneten ovalen Blättern, wächst aus waagerechten grünen Wellenlinien (stilisiertes Wasser, stellt vermutlich die Fulda dar)
- Unter dem Schild: "Hersfelder" in historischer Frakturschrift / Blackletter
- Farben: Dunkelrot (oberes Schmuckelement), Dunkelgrün (Pflanze + Wasserlinien), Weiß (Schildfeld), Schwarz (Konturen)
- KEIN Löwe, KEIN Adler, KEIN Reichsadler — das Motiv ist eine botanische Pflanze auf Wasserlinien

In Social-Media-Fotos: Das Logo NICHT in die generierten Bilder einbauen — zeige stattdessen echte Menschen in dunkelgrünen Hersfelder Uniformen. Die Marke erkennst du an Uniformfarbe und Vereinsstimmung, nicht am Logo.
Content-Strategie: KEIN Produktmarketing. Zeige echtes Vereinsleben — die Kleidung ist Teil der Szene, nicht das Thema.
Themen: Zusammenhalt beim Schützenfest, gemeinsames Feiern, Generationen im Verein, Stolz auf Tradition, Lachen und Freude
Stil: Authentisch wie Reportagefotografie — keine gestellten Werbeshootings
Zielgruppe: Schützenverein-Mitglieder in Deutschland, alle Altersgruppen`;

const SAFETY_RULES = `ABSOLUT VERBOTEN — niemals zeigen:
- Schusswaffen, Gewehre, Pistolen oder andere Waffen
- Politische Symbole, Reichsadler oder rechtsextreme Symbole
- Slogans die wie nationalistische oder rechtsextreme Parolen wirken — z.B. "In Einheit stark", "Für Heimat und Volk", militärische Kampfparolen
- Diskriminierende Darstellungen jeglicher Art
NUR ERLAUBT: Freude, Gemeinschaft, Feiern, Uniformen/Trachten, Sport, Vereinsleben, Natur`;

// Scene pool for variety — picked randomly per call
const PHOTO_SCENES = [
  "Menschen stoßen ausgelassen mit Bierkrügen an, Lachen und Jubeln, goldenes Abendlicht im Festzelt, Lichterketten glänzen",
  "Spontaner Umzug auf dem Marktplatz — Schützen in dunkelgrünen Uniformen marschieren, Kinder winken vom Straßenrand, Konfetti in der Luft",
  "Großes Festzelt: vier Generationen sitzen zusammen, der Älteste erzählt, alle hören gespannt zu, warmes Kerzenlicht",
  "Spontaner Kreistanz auf dem Festplatz — Uniformierte fassen sich an den Händen und wirbeln herum, pure Freude",
  "Großvater und Enkel, beide in Uniform, stehen Schulter an Schulter — stolze Blicke in die Kamera, Heimgefühl pur",
  "Siegerehrung: Junge Schützin bekommt ihre erste Medaille, die ganze Gruppe applaudiert mit Tränen vor Stolz",
  "Festzelt-Aufbau am Morgen — alle packen mit an, Scherze fliegen, Kaffeebecher in der Hand",
  "Abends nach dem großen Umzug: erschöpfte und glückliche Gruppe, Uniformjacken offen, arme umeinander",
  "Kerzenlicht und Sternenhimmel: Vereinsmitglieder sitzen draußen, Wein und Lachen, tiefe Gespräche",
  "Drei Freundinnen in Uniform lachen laut beim Selfie, Feuerwerk im Hintergrund, echter Lebensmoment",
  "Bieranstich im Festzelt — Bürgermeister schlägt das Fass an, alle jubeln, Schaum fliegt",
  "Kleines Mädchen im Schützenkostüm tanzt mit Opa auf der Wiese, Publikum schaut begeistert zu",
  "Marschkapelle in voller Fahrt — Posaunen glänzen in der Sonne, Gesichter voller Konzentration und Stolz",
  "Abschlussabend: alle Schützen stehen im Kreis, Arme umeinander, singen gemeinsam — echte Bruderschaft",
];

export function buildImagePrompt(input: {
  brandStyle?: string | null;
  theme: string;
  product: string;
  message: string;
  styleType?: "photo" | "typography" | "product" | "hook";
  visualDetails?: string;
}): string {
  const style = input.styleType ?? "photo";
  const brand = input.brandStyle?.trim() || BRAND_DESCRIPTION;

  const baseContext = `${brand}

${SAFETY_RULES}

Thema: ${input.theme}
Kernbotschaft: "${input.message}"`;

  if (style === "typography") {
    return `${baseContext}

Erstelle eine fröhliche, einladende Vereins-Grafik — wie eine Einladung zum Schützenfest, warmherzig und festlich.
Design:
- Hintergrund: Tiefes Dunkelgrün (#1a5c2a) — satt, kein Gradient
- Haupttext: 3-5 Wörter aus der Kernbotschaft — WEISSE Großbuchstaben, extra-bold, serifenlos, zentriert
- WICHTIG ZUM TEXTINHALT: Der Text muss klingen wie eine FEIER-EINLADUNG — warmherzig, fröhlich, einladend.
  NICHT wie eine politische Parole oder ein nationalistischer Slogan.
  GUTE Beispiele: "HEUT WIRD GEFEIERT", "WIR FEIERN ZUSAMMEN", "HERZLICH WILLKOMMEN", "SCHÜTZENFEST SAISON 2026"
  SCHLECHTE Beispiele: "IN EINHEIT STARK", "TRADITION VERBINDET UNS", "FÜR HEIMAT UND VEREIN"
- Optional: ein kurzes Akzent-Wort in Rot (#c0392b), kleiner, darunter
- KEIN Markenname, KEIN Logo, KEIN Wappen, KEIN Adler, KEIN Schild im Bild — reines Text-Design
- Kein Foto, keine Menschen — reines festliches Grafik-Design
Format: quadratisch.`;
  }

  if (style === "hook") {
    const scene = PHOTO_SCENES[Math.floor(Math.random() * PHOTO_SCENES.length)];
    return `${baseContext}
Szene: ${input.visualDetails || scene}

Erstelle ein Instagram-Hook-Post: authentisches Schützenfest-Foto mit GROSSEM emotionalen Text im Bild.

Foto-Hintergrund:
- Echte, lebendige Menschen in dunkelgrünen Schützen-Uniformen beim Feiern
- Szene: ${scene}
- Stil: Dokumentarfotografie / Reportage — warm, lebendig, spontan, kein Studio
- Stimmung: Ausgelassene Freude, Bruderschaft, echter Lebensmoment beim Schützenfest

Text-Overlay (direkt im Bild, Teil des Designs — das ist das Wichtigste!):
- MAXIMAL 4-7 WÖRTER — kurz, knackig, emotional
- Inspiration aus der Kernbotschaft: "${input.message}"
- Ton: warmherzig, feierlich, gemeinschaftlich — KEIN nationalistischer Klang
- GUTE Text-Beispiele im richtigen Stil:
  · "BRUDERSCHAFT IST DAS, WAS UNS VEREINT"
  · "HEUT WIRD GEFEIERT — WIE JEDEN JAHR"
  · "ZUSAMMEN SEIT GENERATIONEN"
  · "UNSER FEST, UNSERE FAMILIE"
  · "DAS BESTE GEFÜHL DER WELT"
  · "SCHÜTZENFEST — WIR LIEBEN ES"
  · "FREUNDE FÜR'S LEBEN"
- Schrift: WEISS oder WARMGELB, extra-bold, serifenlos, kraftvoll
- SEHR GROSS — Text nimmt 35-50% der Bildfläche ein
- Halbtransparenter dunkler Balken/Schatten hinter dem Text für maximale Lesbarkeit
- Text oben ODER unten — Gesichter der Menschen bleiben immer sichtbar

ABSOLUT VERBOTEN im Bild:
- Kein Markenname "Hersfelder", kein Logo, kein Wappen, kein Adler, kein Schild
- Keine Waffen, keine politischen Symbole

Format: Hochformat (Portrait).`;
  }

  if (style === "product") {
    const scene = PHOTO_SCENES[Math.floor(Math.random() * PHOTO_SCENES.length)];
    return `${baseContext}
Szene: ${input.product}
${input.visualDetails ? `Details: ${input.visualDetails}` : `Szene: ${scene}`}

Erstelle ein authentisches Vereins-Lifestyle-Foto — KEIN Produktkatalog-Stil.
2-3 Vereinsmitglieder in dunkelgrünen Hersfelder Schützen-Uniformen bei einem echten Vereinsmoment.
Die Kleidung ist sichtbar und hochwertig, aber die Menschen und der Moment stehen im Vordergrund.
Stimmung: Warm, echt, dokumentarisch — wie ein guter Freund der fotografiert.
Licht: Natürliches Tageslicht oder goldene Stunde, kein Studio.
Keine Waffen, keine politischen Symbole.`;
  }

  // Default: lifestyle photo (Vereinsleben)
  const scene = PHOTO_SCENES[Math.floor(Math.random() * PHOTO_SCENES.length)];
  return `${baseContext}
Szene: ${input.visualDetails || scene}

Erstelle ein hochwertiges Reportage-Foto vom Vereinsleben — wie ein Fotojournalist beim Schützenfest.
Menschen: 3-6 Personen in dunkelgrünen Schützen-Uniformen, verschiedene Altersgruppen, echter Moment.
Moment: ${scene}
Stil: Warmherzig, lebendig, spontan — wie Dokumentarfotografie, KEIN gestelltes Werbe-Shooting.
Licht: Goldenes Abendlicht, Festzelt-Atmosphäre oder Tageslicht im Freien.
Stimmung: Freude, Zusammenhalt, Gemeinschaft — echte Emotionen.
Kein Markenname, kein Logo, kein Wappen im Bild. Keine Waffen. Kein Alkohol prominent im Vordergrund.`;
}

export function buildCaptionPrompt(input: {
  theme: string;
  product: string;
  message: string;
  platforms?: string[];
  pillar?: PillarKey;
}): string {
  const platforms = input.platforms ?? ["instagram"];

  // CTA-Stärke je nach Säule: weich (Engagement) vs. klar (Lead).
  const cta = input.pillar ? PILLAR_GUIDANCE[input.pillar].cta : "soft";
  const ctaInstruction =
    cta === "hard"
      ? `CALL-TO-ACTION (wichtig für diese Säule):
- Baue am Ende eine klare, warmherzige Handlungsaufforderung ein, die Vereine zur Kontaktaufnahme einlädt.
- Beispiele (variieren, nicht wörtlich kopieren): "Plant ihr eine Neuausstattung? Schreibt uns eine Nachricht 💚", "Kostenlose Beratung für euren Verein — meldet euch gern", "Muster gratis anfordern – Link in Bio".
- Ton: einladend und partnerschaftlich, NICHT marktschreierisch oder aufdringlich.`
      : `CALL-TO-ACTION (dezent):
- Schließe mit einer leichten Einladung zur Interaktion (offene Frage an die Community), KEIN Verkauf.
- Beispiele: "Wie feiert ihr in eurem Verein?", "Welcher Verein seid ihr? 👇".`;

  const hasInstagram = platforms.includes("instagram");
  const hasFacebook = platforms.includes("facebook");
  const hasTikTok = platforms.includes("tiktok");
  const hasLinkedIn = platforms.includes("linkedin");

  // Service-Säule darf zur Ausstattung einladen; alle anderen bleiben werbefrei.
  const strategyRules =
    cta === "hard"
      ? `- Du DARFST hier dezent zur Vereins-Ausstattung/Beratung einladen — als hilfsbereiter Partner, nicht als Verkäufer
- Kein aggressives Produktmarketing, keine Preis-/Rabatt-Schreierei
- Schreibe warmherzig und partnerschaftlich, auf Augenhöhe mit dem Vereinsvorstand`
      : `- KEIN Produktmarketing oder Werbung für Kleidung
- Zeige echtes Vereinsleben: Zusammenhalt, Freude, Tradition, Gemeinschaft beim Schützenfest
- Die Hersfelder Kleidung ist im Hintergrund sichtbar — sie gehört dazu, wird aber nicht beworben`;

  const systemContext = `Thema: ${input.theme}
Kontext: ${input.product}
Kernbotschaft: "${input.message}"

WICHTIG — Content-Strategie:
${strategyRules}
- Schreibe wie ein echter Vereinsmensch: warmherzig, authentisch, stolz auf die Gemeinschaft
- Sprache: Deutsch. Kein Rassismus, keine Waffen, keine politischen Aussagen.`;

  const blocks: string[] = [];

  if (hasInstagram) {
    blocks.push(`---INSTAGRAM---
Instagram-Caption (max. 125 Zeichen sichtbar, dann wird abgeschnitten):
- Erster Satz: emotional, direkt, stoppt den Scroll — max. 100 Zeichen
- 1-2 passende Emojis eingebaut (nicht am Ende geklatscht)
- Zweite Zeile: genau 3-5 Hashtags, immer #hersfelder dabei
- Kein Hashtag-Spam, nur wirklich passende Tags
Beispielformat: "Wenn der Verein zur Familie wird. 🟢\n\n#hersfelder #schützenfest #vereinsleben"`);
  }

  if (hasFacebook) {
    blocks.push(`---FACEBOOK---
Facebook-Post (40-80 Zeichen für maximale Reichweite, alternativ kurze Geschichte bis 150 Wörter):
- Beginne mit einer Frage oder einer persönlichen Aussage
- Schreibe für die Vereins-Community — familiär, einladend
- Optional: Ein kurzer Aufruf zu Kommentaren ("Wer kennt das?", "Wie war das bei euch?")
- Keine Hashtags oder max. 2`);
  }

  if (hasTikTok) {
    blocks.push(`---TIKTOK---
TikTok-Caption (kurz und knackig, max. 100 Zeichen):
- Hook in den ersten 3 Wörtern — muss sofort neugierig machen
- Umgangssprache, jung, lebendig
- 4-6 Hashtags: mix aus reichweiten-stark (#schützenfest, #vereinsleben) und nischen (#schützenverein, #hersfelder)
- Kein komplizierter Satz, kein Fließtext`);
  }

  if (hasLinkedIn) {
    blocks.push(`---LINKEDIN---
LinkedIn-Post (150-250 Wörter, professionell-persönlich):
- Erster Satz: starke Aussage oder Frage über Vereinskultur, Gemeinschaft, Tradition oder Ehrenamt — kein Produkt
- Absätze: kurz, je 2-3 Sätze, Leerzeile dazwischen (mobile-optimiert)
- Erzähle eine kleine Geschichte oder teile einen echten Gedanken zum Vereinsleben
- Verbindung zu Hersfelder als Unterstützer von Vereinskultur (nicht als Verkäufer)
- Schließe mit einer offenen Frage an die Community
- Letzte Zeile: 3 Hashtags (mix Deutsch/Englisch), z.B. #Vereinsleben #Schützenfest #CommunityFirst`);
  }

  return `Du bist Social-Media-Texter für Hersfelder Schützenbekleidung (schuetzen-ausstatter.de).
${systemContext}

Erstelle für jede der folgenden Plattformen eine maßgeschneiderte Version:

${blocks.join("\n\n")}

${ctaInstruction}

Antworte NUR mit den Texten in der angegebenen Reihenfolge mit den Trennern (---INSTAGRAM---, ---FACEBOOK--- etc.). Keine Anführungszeichen, keine Erklärungen.`;
}

export async function generateBrief(opts: {
  apiKey?: string;
  themeCategory: string;
  styleType: "photo" | "typography" | "product" | "hook";
  weekNumber: number;
  year: number;
  pillar?: PillarKey;
  avoid?: string[]; // kürzlich genutzte Themen/Botschaften — nicht wiederholen
}): Promise<{
  theme: string;
  product: string;
  message: string;
  visualDetails: string;
}> {
  const client = getOpenAIClient(opts.apiKey);

  const PRODUCTS = [
    "Herrenschützenrock Classic dunkelgrün",
    "Damenweste Hersfelder Kollektion",
    "Schützenuniform Komplett-Set",
    "Vereinsjacke Premium dunkelgrün",
    "Festtagsbekleidung Saison 2026",
    "Jungschützen-Starterset",
    "Trachtenweste mit Hersfelder Wappen",
    "Schützenhemd weiß mit grünem Kragen",
  ];
  const randomProduct = PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];

  const styleDescription =
    opts.styleType === "typography"
      ? "Grafik-Text-Post (nur Text und Design, kein Foto) — kraftvoller Spruch auf dunkelgrünem Hintergrund"
      : opts.styleType === "hook"
        ? "Hook-Post (Vereinsfoto mit GROSSEM Text-Overlay im Bild) — Scroll-Stopper, emotional, plakativ"
        : opts.styleType === "product"
          ? "Produktfoto-Post (Uniform/Kleidung sichtbar, aber Menschen und Moment im Fokus)"
          : "Lifestyle-Foto-Post (echte Menschen beim Feiern, Marschieren, Lachen im Verein)";

  const pillarLine = opts.pillar
    ? `\nContent-Säule: ${CONTENT_PILLARS.find((p) => p.key === opts.pillar)?.label}\nLeitlinie dieser Säule: ${PILLAR_GUIDANCE[opts.pillar].briefHint}`
    : "";

  const avoidLine =
    opts.avoid && opts.avoid.length
      ? `\nWICHTIG — VERMEIDE Wiederholung. Diese Themen/Botschaften wurden kürzlich genutzt, mach etwas DEUTLICH anderes:\n- ${opts.avoid.slice(0, 8).join("\n- ")}`
      : "";

  const prompt = `Du bist kreativer Social-Media-Stratege für Hersfelder Schützenbekleidung (schuetzen-ausstatter.de).
Erstelle ein originelles, abwechslungsreiches Briefing für KW ${opts.weekNumber}/${opts.year}.

Post-Typ: ${styleDescription}
Themen-Kategorie: ${opts.themeCategory}
Mögliches Produkt: ${randomProduct}${pillarLine}${avoidLine}

Regeln:
- Kein Rassismus, keine Waffen, keine rechtsextremen Inhalte
- Fokus auf: Freude, Gemeinschaft, Stolz auf den Verein, Tradition, Zusammenhalt
- KRITISCH: Die "message" darf NIEMALS wie eine nationalistische oder rechtsextreme Parole klingen.
  Verboten: "In Einheit stark", "Für Heimat und Volk", militärische Slogans, völkische Sprache.
  Erlaubt: Feier-Einladungen, warmherzige Gemeinschaftsaussagen, Schützenfest-Begeisterung.
- Sei kreativ und abwechslungsreich — nicht immer dasselbe
- Deutsche Botschaften, kurz und festlich

Antworte NUR als JSON-Objekt:
{
  "theme": "konkretes Thema (max 50 Zeichen, deutsch)",
  "product": "Produkt oder Vereinselement (max 50 Zeichen)",
  "message": "kurze kraftvolle Botschaft/Zitat auf Deutsch (max 70 Zeichen)",
  "visualDetails": "brief English description of the scene/mood (max 80 chars)"
}`;

  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Antworte ausschließlich mit validem JSON-Objekt ohne Markdown." },
      { role: "user", content: prompt },
    ],
    temperature: 0.92,
    max_tokens: 250,
    response_format: { type: "json_object" },
  });

  const raw = res.choices?.[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(raw);
    return {
      theme: parsed.theme ?? opts.themeCategory,
      product: parsed.product ?? randomProduct,
      message: parsed.message ?? "Zusammen feiern — das verbindet uns",
      visualDetails: parsed.visualDetails ?? "",
    };
  } catch {
    return {
      theme: opts.themeCategory,
      product: randomProduct,
      message: "Zusammen feiern — das verbindet uns",
      visualDetails: "",
    };
  }
}

export async function generateImage(opts: {
  apiKey?: string;
  prompt: string;
  size?: "1024x1024" | "1024x1536" | "1536x1024";
}) {
  const client = getOpenAIClient(opts.apiKey);
  const res = await client.images.generate({
    model: "gpt-image-1",
    prompt: opts.prompt,
    size: opts.size ?? "1024x1024",
    n: 1,
    // JPEG statt PNG: TikTok akzeptiert nur WebP/JPEG (kein PNG) — sonst
    // schlägt der Bild-Download bei TikTok fehl. JPEG nehmen alle Plattformen.
    output_format: "jpeg",
    output_compression: 90,
  });
  const item = res.data?.[0];
  if (!item) throw new Error("Kein Bild von OpenAI erhalten.");
  return {
    b64: item.b64_json ?? null,
    url: item.url ?? null,
  };
}

export async function generateCaption(opts: {
  apiKey?: string;
  prompt: string;
}) {
  const client = getOpenAIClient(opts.apiKey);
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Du bist Social-Media-Texter für Hersfelder Schützenbekleidung. Kein Rassismus, keine Waffen, keine politischen Inhalte. Authentisch, gemeinschaftlich, warmherzig.",
      },
      { role: "user", content: opts.prompt },
    ],
    temperature: 0.85,
    max_tokens: 600,
  });
  return res.choices?.[0]?.message?.content?.trim() ?? "";
}

export type PostReview = {
  score: number; // 0–10 Gesamtnote
  captionOk: boolean;
  imageOk: boolean;
  issues: string[]; // verständliche Mängel (deutsch)
};

/**
 * Qualitäts-TÜV: eine zweite KI prüft Bild (Vision) UND Text gegen eine
 * Marken-/Sicherheits-Checkliste und gibt eine Note + Mängelliste zurück.
 * Schlägt der Aufruf fehl, gilt der Post als "ok" (kein Blockieren), aber
 * ohne Note.
 */
export async function reviewPost(opts: {
  apiKey?: string;
  caption: string;
  imageUrl: string | null;
  styleType: string;
  pillarLabel?: string;
}): Promise<PostReview> {
  const client = getOpenAIClient(opts.apiKey);

  const checklist = `Du bist strenger Qualitätsprüfer für Social-Media-Posts von "Hersfelder Schützenbekleidung" (Schützenuniformen, dunkelgrün, Vereinsleben, Tradition).

Prüfe BILD und TEXT gegen diese Checkliste:

BILD:
- Ist im Bild enthaltener Text LESBAR und korrekt geschrieben (kein KI-Kauderwelsch, keine verzerrten Buchstaben)?
- KEINE Waffen, Gewehre, politischen/rechtsextremen Symbole, kein Reichsadler?
- Wirkt es markenkonform (echte Menschen in dunkelgrünen Uniformen / authentisches Vereinsleben, kein steriles Werbe-Shooting)?
- Gute Bildqualität, klares Motiv, keine entstellten Gesichter/Hände?

TEXT (Caption):
- Markenstimmung: warmherzig, authentisch, gemeinschaftlich?
- KLINGT NICHT wie nationalistische/rechtsextreme Parole (verboten: "In Einheit stark", "Für Heimat und Volk", militärische Slogans)?
- Sinnvolle Länge, passende Hashtags, kein Kauderwelsch?
- Stil "${opts.styleType}"${opts.pillarLabel ? `, Content-Säule "${opts.pillarLabel}"` : ""} passend umgesetzt?

Antworte NUR als JSON:
{
  "captionOk": true/false,
  "imageOk": true/false,
  "score": 0-10 (Gesamtqualität),
  "issues": ["kurzer, konkreter Mangel auf Deutsch", ...]  // leer wenn alles gut
}`;

  try {
    const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: "text", text: `CAPTION:\n${opts.caption || "(leer)"}` },
    ];
    if (opts.imageUrl) {
      userContent.push({ type: "image_url", image_url: { url: opts.imageUrl } });
    }

    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: checklist },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 400,
      response_format: { type: "json_object" },
    });

    const raw = res.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<PostReview>;
    return {
      score: typeof parsed.score === "number" ? Math.round(parsed.score) : 7,
      captionOk: parsed.captionOk !== false,
      imageOk: parsed.imageOk !== false,
      issues: Array.isArray(parsed.issues) ? parsed.issues.slice(0, 6) : [],
    };
  } catch {
    // Review-Fehler darf die Generierung nicht blockieren.
    return { score: 7, captionOk: true, imageOk: true, issues: [] };
  }
}
