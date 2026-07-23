import type { IconKey } from "./brand-icons";
import type { FeatureTile, PostTemplateKey } from "./render-post";

/**
 * Kreativ-System (Juli 2026): Zwei Säulen, 20 benannte Konzept-Formate.
 *
 * Jedes Format ist eine ERPROBTE Idee-Formel (nach den vier Vorbild-Posts des
 * echten Accounts) — die Konzept-KI bekommt Formel + Beispiel-Headlines als
 * Qualitätsanker und erfindet daraus einen FRISCHEN, konkreten Post.
 * Die Formate rotieren (nie dasselbe Format zweimal in Folge, Saison-Fenster
 * werden bevorzugt), damit der Feed nie statisch wirkt.
 */

export type Lane = "emotional" | "product";

export type ConceptFormat = {
  code: string; // E1–E10 / P1–P10
  lane: Lane;
  name: string;
  template: PostTemplateKey;
  /** Idee-Formel + Ton für die Konzept-KI (deutsch) */
  brief: string;
  /** Qualitätsanker — so gut müssen Headlines sein */
  exampleHeadlines: string[];
  /** Foto-Regie (deutsch) — wird in die englische Foto-Idee übersetzt */
  photoDirection: string;
  /** Bevorzugte Monate (1–12); leer = ganzjährig */
  months?: number[];
  /** Produkt: Default-Benefit-Trio für die Icon-Leiste */
  benefits?: FeatureTile[];
  /** Produkt: Default-CTA (undefined = Soft-Post ohne Button) */
  cta?: string;
  footerIcons?: IconKey[];
};

// ---------------------------------------------------------------------------
// Säule EMOTIONAL
// ---------------------------------------------------------------------------

const EMOTIONAL: ConceptFormat[] = [
  {
    code: "E1",
    lane: "emotional",
    name: "Rückenbild",
    template: "emotional-minimal",
    brief:
      "Menschen von hinten, eingehakt oder Schulter an Schulter, Blick auf das, was sie verbindet — der Betrachter stellt sich dazu. Zeile 1 (Serife): konkretes Jetzt. Zeile 2 (Schreibschrift): das Gefühl dahinter. Beide Zeilen KURZ.",
    exampleHeadlines: ["Eingehakt. / Mehr Plan braucht der Abend nicht.", "Gemeinsam heute. / Tradition für morgen."],
    photoDirection:
      "Rückansicht von 2–4 Personen in dunkelgrünen Westen/Jacken, eingehakt, Blick auf Festplatz mit Wimpeln und Kirchturm, goldene Stunde, oberes Bilddrittel heller Himmel mit viel Freiraum.",
  },
  {
    code: "E2",
    lane: "emotional",
    name: "Zwei Uniformen, ein Verein",
    template: "emotional-statement",
    brief:
      "Generationen: Der Altersabstand zwischen zwei Vereinsmitgliedern wird zur Zahl — und die Zahl zur Pointe. Statement mit konkreter Zeitspanne.",
    exampleHeadlines: [
      "Zwischen diesen beiden Westen liegen 52 Jahre. Und kein einziger Zweifel.",
      "Er stand 1974 zum ersten Mal hier. Sie heute.",
    ],
    photoDirection:
      "Älterer Mann und junge Frau in Uniform von hinten oder im Anschnitt (Hände, Schultern), vor Vereinsheim oder am Festzaun, warmes Seitenlicht, ruhige Bildsprache; rechte untere Bildecke ruhig und dunkel für das Textfeld.",
  },
  {
    code: "E3",
    lane: "emotional",
    name: "Der Moment danach",
    template: "emotional-statement",
    brief:
      "Nicht der Umzug ist das Bild, sondern die Sekunde danach — Jacke offen, Beine schwer, Herz voll. Anstrengung vorbei, Gefühl bleibt.",
    exampleHeadlines: [
      "Jacke auf. Herz noch im Takt der Kapelle.",
      "Sechs Kilometer marschiert. Und keinen Meter davon vergessen.",
    ],
    photoDirection:
      "Gruppe von hinten/seitlich auf einer Bierbank, offene Uniformjacken, Abendlicht, fast leerer Festplatz im Hintergrund; untere rechte Bildzone ruhig für das Textfeld.",
    months: [5, 6, 7, 8, 9],
  },
  {
    code: "E4",
    lane: "emotional",
    name: "Elf Monate Vorfreude",
    template: "emotional-statement",
    brief:
      "Sehnsucht außerhalb der Saison — der Verein zählt schon wieder rückwärts. Absurd konkreter Countdown oder Vorfreude-Gedanke mit Augenzwinkern.",
    exampleHeadlines: ["Noch 312-mal schlafen. Aber wer zählt schon.", "Vorfreude kennt keine Nebensaison."],
    photoDirection:
      "Einzelne Person in dunkelgrünem Sakko vor leerem oder winterlichem Festplatz oder Riesenrad, goldene oder blaue Stunde, viel ruhiger Negativraum unten rechts.",
    months: [10, 11, 12, 1, 2],
  },
  {
    code: "E5",
    lane: "emotional",
    name: "Kleine Rituale",
    template: "emotional-minimal",
    brief:
      "Jeder Verein hat ein Mikro-Ritual — genau das eine Detail wird zum Post. Zeile 1: das Ritual, knapp. Zeile 2 (Schreibschrift): die Bedeutung.",
    exampleHeadlines: ["Erst die Weste, dann der Hut. / Seit 30 Jahren genau so.", "Derselbe Platz im Zelt. / Jedes Jahr."],
    photoDirection:
      "Detailaufnahme: Hände schließen Westenknöpfe, Hut auf Holztisch oder aufgereihte Jacken an der Garderobe — anonym, nah, warmes Licht, oberes Bilddrittel ruhig.",
  },
  {
    code: "E6",
    lane: "emotional",
    name: "Die Unsichtbaren",
    template: "emotional-statement",
    brief:
      "Applaus für die, die nie auf der Bühne stehen — Aufbau-Trupp, Kassenwart, Jugendwartin. Unsichtbare Leistung sichtbar machen, Dank ohne Pathos.",
    exampleHeadlines: [
      "Das Festzelt baut sich nicht von allein auf. Nur fast — wenn um sechs Uhr zwanzig Leute da sind.",
      "Applaus für alle, die nie auf der Bühne stehen.",
    ],
    photoDirection:
      "Morgenszene Festzelt-Aufbau, Kaffeebecher, Arbeitshandschuhe neben Uniformjacke, Personen anonym oder von hinten, Reportage-Stil; ruhige dunkle Zone unten rechts.",
  },
  {
    code: "E7",
    lane: "emotional",
    name: "Ein Jahr im Mittelpunkt",
    template: "emotional-minimal",
    brief:
      "Königswürde menschlich erzählt — ein Jahr im Rampenlicht, und trotzdem eine(r) von uns. Würde und Bodenständigkeit im Kontrast.",
    exampleHeadlines: ["Königin für ein Jahr. / Vereinsmitglied für immer.", "365 Tage vorne. / Und beim Aufbau wieder mittendrin."],
    photoDirection:
      "Königspaar von hinten Richtung Festzelt gehend, Kette nur angedeutet, Spalier unscharf, würdevoll und warm, realistische Standardsortiment-Uniformen; oberes Drittel heller Himmel.",
    months: [5, 6, 7, 8],
  },
  {
    code: "E8",
    lane: "emotional",
    name: "Das erste Mal",
    template: "emotional-statement",
    brief:
      "Der erste Umzug, das erste Fest, die erste eigene Uniform — Neuanfang als stärkste Emotion des Vereinsjahres. Erstes Mal + Detail + Gefühlsumschwung.",
    exampleHeadlines: [
      "Beim ersten Umzug zählt man die Schritte. Beim zweiten die Freunde.",
      "Die erste eigene Uniform hängt nie einfach nur im Schrank.",
    ],
    photoDirection:
      "Junge Person von hinten am Rand einer angetretenen Gruppe oder vor dem Spiegel, sichtbar frische Uniform, Morgensonne; ruhige Zone unten rechts.",
    months: [3, 4, 5, 6],
  },
  {
    code: "E9",
    lane: "emotional",
    name: "Wenn das Dorf still wird",
    template: "emotional-minimal",
    brief:
      "Der Tag nach dem Fest — Abbau, Stille, und trotzdem hallt alles nach. Aufräum-Detail + was bleibt. Melancholisch-warm, nie traurig.",
    exampleHeadlines: ["Die Wimpel sind ab. / Die Geschichten hängen noch.", "Montagmorgen. / Und trotzdem voll."],
    photoDirection:
      "Fast leerer Festplatz mit letzten Wimpeln, eine einzelne Person in Uniformjacke von hinten, Morgennebel oder weiches Licht, oberes Drittel heller Himmel.",
    months: [6, 7, 8, 9],
  },
  {
    code: "E10",
    lane: "emotional",
    name: "Der Klang von Zuhause",
    template: "emotional-statement",
    brief:
      "Ein Sinneseindruck (Blasmusik von weitem, Marschtrommel, Festzelt-Geruch) löst sofort Vereinsgefühl aus. Sinneseindruck + was er auslöst.",
    exampleHeadlines: [
      "Wenn die Kapelle drei Straßen weiter probt — und du automatisch im Takt gehst.",
      "Manche hören Blasmusik. Wir hören: Bald ist es wieder so weit.",
    ],
    photoDirection:
      "Marschkapelle unscharf im Hintergrund, Zuhörer von hinten im Vordergrund; oder offenes Fenster mit Abendlicht und Uniformjacke über Stuhllehne; ruhige dunkle Zone unten rechts.",
    months: [3, 4, 5],
  },
];

// ---------------------------------------------------------------------------
// Säule PRODUKT
// ---------------------------------------------------------------------------

const PRODUCT: ConceptFormat[] = [
  {
    code: "P1",
    lane: "product",
    name: "Die Damenweste",
    template: "product-feature",
    brief:
      "Damenweste für Schützinnen und Damenkompanien. Headline-Formel: Die [Produkt] für alle, die [Haltung/Situation]. Selbstbewusst, nie anbiedernd.",
    exampleHeadlines: [
      "Die Damenweste für alle, die Tradition modern leben.",
      "Für Schützinnen, die nicht die ‚Damenversion' wollen — sondern die richtige.",
    ],
    photoDirection:
      "2–3 lachende Frauen in weißen Blusen und dunkelgrünen Westen beim Fest, halbnah, Tageslicht, Motiv rechts im Bild, linke Bildhälfte ruhiger unscharfer Hintergrund.",
    benefits: [
      { icon: "shirt", title: "Moderner Schnitt", text: "zeitlos, elegant, bequem" },
      { icon: "ruler", title: "Perfekter Sitz", text: "Optimal angepasst für einen starken Auftritt" },
      { icon: "handshake", title: "Faire Vereinspreise", text: "Top Qualität zu attraktiven Konditionen" },
    ],
    cta: "Muster für eure Damenkompanie anfragen",
  },
  {
    code: "P2",
    lane: "product",
    name: "Leicht durch den Festsommer",
    template: "product-reactive",
    brief:
      "Sakko/Jacke in leichter Stoffqualität bei Hitze. Formel: Wenn [Wetter-Realität], [gelassene Produkt-Antwort]. NIEMALS Technik-Claims (atmungsaktiv etc.) — nur 'leicht' und 'angenehmer Tragekomfort'.",
    exampleHeadlines: ["Wenn andere ins Schwitzen kommen.", "30 Grad im Schatten. Der Umzug geht trotzdem."],
    photoDirection:
      "Helles Uniform-Sakko mit dunkelgrünem Kragen auf Schneiderbüste im Freien, dahinter unscharf Kirchturm und marschierende Schützen, Sonnenlicht; Büste rechts der Mitte, linke Bildhälfte ruhiges Bokeh.",
    months: [5, 6, 7, 8],
    cta: "Jetzt Musterkollektion anfragen",
    footerIcons: ["shield-check", "sun", "users"],
  },
  {
    code: "P3",
    lane: "product",
    name: "Von 23 bis 70",
    template: "product-feature",
    brief:
      "Größenvielfalt als stärkster USP: Größe 23 bis 70, alle zum gleichen Preis. Die Headline ist EIN klarer, grammatisch einwandfreier deutscher Satz (ggf. in 2-3 kurze Sätze aufgeteilt). Bewährte Struktur: erst die Spanne, dann der eine Preis. Bau die Zeilen an natürlichen Wortgrenzen um, NIE Wörter kürzen (kein 'Schütz' statt 'Schützen', kein 'Veterane' statt 'Veteranen'). Achte auf korrekte Fälle.",
    exampleHeadlines: [
      "Vom Jungschützen bis zum Ehrenvorstand. Ein Preis für alle.",
      "Größe 23 bis 70. Ein Verein, ein Auftritt, ein Preis.",
    ],
    photoDirection:
      "Angetretene Reihe quer durchs Bild mit sichtbar verschiedenen Staturen und Generationen, alle identisch uniformiert, von hinten oder halbnah, Tageslicht; Motiv rechts, links ruhig.",
    benefits: [
      { icon: "ruler", title: "Größen 23–70", text: "Für jedes Mitglied die richtige Größe" },
      { icon: "euro", title: "Ein Preis", text: "Kein Größenaufschlag — fair für alle" },
      { icon: "users", title: "Ein Auftritt", text: "Die ganze Kompanie in einem Bild" },
    ],
    cta: "Größenberatung für euren Verein anfragen",
  },
  {
    code: "P4",
    lane: "product",
    name: "Die neue Kompanie",
    template: "product-feature",
    brief:
      "Komplette Vereins-/Kompanie-Neuausstattung. Formel: [erster Auftritt in Neu] + [kollektiver Stolz]. Projektgeschäft, würdevoll erzählt.",
    exampleHeadlines: [
      "Erster Auftritt in neuer Uniform — und der ganze Ort schaut zweimal hin.",
      "Eine Kompanie, ein Bild: neu eingekleidet zum Jubiläum.",
    ],
    photoDirection:
      "Stolze Gruppe von 4–6 Personen in frischen Uniformen vor Vereinsheim, Tageslicht, würdevoll-warm; Gruppe rechts im Bild, linke Bildhälfte ruhig.",
    benefits: [
      { icon: "users", title: "Ein Auftritt", text: "Einheitlich vom ersten Tag an" },
      { icon: "badge-check", title: "Konstante Qualität", text: "Eigene Produktion, bewährte Stoffe" },
      { icon: "calendar-check", title: "Planbar", text: "Verlässliche Ausstattung zum Termin" },
    ],
    cta: "Ausstattung für euren Verein anfragen",
  },
  {
    code: "P5",
    lane: "product",
    name: "Nachkaufgarantie",
    template: "product-reactive",
    brief:
      "Dauerhafte Verfügbarkeit + festes Design — niemand fällt aus der Reihe. Formel: [Situation Neuzugang/Ersatz] + [sofort lieferbar, gleiches Design].",
    exampleHeadlines: [
      "Neues Mitglied im Mai? Die passende Uniform ist schon im Regal.",
      "Dieselbe Jacke wie vor fünf Jahren. Genau das ist der Punkt.",
    ],
    photoDirection:
      "Eine einzelne neue Uniformjacke wird zwischen getragene an die Vereins-Garderobe gehängt, fügt sich nahtlos ein, warmes Licht; Motiv rechts der Mitte, links ruhiges Bokeh.",
    cta: "Nachbestellung unkompliziert anfragen",
    footerIcons: ["repeat", "shield-check", "users"],
  },
  {
    code: "P6",
    lane: "product",
    name: "Jungschützen startklar",
    template: "product-feature",
    brief:
      "Polos, Shirts, Hoodies, Softshell mit Vereinslogo (Stick/Druck) — der niedrigschwellige Einstieg. Formel: Vereinszugehörigkeit beginnt vor der Uniform.",
    exampleHeadlines: [
      "Vereinsstolz fängt nicht erst beim Frack an.",
      "Euer Wappen jetzt auch fürs Training.",
    ],
    photoDirection:
      "Jugendgruppe von hinten in dunkelgrünen Hoodies, Sportplatz oder Vereinsheim, lockere Stimmung, Tageslicht; Gruppe rechts, links ruhig.",
    months: [8, 9, 10],
    benefits: [
      { icon: "sparkles", title: "Euer Logo", text: "Per Stick oder Druck aufs Textil" },
      { icon: "euro", title: "Faire Preise", text: "Vereinskonditionen für den Nachwuchs" },
      { icon: "package", title: "Unkompliziert", text: "Einfach anfragen, schnell geliefert" },
    ],
    cta: "Jugend-Ausstattung anfragen",
  },
  {
    code: "P7",
    lane: "product",
    name: "Das Detail entscheidet",
    template: "product-reactive",
    brief:
      "Verarbeitung: Naht, Knopf, Kragen — ein Detail groß machen + warum es Jahre hält. Stiller Qualitätsbeweis, KEIN CTA-Button, nur URL. Keine Schneiderei-Romantik.",
    exampleHeadlines: [
      "Ein Knopf ist nur ein Knopf — bis er beim hundertsten Fest noch sitzt.",
      "Diese Naht soll ein Vereinsleben halten.",
    ],
    photoDirection:
      "Makroaufnahme von Wollstoff, Naht oder Knopf einer dunkelgrünen Uniformjacke, gerichtetes warmes Licht, edel und ruhig; Detail rechts der Mitte, links ruhiges Bokeh.",
    months: [10, 11, 1, 2],
    footerIcons: ["gem", "badge-check", "repeat"],
  },
  {
    code: "P8",
    lane: "product",
    name: "Euer Wappen, unser Stick",
    template: "product-feature",
    brief:
      "Individualisierung im erlaubten Rahmen: Vereinslogo/-name auf Polos, Shirts, Hoodies, Softshell. Formel: [generisches Produkt] wird erst mit [euer Wappen] zum [Vereinsstück].",
    exampleHeadlines: [
      "Ein Poloshirt ist ein Poloshirt. Bis euer Wappen drauf ist.",
      "Euer Name auf der Brust — unser Stick macht's offiziell.",
    ],
    photoDirection:
      "Nahaufnahme einer Stickerei auf dunkelgrüner Softshelljacke (generisches Vereinswappen-Motiv, KEIN echtes Logo), daneben getragene Variante unscharf; Motiv rechts, links ruhig.",
    months: [10, 11, 12],
    benefits: [
      { icon: "sparkles", title: "Stick oder Druck", text: "Euer Logo, sauber umgesetzt" },
      { icon: "shirt", title: "Bewährtes Sortiment", text: "Polos, Shirts, Hoodies, Softshell" },
      { icon: "handshake", title: "Faire Vereinspreise", text: "Konditionen für Vereine" },
    ],
    cta: "Logo-Ausstattung anfragen",
  },
  {
    code: "P9",
    lane: "product",
    name: "Für die großen Tage",
    template: "product-reactive",
    brief:
      "Schützenfest-Frack für festliche Anlässe. Formel: [Anlass mit Fallhöhe] verdient [das feierlichste Stück]. Schlicht-elegant, keinerlei Fantasie-Verzierung. WICHTIG: Die Headline muss ein vollständiger, klarer Satz sein (kein Fragment). Das Wort 'Frack' darf im Text vorkommen — es ist ein reguläres Produkt.",
    exampleHeadlines: [
      "Für die Tage, an denen der ganze Ort zuschaut.",
      "Manche Termine verdienen mehr als eine Jacke.",
    ],
    photoDirection:
      "Ein eleganter dunkelgrüner Schützenfrack (Fräckchen mit langen Schößen) hängt oder steht auf einer Schneiderbüste, sauber ausgeleuchtet; dahinter stark unscharf ein festlich erleuchteter Vereinssaal mit warmen Lichtpunkten. KEINE Person, nur das Kleidungsstück. Büste rechts der Mitte, linke Bildhälfte ruhiges dunkles Bokeh.",
    months: [10, 11, 12, 1],
    cta: "Frack-Muster anfragen",
    footerIcons: ["gem", "calendar-check", "users"],
  },
  {
    code: "P10",
    lane: "product",
    name: "Eine Kiste, alle Antworten",
    template: "product-reactive",
    brief:
      "Musterkollektion + persönliche Beratung — Einstieg ins Projektgeschäft. Formel: [Anfassen vor Entscheiden] + [Vorstand als Held]. Härtester CTA im System.",
    exampleHeadlines: [
      "Erst anfassen, dann entscheiden: die Musterkollektion für euren Vorstand.",
      "Die wichtigste Vorstandssitzung des Jahres passt in eine Kiste.",
    ],
    photoDirection:
      "Geöffnetes Musterpaket mit ordentlich gefalteten dunkelgrünen Uniformteilen auf Holztisch im Vereinsheim, Größenetiketten sichtbar, warmes Licht, KEIN Maßband; Kiste rechts der Mitte, links ruhig.",
    months: [10, 11, 12, 1, 2],
    cta: "Jetzt Musterkollektion anfragen",
    footerIcons: ["package-open", "handshake", "users"],
  },
];

export const CONCEPT_FORMATS: ConceptFormat[] = [...EMOTIONAL, ...PRODUCT];

export function conceptByCode(code: string): ConceptFormat | undefined {
  return CONCEPT_FORMATS.find((f) => f.code === code);
}

// ---------------------------------------------------------------------------
// Anti-Generik: verbotene Floskeln (Headlines + Captions)
// ---------------------------------------------------------------------------

export const BANNED_PHRASES: string[] = [
  "Tradition trifft Moderne",
  "Gemeinsam feiern",
  "Gemeinsam stark",
  "Zusammen sind wir stark",
  "Tradition verbindet",
  // semantische Varianten von „Tradition verbindet" — der Filter erkennt sonst nur den exakten Wortlaut
  "verbindet Tradition",
  "verbindet uns Tradition",
  "Tradition, die verbindet",
  "Ihr verbindet Tradition",
  "Wir verbinden Tradition",
  "Vereinsleben ist ein Fest",
  "Stolz auf unseren Verein",
  "Ein unvergesslicher Moment",
  "Ein unvergesslicher Tag",
  "Was für ein Fest",
  "Einfach nur schön",
  "Mehr als nur ein Verein",
  "Mehr als nur Kleidung",
  "Qualität, die überzeugt",
  "Qualität, die man sieht",
  "für den perfekten Auftritt",
];

// ---------------------------------------------------------------------------
// Format-Auswahl mit Rotation + Saison
// ---------------------------------------------------------------------------

/**
 * Wählt ein Konzept-Format: Lane vorgeben, kürzlich genutzte Codes meiden,
 * Saison-Fenster bevorzugen. Fällt weich zurück, wenn alles ausgeschlossen wäre.
 */
/** Gewichtete Zufallswahl aus einer Liste (Gewicht ≥ 0). */
function weightedPick<T>(items: T[], weightOf: (t: T) => number, rnd: () => number): T {
  const weights = items.map((it) => Math.max(0, weightOf(it)));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[Math.floor(rnd() * items.length)];
  let r = rnd() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function pickConceptFormat(opts: {
  lane: Lane;
  avoidCodes?: string[];
  month?: number; // 1–12 (Berlin)
  /** Gelernte Performance-Faktoren je Format-Code (>1 = läuft gut). */
  formatMult?: Record<string, number> | null;
  random?: () => number;
}): ConceptFormat {
  const rnd = opts.random ?? Math.random;
  const avoid = new Set(opts.avoidCodes ?? []);
  const pool = CONCEPT_FORMATS.filter((f) => f.lane === opts.lane);

  let candidates = pool.filter((f) => !avoid.has(f.code));
  if (candidates.length === 0) candidates = pool;

  if (opts.month) {
    const inSeason = candidates.filter((f) => !f.months || f.months.includes(opts.month!));
    if (inSeason.length > 0) candidates = inSeason;
  }

  // Gewichte nach gelernter Performance (Faktor bereits gedeckelt 0,5–2,0);
  // unbekannte Formate = 1,0. Explorations-Untergrenze 0,4, damit nie ganz raus.
  const mult = opts.formatMult ?? null;
  return (
    weightedPick(candidates, (f) => Math.max(0.4, mult?.[f.code] ?? 1), rnd) ?? pool[0]
  );
}

/**
 * Lane-Wahl für den Cron: Basis-Mix 60 % emotional / 40 % Produkt, aber NIE
 * zwei Produkt-Posts direkt hintereinander (Katalog-Effekt vermeiden). Läuft
 * eine Lane messbar besser, verschiebt sich der Anteil — gedeckelt auf
 * 25–50 % Produkt, damit emotional die Basis bleibt und Vielfalt erhalten wird.
 */
export function pickLane(opts: {
  previousLane?: Lane | null;
  /** Gelernte Performance-Faktoren je Lane ("emotional"/"product"). */
  laneMult?: Record<string, number> | null;
  random?: () => number;
}): Lane {
  const rnd = opts.random ?? Math.random;
  if (opts.previousLane === "product") return "emotional";

  let pProduct = 0.4;
  const m = opts.laneMult;
  if (m && m.emotional > 0 && m.product > 0) {
    const avg = (m.emotional + m.product) / 2;
    pProduct = Math.max(0.25, Math.min(0.5, 0.4 * (m.product / avg)));
  }
  return rnd() < pProduct ? "product" : "emotional";
}
