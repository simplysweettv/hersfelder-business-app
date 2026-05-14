import OpenAI from "openai";

export function getOpenAIClient(apiKey?: string) {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY ist nicht gesetzt.");
  return new OpenAI({ apiKey: key });
}

const BRAND_DESCRIPTION = `Marke: Hersfelder Schützenbekleidung (schuetzen-ausstatter.de)
Farben: Dunkelgrün #1a5c2a (Hauptfarbe), Weiß, Rot (Akzent), Holz/Naturelemente
Kleidung: Dunkelgrüne Schützenröcke, Westen, Uniformen mit Hersfelder Wappen — getragen von echten Vereinsmenschen
Content-Strategie: KEIN Produktmarketing. Zeige echtes Vereinsleben — die Kleidung ist Teil der Szene, nicht das Thema.
Themen: Zusammenhalt beim Schützenfest, gemeinsames Feiern, Generationen im Verein, Stolz auf Tradition, Lachen und Freude
Stil: Authentisch wie Reportagefotografie — keine gestellten Werbeshootings
Zielgruppe: Schützenverein-Mitglieder in Deutschland, alle Altersgruppen`;

const SAFETY_RULES = `ABSOLUT VERBOTEN — niemals zeigen:
- Schusswaffen, Gewehre, Pistolen oder andere Waffen
- Politische Symbole, Reichsadler oder rechtsextreme Symbole
- Diskriminierende Darstellungen jeglicher Art
NUR ERLAUBT: Freude, Gemeinschaft, Feiern, Uniformen/Trachten, Sport, Vereinsleben, Natur`;

// Scene pool for variety — picked randomly per call
const PHOTO_SCENES = [
  "Menschen stoßen mit Gläsern an, lachen laut, Festatmosphäre mit Lichterketten im Hintergrund, goldenes Abendlicht",
  "Marschkapelle zieht durch die Straße — Uniformierte marschieren, Zuschauer jubeln, buntes Treiben",
  "Junge und ältere Vereinsmitglieder sitzen gemeinsam an einem Holztisch im Festzelt, erzählen, lachen",
  "Gruppe tanzt oder klatscht zu Musik auf dem Festplatz — echte Freude, natürliche Bewegung",
  "Zwei Generationen: Großvater und Enkel in Uniform, stehen nebeneinander, stolzes Lächeln",
  "Siegerehrung oder Ehrung — jemand bekommt eine Medaille, alle applaudieren, Stolz im Blick",
  "Aufbau des Festzelts: Männer und Frauen arbeiten zusammen, Witz und Gemeinschaft sichtbar",
  "Nach dem Umzug — kleine Gruppe steht erschöpft und glücklich zusammen, Uniformjacken offen",
  "Abendstimmung: Vereinsmitglieder sitzen draußen, Kerzen auf dem Tisch, warmes Licht, entspannte Unterhaltung",
  "Freundinnen in Uniform machen ein Selfie und lachen herzlich — modern und authentisch zugleich",
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

Erstelle eine Instagram-Typografie-Grafik im Stil eines modernen Vereins-Posters.
Design exakt nach diesen Vorgaben:
- Hintergrund: Tiefes Dunkelgrün (#1a5c2a) — satt, kein Gradient, keine Textur
- Haupttext: 3-5 Wörter, die die Kernbotschaft ausdrücken — WEISSE Großbuchstaben, extra-bold, serifenlos
- Schriftgröße: sehr groß, nimmt ca. 60% der Bildfläche ein, zentriert
- Optional: ein kurzes zweites Wort/Zeile in Rot (#c0392b), kleiner, darunter
- Unten mittig: kleines weißes Wappen-Symbol oder "HERSFELDER" in sehr kleinen Großbuchstaben, dezent
- Kein Foto, keine Menschen — reines kraftvolles Grafik-Design
- Wirkt wie ein Plakat: minimalistisch, mutig, einprägsam — ähnlich wie @schuetzenausstatter auf Instagram
Format: quadratisch.`;
  }

  if (style === "hook") {
    const scene = PHOTO_SCENES[Math.floor(Math.random() * PHOTO_SCENES.length)];
    return `${baseContext}
Szene: ${input.visualDetails || scene}

Erstelle ein Instagram-Hook-Post: authentisches Vereinsfoto mit GROSSEM Text im Bild.

Foto-Hintergrund:
- Echte Vereinsmenschen in dunkelgrünen Hersfelder Uniformen
- Szene: ${scene}
- Stil: Reportagefotografie — warm, lebendig, kein Studio
- Stimmung: Freude, Zusammenhalt, echte Emotionen

Text-Overlay (direkt im Bild, Teil des Designs):
- Maximal 4-6 Wörter aus der Kernbotschaft: "${input.message}"
- WEISS oder GELB, extra-bold serifenlose Schrift
- SEHR GROSS — nimmt 30-40% der Bildfläche ein
- Leicht dunkler Schatten oder halbtransparenter dunkler Streifen hinter dem Text für Lesbarkeit
- Text unten oder mittig platziert, Gesichter der Menschen bleiben sichtbar
- Wirkt wie ein "Scroll-Stopper": mutig, plakativ, sofort lesbar

Vorbild: Wie @schuetzenausstatter auf Instagram — z.B. "WO SCHÜTZEN FEIERN, BEBT DAS DORF." über einem Festfoto.
Keine Waffen, keine politischen Symbole.`;
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

Erstelle ein hochwertiges Reportage-Foto vom Vereinsleben — wie ein professioneller Fotograf beim Schützenfest.
Menschen: 3-5 Personen in dunkelgrünen Hersfelder Schützen-Uniformen, verschiedene Altersgruppen.
Moment: ${scene}
Stil: Warm, lebendig, wie Reportagefotografie — KEIN gestelltes Werbe-Shooting.
Keine Waffen, kein Alkohol prominent, keine politischen Symbole.`;
}

export function buildCaptionPrompt(input: {
  theme: string;
  product: string;
  message: string;
  platforms?: string[];
}): string {
  const platforms = input.platforms ?? ["instagram"];

  const hasInstagram = platforms.includes("instagram");
  const hasFacebook = platforms.includes("facebook");
  const hasTikTok = platforms.includes("tiktok");
  const hasLinkedIn = platforms.includes("linkedin");

  const systemContext = `Thema: ${input.theme}
Kontext: ${input.product}
Kernbotschaft: "${input.message}"

WICHTIG — Content-Strategie:
- KEIN Produktmarketing oder Werbung für Kleidung
- Zeige echtes Vereinsleben: Zusammenhalt, Freude, Tradition, Gemeinschaft beim Schützenfest
- Die Hersfelder Kleidung ist im Hintergrund sichtbar — sie gehört dazu, wird aber nicht beworben
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

Antworte NUR mit den Texten in der angegebenen Reihenfolge mit den Trennern (---INSTAGRAM---, ---FACEBOOK--- etc.). Keine Anführungszeichen, keine Erklärungen.`;
}

export async function generateBrief(opts: {
  apiKey?: string;
  themeCategory: string;
  styleType: "photo" | "typography" | "product" | "hook";
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
      ? "Grafik-Text-Post (nur Text und Design, kein Foto) — kraftvoller Spruch auf dunkelgrünem Hintergrund"
      : opts.styleType === "hook"
        ? "Hook-Post (Vereinsfoto mit GROSSEM Text-Overlay im Bild) — Scroll-Stopper, emotional, plakativ"
        : opts.styleType === "product"
          ? "Produktfoto-Post (Uniform/Kleidung sichtbar, aber Menschen und Moment im Fokus)"
          : "Lifestyle-Foto-Post (echte Menschen beim Feiern, Marschieren, Lachen im Verein)";

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
