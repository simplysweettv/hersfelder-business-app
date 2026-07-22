import OpenAI from "openai";
import { CONTENT_PILLARS, type PillarKey } from "@/types";
import { recordAiUsage } from "./ai-cost";

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
    // Mehr Text-im-Bild: Hook/Typografie überwiegen jetzt deutlich.
    styles: ["hook", "hook", "photo", "typography"],
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
    styles: ["hook", "hook", "photo"],
    themes: [
      "Qualität & Verarbeitung",
      "Detail der Uniform",
      "Langlebigkeit",
      "Stoff & Verarbeitung",
      "Nachkaufgarantie & Verfügbarkeit",
    ],
    cta: "soft",
    briefHint:
      "Mach Qualität & Verarbeitung der Hersfelder Kleidung sichtbar — Detail, saubere Verarbeitung, Langlebigkeit, konstante Qualität durch eigene Produktion. Vertrauen aufbauen, nicht marktschreierisch. ACHTUNG: Wir sind KEINE Maßschneiderei — kein 'handgeschneidert', kein 'Schneiderhandwerk'.",
  },
  proof: {
    styles: ["hook", "hook", "photo"],
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
      "Lade Vereine herzlich ein, sich für eine Ausstattung zu melden — warm und konkret (z.B. persönliche Beratung, Muster anfordern, Größen 23–70 alle zum gleichen Preis, jederzeit nachbestellbar). Einladend, nicht aufdringlich.",
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

/**
 * Wie pickPillar, aber mit (gelernten) Gewichten.
 *
 * WICHTIG (Review): "service" ist hier AUSGESCHLOSSEN — die Service-/Werbe-
 * Säule kommt ausschließlich über die festen CTA-Slots (jeder 5. Post). Sonst
 * läge der Werbeanteil in Summe deutlich über den angepeilten ~20 %.
 * Die verbleibenden Säulen werden auf den Ziel-Mix normalisiert
 * (community 45 % · craft 20 % · proof 20 % + Rest, wenn service fehlt).
 */
export function pickPillarWeighted(weights: Partial<Record<PillarKey, number>>): PillarKey {
  const entries = CONTENT_PILLARS.filter((p) => p.key !== "service").map((p) => ({
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

/**
 * Passenden Post-Stil und Themen-Vorschlag für eine Säule ziehen.
 * `recentStyles` (neueste zuerst) macht die Wahl verlässlich statt rein zufällig:
 * - Hatten die letzten 2 Posts KEIN Text-im-Bild (hook/typography), wird es erzwungen.
 * - Nie 3x derselbe Stil hintereinander.
 */
export function pillarPick(pillar: PillarKey, recentStyles: string[] = []) {
  const g = PILLAR_GUIDANCE[pillar];
  let styleType = g.styles[Math.floor(Math.random() * g.styles.length)];

  const lastTwo = recentStyles.slice(0, 2);
  const isTextStyle = (s: string) => s === "hook" || s === "typography";

  // Text-im-Bild-Garantie: spätestens jeder 3. Post ist hook/typography.
  if (lastTwo.length === 2 && !lastTwo.some(isTextStyle) && !isTextStyle(styleType)) {
    styleType =
      g.styles.includes("typography") && Math.random() < 0.3 ? "typography" : "hook";
  }

  // Abwechslung: nicht 3x derselbe Stil in Folge.
  if (lastTwo.length === 2 && lastTwo[0] === styleType && lastTwo[1] === styleType) {
    const alternatives = g.styles.filter((s) => s !== styleType);
    if (alternatives.length) {
      styleType = alternatives[Math.floor(Math.random() * alternatives.length)];
    }
  }

  return {
    styleType,
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

/**
 * Master-Briefing der Marke (Andreas, Juli 2026) — bindend für JEDE Bild- und
 * Texterstellung. Wird jedem Prompt vorangestellt, unabhängig vom
 * brand_style_prompt aus den Settings.
 */
const MASTER_BRIEFING = `MARKEN-BRIEFING HERSFELDER (bindend, hat Vorrang vor allem anderen):

POSITIONIERUNG:
- Hersfelder ist eine eigene Marke und produziert alle Produkte selbst — ein durchdachtes STANDARDSORTIMENT mit dauerhafter Verfügbarkeit, konstanter Qualität und Nachkaufgarantie.
- Wir sind KEINE Maßschneiderei, KEIN individueller Uniformschneider. Wir fertigen KEINE Einzelstücke und bieten KEINE Maßkonfektion an.
- Sortiment: Schützenjacken, Westen, Hosen, Fräcke, Poloshirts, T-Shirts, Softshelljacken, Hoodies — festes Design, jederzeit nachbestellbar.
- GRÖSSEN-USP: Größe 23 bis 70 — alle Größen zum GLEICHEN Preis, keine Größenaufschläge.
- Individualisierung nur in 2 Bereichen: (1) Vereinslogo/-name per standardisiertem Druck/Stick auf Polos, T-Shirts, Hoodies, Softshelljacken; (2) individuelle Vereinsuniformen NUR als Projekt bei größeren Vereinen ab produktionsfähigen Stückzahlen — keine Einzelanfertigungen, keine kleinen Stückzahlen.
- Wir stehen für: faire Preise, dauerhaft verfügbare Produkte, hohe Lieferfähigkeit, große Größenauswahl, unkomplizierte Bestellung, moderne Vereinsausstattung.

NIEMALS BEHAUPTEN (in keinem Text, keiner Caption, keiner Botschaft):
- "maßgeschneidert", "individuell gefertigt", "Maßkonfektion", "handgeschneidert", "exklusiv für dich gefertigt", "Schneiderhandwerk", "Einzelanfertigung", "Couture"
- Keine technischen Aussagen ohne Nachweis: "klimaregulierend", "kühlend", "atmungsaktiv", "temperaturregulierend", "Hightech-Faser", "Funktionsstoff"
- Keine Luxus-, Designer- oder Maßanzug-Positionierung.

BILDSPRACHE (verbindlich für jedes Bild):
- Ausschließlich Uniformen, die dem echten Standardsortiment entsprechen — realistisch, schlicht-elegant, jederzeit bestellbar wirkend. Wenn Referenzbilder vorliegen, sind diese die gestalterische Grundlage.
- KEINE Fantasieuniformen. KEINE historischen Uniformen. KEINE militärischen Uniformen. KEINE überladenen Verzierungen, KEINE Goldlitzen, KEINE Epauletten mit übertriebenen Details, KEINE Fantasieknöpfe.

ZIEL JEDER KOMMUNIKATION: Nicht die einzelne Uniform verkaufen, sondern vermitteln: "Hersfelder ist der zuverlässige Ausstatter für Vereine."`;

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
Content-Strategie (Zwei-Säulen-System, Juli 2026): Säule EMOTIONAL zeigt echtes Vereinsleben — die Kleidung ist Teil der Szene, nicht das Thema. Säule PRODUKT zeigt konkrete Produkte mit ehrlichen Benefits (designtes Layout mit Wappen + Benefit-Leiste) — immer mit einer Idee dahinter, nie Katalog-Optik.
Themen: Zusammenhalt beim Schützenfest, gemeinsames Feiern, Generationen im Verein, Stolz auf Tradition, Lachen und Freude
Stil: Authentisch wie Reportagefotografie — keine gestellten Werbeshootings
Zielgruppe: Schützenverein-Mitglieder in Deutschland, alle Altersgruppen`;

const SAFETY_RULES = `ABSOLUT VERBOTEN — niemals zeigen:
- Schusswaffen, Gewehre, Pistolen oder andere Waffen
- Politische Symbole, Reichsadler oder rechtsextreme Symbole
- Slogans die wie nationalistische oder rechtsextreme Parolen wirken — z.B. "In Einheit stark", "Für Heimat und Volk", militärische Kampfparolen
- Diskriminierende Darstellungen jeglicher Art
NUR ERLAUBT: Freude, Gemeinschaft, Feiern, Uniformen/Trachten, Sport, Vereinsleben, Natur`;

// Scene pool — deliberately broad: Hochsaison, Vorsaison, Off-Season, Handwerk, Generationen
const PHOTO_SCENES = [
  // Festzelt & Umzug (Hochsaison)
  "Menschen stoßen ausgelassen mit Bierkrügen an, Lachen und Jubeln, goldenes Abendlicht im Festzelt, Lichterketten glänzen",
  "Spontaner Umzug auf dem Marktplatz — Schützen in dunkelgrünen Uniformen marschieren, Kinder winken vom Straßenrand, Konfetti in der Luft",
  "Großes Festzelt: vier Generationen sitzen zusammen, der Älteste erzählt, alle hören gespannt zu, warmes Kerzenlicht",
  "Bieranstich im Festzelt — Bürgermeister schlägt das Fass an, alle jubeln, Schaum fliegt",
  "Abschlussabend: alle Schützen stehen im Kreis, Arme umeinander, singen gemeinsam — echte Bruderschaft",
  "Drei Freundinnen in Uniform lachen laut beim Selfie, Feuerwerk im Hintergrund, echter Lebensmoment",
  "Marschkapelle in voller Fahrt — Posaunen glänzen in der Sonne, Gesichter voller Konzentration und Stolz",
  // Generationen & Emotion
  "Großvater und Enkel, beide in Uniform, stehen Schulter an Schulter — stolze Blicke in die Kamera, Heimgefühl pur",
  "Siegerehrung: Junge Schützin bekommt ihre erste Medaille, die ganze Gruppe applaudiert mit Tränen vor Stolz",
  "Kleines Mädchen im Schützenkostüm tanzt mit Opa auf der Wiese, Publikum schaut begeistert zu",
  "Zwei Schützen, ein älterer Herr und eine Jugendliche, stehen nebeneinander und schauen stolz auf ihr Abzeichen",
  // Vorsaison & Vorbereitung (Frühling)
  "Vereinsmitglieder holen im Frühjahr ihre Uniformen aus dem Schrank — erste Anprobe, lächelnde Gesichter, Aufbruchstimmung",
  "Festzelt-Aufbau am Morgen — alle packen mit an, Scherze fliegen, Kaffeebecher in der Hand, Sonnenschein",
  "Erste Probe nach der Winterpause: Schützen treffen sich im Vereinshaus, herzliche Umarmungen, alte Freunde",
  "Gruppe von Schützen beim Probemarschieren auf einer sonnigen Dorfstraße — Frühlingsstimmung, Bäume blühen",
  // Off-Season & Gemeinschaft (Herbst/Winter)
  "Gemütlicher Vereinsabend im Herbst: Kerzen auf dem Holztisch, Schützen sitzen zusammen, wärmendes Licht",
  "Jahresabschlussfeier: Ehrungen und Medaillen werden verteilt, Applaus, Tränen der Rührung, Familienatmosphäre",
  "Winterlicher Spaziergang — Schützen in Uniformjacken spazieren gemeinsam durch verschneiten Ort, lachen",
  "Weihnachtsessen des Vereins: festlicher Tisch, Uniformmitglieder feiern gemeinsam, Kerzen und Tannengrün",
  "Generalversammlung: entspannte Runde im Vereinsheim, alte und neue Vorstandsmitglieder lachen zusammen",
  // Handwerk & Detail
  "Nahaufnahme: frisch gelieferte dunkelgrüne Schützenjacke wird sorgfältig ausgepackt und zurechtgelegt, Vorfreude sichtbar",
  "Detailaufnahme: Stickerei auf einer Schützenuniform, warmes Licht, feine Handarbeit",
  "Vereinsmitglied hält stolz seine neue Uniform hoch — frisch aus der Lieferung, breites Lächeln",
  // Abends & Atmosphäre
  "Abends nach dem großen Umzug: erschöpfte und glückliche Gruppe, Uniformjacken offen, Arme umeinander",
  "Kerzenlicht und Sternenhimmel: Vereinsmitglieder sitzen draußen, Wein und Lachen, tiefe Gespräche",
  "Spontaner Kreistanz auf dem Festplatz — Uniformierte fassen sich an den Händen und wirbeln herum, pure Freude",
];

function getSeasonalContext(month: number): string {
  if (month === 12 || month <= 2)
    return "Winter/Jahreswende: Weihnachtsfeier, Jahresrückblick, Jahresplanung, Generalversammlung — ruhige, besinnliche Zeit im Verein";
  if (month <= 5)
    return "Frühling/Vorsaison: Aufregung vor der Saison, erste Uniformproben, Frühjahrsputz im Vereinsheim, neue Mitglieder begrüßen — Aufbruchstimmung";
  if (month <= 8)
    return "Hochsaison: Schützenfeste auf Hochtouren, Umzüge, Festzelte, gemeinsames Feiern — die schönste Zeit im Vereinsjahr";
  return "Herbst/Saisonausklang: Letztes Fest der Saison, Ehrungen, Jahresabschlussfeier, Rückblick auf ein tolles Vereinsjahr — Gemütlichkeit und Dankbarkeit";
}

/**
 * Säulen-spezifisches Bildmotiv: macht die Content-Säule im BILD sichtbar.
 * craft = Detail/Makro · proof = stolze Gruppe in neuen Uniformen ·
 * service = Anprobe/Beratung. community/null → bestehende Feier-Szenen.
 */
function pillarImageDirective(
  pillar?: PillarKey,
): { scene: string; prose: string } | null {
  switch (pillar) {
    case "craft":
      return {
        scene:
          "Makro-/Detailaufnahme einer schlichten dunkelgrünen Schützenjacke aus dem Standardsortiment: feiner Wollstoff, saubere Nähte, klassische schlichte Knöpfe, ordentlich verarbeiteter Kragen — realistisch, wie aus dem Webshop",
        prose:
          "Erstelle eine hochwertige Detail-/Makroaufnahme in Produktfoto-Qualität — Fokus auf Material, saubere Verarbeitung und Langlebigkeit der Uniform. Warmes gerichtetes Licht, geringe Schärfentiefe. KEINE Menschenmenge, KEIN Festzelt, KEINE Schneiderwerkstatt/Atelier-Szene (wir sind keine Maßschneiderei) — ruhig, wertig, realistisch bestellbar.",
      };
    case "proof":
      return {
        scene:
          "Stolze Gruppe von 4-6 Vereinsmitgliedern in brandneuen, gestochen scharfen, exakt einheitlichen dunkelgrünen Uniformen, selbstbewusst vor dem Vereinsheim aufgereiht, zufriedene Blicke",
        prose:
          "Erstelle ein stolzes Gruppenporträt — der Verein wurde gerade komplett neu eingekleidet und präsentiert sich. Saubere, einheitliche Uniformen, würdevoll aber warm, Tageslicht. Wirkung: 'schaut, wie gut unsere Truppe jetzt aussieht'.",
      };
    case "service":
      return {
        scene:
          "Freundliche Größenberatung: ein Vereinsmitglied probiert eine dunkelgrüne Uniform aus dem Standardsortiment an und schaut in den Spiegel, ein Berater reicht die passende Konfektionsgröße aus einem Musterset an — warmherzig, hell, vertrauensvoll. KEIN Maßband, KEIN Vermessen, KEINE Schneiderwerkstatt.",
        prose:
          "Erstelle ein einladendes Foto rund um Größenberatung & Ausstattung — eine Anprobe aus dem Standardsortiment oder ein freundliches Beratungsgespräch zur Vereinsausstattung. Hell, freundlich, Partner auf Augenhöhe. WICHTIG: Wir sind KEINE Maßschneiderei — zeige Auswahl aus fertigen Größen und ein Musterset, NIEMALS Maßband, Vermessen, Kreide oder Nähwerkstatt.",
      };
    default:
      return null;
  }
}

export function buildImagePrompt(input: {
  brandStyle?: string | null;
  theme: string;
  product: string;
  message: string;
  styleType?: "photo" | "typography" | "product" | "hook";
  visualDetails?: string;
  sceneIdea?: string;
  pillar?: PillarKey;
}): string {
  const style = input.styleType ?? "photo";
  const brand = input.brandStyle?.trim() || BRAND_DESCRIPTION;
  const pd = pillarImageDirective(input.pillar);
  const randomScene = () => PHOTO_SCENES[Math.floor(Math.random() * PHOTO_SCENES.length)];
  // Szene: Säulen-Direktive > Szenen-Pool (Vielfalt!) > KI-Beschreibung > Zufall.
  // visualDetails ist nur noch ergänzende Stimmung — vorher hat es den Szenen-Pool
  // komplett verdrängt und alle Fotos sahen aus wie "Menschen stehen und feiern".
  const pickScene = () => pd?.scene || input.sceneIdea || input.visualDetails || randomScene();
  const moodLine =
    input.visualDetails && !pd?.scene && input.sceneIdea
      ? `\nZusätzliche Stimmung/Details: ${input.visualDetails}`
      : "";

  const baseContext = `${MASTER_BRIEFING}

${brand}

${SAFETY_RULES}

Thema: ${input.theme}
Kernbotschaft: "${input.message}"`;

  if (style === "typography") {
    const isService = input.pillar === "service";
    const textGuidance = isService
      ? `- WICHTIG ZUM TEXTINHALT: Der Text ist eine warme EINLADUNG an Schützenvereine zur Neu-Ausstattung — partnerschaftlich, nicht marktschreierisch.
  GUTE Beispiele: "ZEIT FÜR NEUE UNIFORMEN", "RÜSTET EUREN VEREIN AUS", "EURE VEREINSAUSSTATTUNG 2026", "WIR KLEIDEN EUREN VEREIN EIN"
  SCHLECHTE Beispiele: Preis-/Rabatt-Schreierei, "JETZT KAUFEN", politische Parolen`
      : `- WICHTIG ZUM TEXTINHALT: Der Text muss klingen wie eine FEIER-EINLADUNG — warmherzig, fröhlich, einladend.
  NICHT wie eine politische Parole oder ein nationalistischer Slogan.
  GUTE Beispiele: "HEUT WIRD GEFEIERT", "WIR FEIERN ZUSAMMEN", "HERZLICH WILLKOMMEN", "SCHÜTZENFEST SAISON 2026"
  SCHLECHTE Beispiele: "IN EINHEIT STARK", "TRADITION VERBINDET UNS", "FÜR HEIMAT UND VEREIN"`;
    return `${baseContext}

Erstelle eine ${isService ? "einladende, vertrauensvolle" : "fröhliche, festliche"} Vereins-Grafik — warmherzig.
Design:
- Hintergrund: Tiefes Dunkelgrün (#1a5c2a) — satt, kein Gradient
- Haupttext: 3-5 Wörter — WEISSE Großbuchstaben, extra-bold, serifenlos, zentriert
${textGuidance}
- Optional: ein kurzes Akzent-Wort in Rot (#c0392b), kleiner, darunter
- KEIN Markenname, KEIN Logo, KEIN Wappen, KEIN Adler, KEIN Schild im Bild — reines Text-Design
- Kein Foto, keine Menschen — reines Grafik-Design
Format: quadratisch.`;
  }

  if (style === "hook") {
    const scene = pickScene();
    const fotoProse = pd
      ? pd.prose
      : "Echte, lebendige Menschen in dunkelgrünen Schützen-Uniformen — Dokumentarfotografie, warm und spontan.";
    return `${baseContext}
Szene: ${scene}${moodLine}

Erstelle einen Instagram-Hook-Post: ${pd ? "themenstarkes Foto" : "authentisches Schützenfest-Foto"} mit GROSSEM Text im Bild.

Foto-Hintergrund:
- ${fotoProse}
- Szene: ${scene}

Text-Overlay (direkt im Bild, Teil des Designs — das Wichtigste!):
- MAXIMAL 4-7 WÖRTER — kurz, knackig
- Inspiration aus der Kernbotschaft: "${input.message}"
- Ton: warmherzig — KEIN nationalistischer Klang
- Schrift: WEISS oder WARMGELB, extra-bold, serifenlos, kraftvoll
- SEHR GROSS — Text nimmt 35-50% der Bildfläche ein
- Halbtransparenter dunkler Balken/Schatten hinter dem Text für maximale Lesbarkeit

ABSOLUT VERBOTEN im Bild:
- Kein Markenname "Hersfelder", kein Logo, kein Wappen, kein Adler, kein Schild
- Keine Waffen, keine politischen Symbole

Format: Hochformat (Portrait).`;
  }

  // photo / product / default
  const scene = pickScene();
  const prose = pd
    ? pd.prose
    : `Erstelle ein hochwertiges Reportage-Foto vom Vereinsleben — wie ein Fotojournalist, der den Verein durchs Jahr begleitet.
Menschen: passend zur Szene, in dunkelgrünen Schützen-Uniformen, verschiedene Altersgruppen, echter Moment.
Stil: Warmherzig, lebendig, spontan — KEIN gestelltes Werbe-Shooting. Licht passend zur Szene (Tageslicht, Abendlicht, Kerzenlicht).
Stimmung: Freude, Zusammenhalt, Gemeinschaft.`;
  return `${baseContext}
Szene: ${scene}${moodLine}

${prose}
Kein Markenname, kein Logo, kein Wappen im Bild. Keine Waffen. Kein Alkohol prominent im Vordergrund.`;
}

export function buildCaptionPrompt(input: {
  theme: string;
  product: string;
  message: string;
  platforms?: string[];
  pillar?: PillarKey;
  /** Die konkrete Bild-Headline dieses Posts — die Caption baut FRISCH darauf auf. */
  hook?: string;
  /** Floskeln, die nicht vorkommen dürfen (aus dem Konzept-System). */
  bannedPhrases?: string[];
}): string {
  const platforms = input.platforms ?? ["instagram"];

  // CTA-Stärke je nach Säule: weich (Engagement) vs. klar (Lead).
  const cta = input.pillar ? PILLAR_GUIDANCE[input.pillar].cta : "soft";
  const ctaInstruction =
    cta === "hard"
      ? `CALL-TO-ACTION (dezent, letzter Satz — fühlt sich an wie ein Tipp vom Vereinsfreund, nicht wie Werbung):
- Zuerst: emotionaler Haupt-Content genau wie bei anderen Posts — der Leser MUSS erst bewegt werden, bevor der CTA kommt.
- Allerletzter Satz: sanfte Einladung, als würde ein Vereinsfreund einen Tipp geben.
- GUTE Beispiele: "Übrigens — wer seinen Verein neu ausstatten möchte, findet bei uns alles auf einen Blick → Link in Bio 🟢", "Kleine Info am Rande: Wir beraten Vereine kostenlos. Einfach kurz melden 💚", "Wer noch auf der Suche nach der richtigen Vereinsuniform ist — schaut mal bei schuetzen-ausstatter.de vorbei 🟢"
- Nicht fett, nicht groß, nicht als eigener Absatz — einfach der natürliche letzte Satz.`
      : `COMMUNITY-FRAGE (am Ende — lädt wirklich zum Kommentieren ein):
- Schließe mit einer echten, offenen Frage, die Vereinsmenschen gerne beantworten.
- GUTE Beispiele: "Wie ist das bei euch im Verein? 👇", "Wer erkennt sich hier wieder? 😄", "Was macht euer Schützenfest besonders — was darf auf keinen Fall fehlen? 💬", "Wieviele Jahre seid ihr dabei? 🎯"
- Die Frage muss konkret und einladend sein — nicht "Was denkt ihr?" sondern echte Neugier zeigen.`;

  const hasInstagram = platforms.includes("instagram");
  const hasFacebook = platforms.includes("facebook");
  const hasTikTok = platforms.includes("tiktok");
  const hasLinkedIn = platforms.includes("linkedin");

  // Inhaltlicher Fokus je Säule — DAMIT die Säule im Text wirklich sichtbar wird
  // (sonst klingt jeder Post nach "gemeinsam feiern").
  const strategyByPillar: Record<PillarKey, string> = {
    community: `- KEIN Produktmarketing oder Werbung für Kleidung
- THEMA: echtes Vereinsleben — Zusammenhalt, Freude, Tradition, Gemeinschaft beim Schützenfest
- Die Hersfelder Kleidung ist im Hintergrund sichtbar — sie gehört dazu, wird aber nicht beworben`,
    craft: `- THEMA = QUALITÄT & VERARBEITUNG: Sprich konkret über das Material, die saubere Verarbeitung und dass die Uniform jahrelang hält. Das IST hier ausdrücklich das Thema (Ausnahme von "kein Produktmarketing").
- Ton: stolz auf die Qualität, aber bodenständig — KEIN Katalog-Sprech, keine Superlative-Schleuder.
- Nicht über Feiern reden — sondern über Stoff, Naht, Langlebigkeit, "das hält ein Vereinsleben lang".
- VERBOTEN: "handgeschneidert", "maßgeschneidert", "Schneiderhandwerk", "Einzelanfertigung" — wir sind Standardsortiment-Marke, keine Maßschneiderei. Auch keine unbelegten Technik-Claims ("atmungsaktiv" etc.).`,
    proof: `- THEMA = VEREINS-STORY (Social Proof): Erzähle, wie ein Schützenverein von Hersfelder neu eingekleidet wurde — wie stolz/zufrieden sie sind, wie gut die Truppe jetzt aussieht.
- Glaubwürdig & warm, bodenständig — keine erfundenen Namen großspurig behaupten, keine Übertreibung.
- Nicht generisch übers Feiern — sondern über das Ergebnis der Ausstattung.`,
    service: `- Du DARFST hier dezent zur Vereins-Ausstattung/Beratung einladen — als hilfsbereiter Partner, nicht als Verkäufer
- Kein aggressives Produktmarketing, keine Preis-/Rabatt-Schreierei
- Schreibe warmherzig und partnerschaftlich, auf Augenhöhe mit dem Vereinsvorstand`,
  };
  const strategyRules = input.pillar
    ? strategyByPillar[input.pillar]
    : strategyByPillar.community;

  const bannedList = (input.bannedPhrases ?? []).join(" · ");
  const systemContext = `Thema: ${input.theme}
Kontext: ${input.product}
Kernbotschaft: "${input.message}"${input.hook ? `\nBild-Headline dieses Posts: "${input.hook}"` : ""}

WICHTIG — Content-Strategie:
${strategyRules}
- Schreibe wie ein echter Vereinsmensch: warmherzig, authentisch, stolz auf die Gemeinschaft
- Ansprache immer "ihr/euch/euer" — niemals "Sie/Ihnen".
- Sprache: Deutsch. Kein Rassismus, keine Waffen, keine politischen Aussagen.
- NIEMALS über das Schießen/Zielen/Gewehre schreiben ("Schuss", "schießen", "Treffer", "Gewehr" o. Ä. sind tabu) — es geht um Gemeinschaft, Fest und Ausstattung, nie um den Schießsport selbst.
- ANTI-FLOSKEL: keine abgedroschenen Phrasen${bannedList ? ` — konkret verboten: ${bannedList}` : ""}. Jeder Post braucht einen konkreten, eigenen Gedanken statt Allgemeinplätze.
${input.hook ? `- Die Bild-Headline gibt die Idee vor: Greife ihren Gedanken auf und formuliere ihn im Text FRISCH weiter — wiederhole die Headline (oder Teile davon) NICHT wörtlich.` : ""}`;

  const blocks: string[] = [];

  if (hasInstagram) {
    blocks.push(`---INSTAGRAM---
Instagram-Caption — schreibe wie ein echter Vereinsmensch, warmherzig und persönlich:

OPENER (erste Zeile — das Wichtigste, entscheidet ob jemand weiterliest):
- Muss zu DIESEM Post passen (Thema/Headline oben) — kein Standard-Einstieg von der Stange.
- VARIIERE die Form bewusst: mal eine echte Frage, mal ein sinnliches Bild, mal eine Erinnerung, mal eine überraschende Aussage, mal ein Kontrast. NICHT jeder Post darf mit "Wenn..." anfangen.
- SCHLECHTE (verbotene) Opener — niemals so oder ähnlich: "Wenn man nach einem Jahr wieder die Uniform anzieht — dieses Gefühl.", "Gemeinsam in die neue Saison!", "Tradition verbindet uns!", "Ein besonderer Moment!" — abgedroschen, austauschbar, seelenlos.
- Konkret schlägt allgemein: ein echtes Detail (ein Geräusch, eine Uhrzeit, eine Zahl, ein Handgriff) wirkt tausendmal stärker als "Gemeinschaft" und "Tradition".

BODY (optional, nach einer Leerzeile):
- 1-2 kurze Sätze, die die Stimmung vertiefen — max. 2 Zeilen

ABSCHLUSS:
- Community-Frage oder dezenter CTA (→ wie oben angegeben)

HASHTAGS (neue Zeile darunter):
- Genau 4-5 passende Hashtags, immer #hersfelder dabei
- Mische Reichweiten-Tags (#schützenfest) mit Nischen-Tags (#vereinsleben #schützenverein)
- Kein Hashtag-Spam`);
  }

  if (hasFacebook) {
    blocks.push(`---FACEBOOK---
Facebook-Post — persönlicher, erzählender Stil für die Vereins-Community:
- Starte mit einer Frage oder einer kleinen Geschichte ("Wer kennt das noch...")
- Schreibe 2-4 Sätze, familiär und einladend — wie ein Freund, der im Festzelt erzählt
- Lade am Ende zum Kommentieren ein: eine konkrete Frage ("Was war euer schönstes Schützenfest-Moment?")
- Max. 2 Hashtags oder gar keine — Facebook braucht keine Hashtags`);
  }

  if (hasTikTok) {
    blocks.push(`---TIKTOK---
TikTok-Caption (max. 130 Zeichen, knackig und jung):
- Erster "Satz": direkter Hook — 3-5 Wörter, die neugierig machen oder ein Gefühl triggern
- Rest: kurze Ergänzung oder Emojis
- 5-6 Hashtags: mix aus groß (#schützenfest, #vereinsleben, #tradition) und nischen (#schützenverein, #hersfelder, #schützen)
- Stil: Umgangssprache, lebendig, kein Fließtext`);
  }

  if (hasLinkedIn) {
    blocks.push(`---LINKEDIN---
LinkedIn-Post (150-250 Wörter, professionell-persönlich):
- Erster Satz: starke, überraschende Aussage über Vereinskultur, Ehrenamt oder Gemeinschaft
- Absätze: kurz (2-3 Sätze), Leerzeile dazwischen — mobile-optimiert
- Erzähle eine kleine Geschichte oder teile einen echten Gedanken: was Schützenvereine über Gemeinschaft, Loyalität oder Tradition lehren
- Verbindung zu Hersfelder als stiller Partner der Vereinskultur (nicht als Verkäufer)
- Schließe mit einer offenen Frage an die Community
- Letzte Zeile: 3 Hashtags (z.B. #Vereinsleben #Schützenfest #Gemeinschaft)`);
  }

  return `${MASTER_BRIEFING}

Du bist Social-Media-Texter für Hersfelder Schützenbekleidung (schuetzen-ausstatter.de).
${systemContext}

Erstelle für jede der folgenden Plattformen eine maßgeschneiderte Version:

${blocks.join("\n\n")}

${ctaInstruction}

Achte auf einwandfreie deutsche Rechtschreibung und Grammatik: korrekte Leerzeichen zwischen Wörtern (keine zusammengeklebten Wörter wie "undeinander"), richtige Zeichensetzung, vollständige Sätze.

Antworte NUR mit den Texten in der angegebenen Reihenfolge mit den Trennern (---INSTAGRAM---, ---FACEBOOK--- etc.). Keine Anführungszeichen, keine Erklärungen.`;
}

export async function generateBrief(opts: {
  apiKey?: string;
  themeCategory: string;
  styleType: "photo" | "typography" | "product" | "hook";
  weekNumber: number;
  year: number;
  month?: number; // 1-12 — für saisonalen Kontext
  pillar?: PillarKey;
  avoid?: string[]; // kürzlich genutzte Themen/Botschaften — nicht wiederholen
  topical?: string; // aktueller Kontext (Wetter/Datum/Anlass) für zeitnahe Aufhänger
  reactiveHook?: string; // starker reaktiver Aufhänger (z.B. Hitze) — direkt aufgreifen
}): Promise<{
  theme: string;
  product: string;
  message: string;
  visualDetails: string;
  sceneIdea?: string; // gewählte Szene aus dem Pool — für buildImagePrompt durchreichen
}> {
  const client = getOpenAIClient(opts.apiKey);

  // Szenen-Vielfalt: für Foto-basierte Posts eine konkrete Szene aus dem Pool
  // ziehen und das Briefing DARUM bauen — sonst beschreibt die KI immer nur
  // "Menschen stehen und feiern".
  const sceneIdea =
    opts.styleType === "photo" || opts.styleType === "hook" || opts.styleType === "product"
      ? PHOTO_SCENES[Math.floor(Math.random() * PHOTO_SCENES.length)]
      : undefined;

  // Nur echtes Standardsortiment (siehe MASTER_BRIEFING) — keine erfundenen Produkte
  const PRODUCTS = [
    "Schützenjacke dunkelgrün",
    "Damenweste aus dem Standardsortiment",
    "Herrenweste grün",
    "Uniform-Set (Jacke + Hose)",
    "Schützenfest-Frack",
    "Softshelljacke mit Vereinslogo",
    "Poloshirt mit Vereinsnamen",
    "Hoodie in Vereinsausführung",
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

  const seasonLine = opts.month
    ? `\nSaisonaler Kontext: ${getSeasonalContext(opts.month)}`
    : "";

  const avoidLine =
    opts.avoid && opts.avoid.length
      ? `\nWICHTIG — VERMEIDE Wiederholung. Diese Themen/Botschaften wurden kürzlich genutzt, mach etwas DEUTLICH anderes:\n- ${opts.avoid.slice(0, 8).join("\n- ")}`
      : "";

  const topicalLine = opts.topical ? `\n\n${opts.topical}` : "";
  const reactiveLine = opts.reactiveHook
    ? `\n\nREAKTIVER AUFHÄNGER (greif das JETZT konkret auf — das macht den Post besonders): ${opts.reactiveHook}`
    : "";
  const sceneLine = sceneIdea
    ? `\nBild-Szene (das Foto zeigt GENAU diese Szene — baue Thema und Botschaft darum): ${sceneIdea}`
    : "";

  const prompt = `${MASTER_BRIEFING}

Du bist kreativer Social-Media-Stratege für Hersfelder Schützenbekleidung (schuetzen-ausstatter.de).
Erstelle ein originelles, abwechslungsreiches Briefing für KW ${opts.weekNumber}/${opts.year}.

Post-Typ: ${styleDescription}
Themen-Kategorie: ${opts.themeCategory}
Mögliches Produkt: ${randomProduct}${pillarLine}${seasonLine}${sceneLine}${avoidLine}${topicalLine}${reactiveLine}

Regeln:
- Kein Rassismus, keine Waffen, keine rechtsextremen Inhalte
- KRITISCH: Die "message" darf NIEMALS wie eine nationalistische/rechtsextreme Parole klingen.
  Verboten: "In Einheit stark", "Für Heimat und Volk", militärische Slogans, völkische Sprache.
- ❌ ABSOLUT VERBOTEN sind generische Floskeln. Diese Sätze (und alles in der Art) NIE benutzen:
  "Gemeinsam feiern", "Tradition verbindet", "Vereinsleben ist ein Fest", "Zusammen sind wir stark",
  "Gemeinsam lachen, gemeinsam feiern", "Stolz auf unseren Verein". Das ist langweilige Mainstream-Soße.
- ✅ STATTDESSEN: ein KONKRETER, spezifischer, überraschender Aufhänger — am liebsten zeitnah
  (Wetter heute, der konkrete Wochentag/Anlass, eine kleine alltägliche Szene, ein Detail, ein Augenzwinkern).
  Denk wie ein cleverer Social-Media-Mensch, der mit echten, aktuellen Momenten Aufmerksamkeit zieht.
- Sei kreativ und abwechslungsreich — jeder Post fühlt sich anders an
- Deutsche Botschaften, kurz und prägnant

Antworte NUR als JSON-Objekt:
{
  "theme": "konkretes Thema (max 50 Zeichen, deutsch)",
  "product": "Produkt oder Vereinselement (max 50 Zeichen)",
  "message": "kurze kraftvolle Botschaft/Zitat auf Deutsch (max 70 Zeichen)",
  "visualDetails": "brief English description of mood/light/details matching the Bild-Szene (max 80 chars)"
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
  await recordAiUsage({ operation: "brief", model: "gpt-4o-mini", usage: res.usage });

  const raw = res.choices?.[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(raw);
    return {
      theme: parsed.theme ?? opts.themeCategory,
      product: parsed.product ?? randomProduct,
      message: parsed.message ?? "Zusammen feiern — das verbindet uns",
      visualDetails: parsed.visualDetails ?? "",
      sceneIdea,
    };
  } catch {
    return {
      theme: opts.themeCategory,
      product: randomProduct,
      message: "Zusammen feiern — das verbindet uns",
      visualDetails: "",
      sceneIdea,
    };
  }
}

/** Inhalt für ein Lehr-/Story-Karussell (Cover + 3-4 Punkte), je nach Säule. */
export async function generateCarouselContent(opts: {
  apiKey?: string;
  pillar: PillarKey;
}): Promise<{
  title: string;
  subtitle: string;
  points: { heading: string; body: string }[];
}> {
  const client = getOpenAIClient(opts.apiKey);

  const topicByPillar: Record<PillarKey, string> = {
    craft:
      "Worauf man bei einer guten Schützenuniform achten sollte (Qualitätsmerkmale: Stoff, Naht, Passform, Langlebigkeit)",
    proof:
      "Wie ein Schützenverein von Hersfelder komplett neu eingekleidet wurde — Ablauf und stolzes Ergebnis",
    service:
      "So läuft eine Vereins-Ausstattung bei Hersfelder — Schritt für Schritt (Beratung, Größenberatung mit Musterset aus dem Standardsortiment, Bestellung, Lieferung — KEINE Maßanfertigung)",
    community:
      "Dinge, die ein richtig gutes Schützenfest ausmachen — warmherzig und gemeinschaftlich",
  };

  const prompt = `${MASTER_BRIEFING}

Du bist Social-Media-Stratege für Hersfelder Schützenbekleidung (schuetzen-ausstatter.de).
Erstelle den Inhalt für ein Instagram-KARUSSELL (Lehr-/Story-Format, mehrere Slides).

Thema: ${topicByPillar[opts.pillar]}

Regeln:
- Deutsch, warmherzig, bodenständig — kein Werbe-Geschwätz, keine Superlative-Schleuder
- Kein Rassismus, keine Waffen, keine politischen/nationalistischen Parolen
- 3 bis 4 Punkte, jeder Punkt knackig
- Cover-Titel max. 40 Zeichen, packend
- Punkt-Überschrift max. 38 Zeichen, Punkt-Text max. 95 Zeichen

Antworte NUR als JSON:
{
  "title": "Cover-Headline",
  "subtitle": "kurze Cover-Unterzeile (max 55 Zeichen)",
  "points": [ { "heading": "Punkt-Überschrift", "body": "1 kurzer Satz" } ]
}`;

  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Antworte ausschließlich mit validem JSON ohne Markdown." },
      { role: "user", content: prompt },
    ],
    temperature: 0.85,
    max_tokens: 500,
    response_format: { type: "json_object" },
  });
  await recordAiUsage({ operation: "carousel", model: "gpt-4o-mini", usage: res.usage });

  const raw = res.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as {
    title?: string;
    subtitle?: string;
    points?: { heading?: string; body?: string }[];
  };
  const points = (parsed.points ?? [])
    .filter((p) => p.heading)
    .slice(0, 4)
    .map((p) => ({ heading: String(p.heading), body: String(p.body ?? "") }));

  return {
    title: parsed.title ?? "Hersfelder",
    subtitle: parsed.subtitle ?? "",
    points: points.length ? points : [{ heading: "Mehr erfahren", body: "" }],
  };
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
  await recordAiUsage({
    operation: "image",
    model: "gpt-image-1",
    usage: (res as { usage?: unknown }).usage,
    imageCount: 1,
  });
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
    max_tokens: 900,
  });
  await recordAiUsage({ operation: "caption", model: "gpt-4o-mini", usage: res.usage });
  return res.choices?.[0]?.message?.content?.trim() ?? "";
}

export type PostReview = {
  score: number; // 0–10 Gesamtnote
  captionOk: boolean;
  imageOk: boolean;
  issues: string[]; // verständliche Mängel (deutsch)
  /** false = Prüfung ist technisch fehlgeschlagen → quality_status "not_checked". */
  checked: boolean;
};

/**
 * Qualitäts-TÜV: eine zweite KI prüft Bild (Vision) UND Text gegen eine
 * Marken-/Sicherheits-Checkliste und gibt eine Note + Mängelliste zurück.
 *
 * WICHTIG (Review): Schlägt der Aufruf technisch fehl, wird der Post NICHT
 * mehr stillschweigend mit Score 7 als "ok" behandelt — `checked: false`
 * signalisiert der aufrufenden Stelle "not_checked", damit ungeprüfte Posts
 * sichtbar markiert und nicht blind freigegeben werden.
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
- Uniformen realistisch wie aus dem Standardsortiment? VERBOTEN: Fantasieuniformen, historische/militärische Uniformen, Goldlitzen, übertriebene Epauletten, überladene Verzierungen, Fantasieknöpfe.
- Gute Bildqualität, klares Motiv, keine entstellten Gesichter/Hände?

TEXT (Caption):
- Markenstimmung: warmherzig, authentisch, gemeinschaftlich?
- KLINGT NICHT wie nationalistische/rechtsextreme Parole (verboten: "In Einheit stark", "Für Heimat und Volk", militärische Slogans)?
- KEINE verbotenen Marken-Claims: "maßgeschneidert", "handgeschneidert", "Maßkonfektion", "Einzelanfertigung", "Schneiderhandwerk", "exklusiv gefertigt", "Couture" (Hersfelder ist Standardsortiment-Marke, KEINE Maßschneiderei) — und keine unbelegten Technik-Claims ("atmungsaktiv", "klimaregulierend", "Funktionsstoff")?
- WICHTIG — diese sind ERLAUBT und KEIN Verstoß: Produktnamen aus dem Sortiment (Jacke, Weste, Hose, FRACK/Fräcke, Polo, Hoodie, Softshelljacke), "leichte Stoffqualität", "angenehmer Tragekomfort", Größen 23–70, "faire Vereinspreise". Diese NIEMALS als verbotenen Claim werten.
- KEIN Bezug zum Schießen/Zielen/Waffen im Text ("Schuss", "Treffer", "schießen", "zielen", "Gewehr")?
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
    await recordAiUsage({ operation: "review", model: "gpt-4o-mini", usage: res.usage });

    const raw = res.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<PostReview>;
    return {
      score: typeof parsed.score === "number" ? Math.round(parsed.score) : 7,
      captionOk: parsed.captionOk !== false,
      imageOk: parsed.imageOk !== false,
      issues: Array.isArray(parsed.issues) ? parsed.issues.slice(0, 6) : [],
      checked: true,
    };
  } catch {
    // Technischer Prüf-Fehler → NICHT als bestanden tarnen (not_checked).
    return { score: 0, captionOk: true, imageOk: true, issues: ["Qualitätsprüfung technisch fehlgeschlagen"], checked: false };
  }
}
