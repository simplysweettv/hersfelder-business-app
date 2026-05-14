import OpenAI from "openai";

export function getOpenAIClient(apiKey?: string) {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY ist nicht gesetzt.");
  return new OpenAI({ apiKey: key });
}

const BRAND_DESCRIPTION = `Marke: Hersfelder Schützenbekleidung (schuetzen-ausstatter.de)
Farben: Dunkelgrün #1a5c2a (Hauptfarbe), Weiß, Rot (Akzent), Holz/Naturelemente
Logo: Hersfelder Wappen mit Rot und Grün
Produkte: Schützenröcke, Westen, Uniformen, Festtagsbekleidung — alle in Dunkelgrün mit Hersfelder Wappen
Werte: Gemeinschaft, Tradition, Zusammenhalt, Vereinsleben, Schützenfest, Freude, Heimat
Zielgruppe: Schützenverein-Mitglieder in Deutschland, alle Altersgruppen`;

const SAFETY_RULES = `ABSOLUT VERBOTEN — niemals zeigen:
- Schusswaffen, Gewehre, Pistolen oder andere Waffen
- Politische Symbole, Reichsadler oder rechtsextreme Symbole
- Diskriminierende Darstellungen jeglicher Art
NUR ERLAUBT: Freude, Gemeinschaft, Feiern, Uniformen/Trachten, Sport, Vereinsleben, Natur`;

export function buildImagePrompt(input: {
  brandStyle?: string | null;
  theme: string;
  product: string;
  message: string;
  styleType?: "photo" | "typography" | "product";
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

Erstelle eine grafische Text-Kachel im Stil moderner Instagram-Typografie-Posts der Marke Hersfelder.
Design-Vorgaben:
- Hintergrund: Sattes Dunkelgrün (#1a5c2a) oder ein eleganter dunkelgrün-schwarzer Gradient
- Haupttext: 3-6 Wörter aus der Kernbotschaft in WEISSEN oder ROTEN Großbuchstaben, sehr groß, bold, zentriert
- Schrift: Modernes serifenloses Font, extra-bold, wie Plakat-Typografie
- Unterelement: kleines Hersfelder Wappen oder "HERSFELDER" Schriftzug dezent am unteren Rand
- URL: "schuetzen-ausstatter.de" sehr klein, kaum sichtbar am unteren Rand
- Kein Foto-Hintergrund — reines Grafik-Design
- Wirkt professionell wie ein Poster, minimalistisch, kraftvoll
Format: 1024x1024 quadratisch.`;
  }

  if (style === "product") {
    return `${baseContext}
Produkt im Fokus: ${input.product}

Erstelle ein professionelles Produktfoto im Premium-Fashion-Stil.
Design-Vorgaben:
- Hintergrund: Dunkles Dunkelgrün oder elegantes Grau-Schwarz, Studio-Lichtstimmung
- Im Vordergrund: ${input.product} — sauber drapiert oder auf Holz/Stein abgelegt, perfekt ausgeleuchtet
- Beleuchung: Weiches Studiolicht von oben-links, leichte Reflexion
- Kleines Hersfelder Wappen oder Logo sichtbar am Produkt oder als Wasserzeichen
- Qualität: Wirkt wie ein Katalog-Produktbild einer Premium-Trachtenmarke
Format: 1024x1024 quadratisch.`;
  }

  // Default: lifestyle photo
  return `${baseContext}
Szenen-Produkt: ${input.product}
${input.visualDetails ? `Visuelle Details: ${input.visualDetails}` : ""}

Erstelle ein hochwertiges Lifestyle-Foto im Stil eines professionellen Vereins-Fotoshootings.
Szene: 3-5 Personen (verschiedene Altersgruppen, divers) in dunkelgrünen Schützen-Uniformen, ähnlich dem Hersfelder Sortiment.
${input.theme.toLowerCase().includes("jung") ? "Fokus auf jungen Menschen (18-30 Jahre), modern und energetisch." : "Natürlicher Mix aus jungen und erfahrenen Vereinsmitgliedern."}
Stimmung: ${
    input.theme.toLowerCase().includes("fest") || input.theme.toLowerCase().includes("feier")
      ? "Ausgelassenes Feiern, goldenes Abendlicht, Menschen lachen und stoßen an (mit Biergläsern oder Limonade), Festatmosphäre."
      : "Warme, authentische Gemeinschaft — Menschen umarmen sich, lachen, stehen stolz zusammen."
  }
Kein Alkohol prominent, keine Waffen, keine politischen Symbole.
Qualität: Editorial-Style, warm und lebendig wie Reportagefotografie.
Format: 1024x1024 quadratisch.`;
}

export function buildCaptionPrompt(input: {
  theme: string;
  product: string;
  message: string;
  platforms?: string[];
}): string {
  const forLinkedIn = input.platforms?.includes("linkedin") ?? false;

  const systemContext = `Thema: ${input.theme}
Produkt/Fokus: ${input.product}
Kernbotschaft: ${input.message}
Ton: Authentisch, warmherzig, gemeinschaftlich — wie ein echter Vereinsmensch schreibt. Nicht übertrieben werblich.
Sprache: Deutsch. Kein Rassismus, keine Waffen, keine politischen Aussagen.`;

  if (forLinkedIn) {
    return `Du bist Social-Media-Texter für Hersfelder Schützenbekleidung (schuetzen-ausstatter.de).
${systemContext}

Erstelle ZWEI Versionen:

INSTAGRAM (max. 160 Zeichen, emotional, direkt):
[Kurzer kraftvoller Satz mit Emoji] dann auf neuer Zeile 5 Hashtags.

---LINKEDIN---
LINKEDIN POST (150-250 Wörter, professionell-persönlich):
Beginne mit einer starken Frage oder Aussage über Vereinskultur, Gemeinschaft oder Tradition.
Erzähle eine kleine Geschichte oder teile einen Gedanken zum Thema.
Verknüpfe es mit Hersfelder und dem Produkt/Thema.
Schließe mit einem Call-to-Action oder einer Frage an die Community.
Dann eine Leerzeile, dann 8-10 LinkedIn-Hashtags (mix Deutsch/Englisch).

Antworte NUR mit den Texten — zuerst Instagram Caption, dann ---LINKEDIN---, dann LinkedIn Post. Keine Anführungszeichen.`;
  }

  return `Du bist Social-Media-Texter für Hersfelder Schützenbekleidung (schuetzen-ausstatter.de).
${systemContext}

Schreibe eine Instagram-Caption (max. 180 Zeichen, auf Deutsch, mit 1-2 Emojis) gefolgt von 5 relevanten Hashtags auf einer neuen Zeile.
Kein Hashtag-Spam — wähle 5 die wirklich passen. Immer #hersfelder dabei.
Antworte NUR mit der fertigen Caption. Keine Anführungszeichen.`;
}

export async function generateBrief(opts: {
  apiKey?: string;
  themeCategory: string;
  styleType: "photo" | "typography" | "product";
  weekNumber: number;
  year: number;
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
      ? "Grafik-Text-Post (nur Text und Design, kein Foto)"
      : opts.styleType === "product"
        ? "Produktfoto-Post (Produkt im Fokus)"
        : "Lifestyle-Foto-Post (Menschen im Verein)";

  const prompt = `Du bist kreativer Social-Media-Stratege für Hersfelder Schützenbekleidung (schuetzen-ausstatter.de).
Erstelle ein originelles, abwechslungsreiches Briefing für KW ${opts.weekNumber}/${opts.year}.

Post-Typ: ${styleDescription}
Themen-Kategorie: ${opts.themeCategory}
Mögliches Produkt: ${randomProduct}

Regeln:
- Kein Rassismus, keine Waffen, keine rechtsextremen Inhalte
- Fokus auf: Freude, Gemeinschaft, Stolz auf den Verein, Tradition, Zusammenhalt
- Sei kreativ und abwechslungsreich — nicht immer dasselbe
- Deutsche Botschaften, kurz und kraftvoll

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
      message: parsed.message ?? "Gemeinsam stark — Hersfelder Schützenbekleidung",
      visualDetails: parsed.visualDetails ?? "",
    };
  } catch {
    return {
      theme: opts.themeCategory,
      product: randomProduct,
      message: "Gemeinsam stark — Hersfelder Schützenbekleidung",
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
