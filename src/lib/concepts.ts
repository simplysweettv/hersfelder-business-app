import type { IconKey } from "./brand-icons";
import type { FeatureTile, FooterNote, PosterLayoutKey } from "./render-poster";

/**
 * Kreativ-System (Juli 2026, v3): Zwei Säulen, 32 benannte Konzept-Formate.
 *
 * Jedes Format ist eine ERPROBTE Idee-Formel — die Konzept-KI bekommt Formel +
 * Beispiel-Headlines als Qualitätsanker und erfindet daraus einen FRISCHEN,
 * konkreten Post. Die Formate rotieren (nie dasselbe zweimal in Folge,
 * Saison-Fenster werden bevorzugt), damit der Feed nie statisch wirkt.
 *
 * v3 deckt bewusst die VOLLE Zielgruppe des Marken-Briefings ab — nicht nur
 * Schützenvereine, sondern auch Spielmannszüge, Musikzüge, Bruderschaften und
 * Traditionsvereine; nicht nur Mitglieder, sondern auch die Menschen, die
 * beschaffen (Vorstand, Uniformwart, Einkauf). Und sie erzählt endlich die
 * stärkste Sachgeschichte der Marke: Hersfelder produziert selbst, deshalb
 * ist alles dauerhaft verfügbar und nachbestellbar.
 */

export type Lane = "emotional" | "product";

export type ConceptFormat = {
  code: string; // E… / P…
  lane: Lane;
  name: string;
  /** Plakat-Layouts, die zu dieser Idee passen (Rotation wählt daraus) */
  layouts: PosterLayoutKey[];
  /** Idee-Formel + Ton für die Konzept-KI (deutsch) */
  brief: string;
  /** Qualitätsanker — so gut müssen Headlines sein */
  exampleHeadlines: string[];
  /** Foto-Regie (deutsch) — Grundlage der englischen Foto-Idee */
  photoDirection: string;
  /** Bevorzugte Monate (1–12); leer = ganzjährig */
  months?: number[];
  /**
   * Darf dieses Format einen aktuellen WETTER-Aufhänger aufgreifen?
   * Standard: nein. Ohne diese Bremse landete „Bei 35 Grad" auch auf Posts
   * über Spielmannszug-Ausstattung — thematisch daneben und gefährlich nah
   * an den verbotenen Klima-Claims.
   */
  weatherReactive?: boolean;
  /** Produkt: Benefit-Trio für die grüne Leiste (Layout „panel-links") */
  benefits?: FeatureTile[];
  /** Produkt: CTA-Feld (Layout „panel-cta") */
  cta?: { title: string; sub?: string };
  /** Produkt: Mikro-Beweise in der hellen Fußleiste (Layout „panel-cta") */
  footerNotes?: FooterNote[];
  /** Optionales Akzent-Icon über der Headline */
  accentIcon?: IconKey;
};

/** Benefit-Trios, die in mehreren Formaten wiederkehren (Marken-Konstanten). */
// Größen-Kacheln: NIE die durchgehende Spanne „23–70" behaupten — Normal- und
// Kurzgrößen sind zwei getrennte Systeme (siehe src/lib/sizes.ts).
const B_GROESSEN: FeatureTile = {
  icon: "ruler",
  title: "Normal- & Kurzgrößen",
  text: "Für jede Statur die passende Größe",
};
/** Nur dort einsetzen, wo es wirklich um Herren-Oberteile geht. */
const B_GROESSEN_HERREN: FeatureTile = {
  icon: "ruler",
  title: "46–70 plus Kurzgrößen",
  text: "Kurzgrößen 23–34 für kräftigere Staturen",
};
/** Nur für Damenwesten — die haben ihre eigene, durchgehende Größenreihe. */
const B_GROESSEN_DAMEN: FeatureTile = {
  icon: "ruler",
  title: "Damengrößen 30–60",
  text: "Für jede Statur die passende Weste",
};
const B_EIN_PREIS: FeatureTile = { icon: "euro", title: "Ein Preis", text: "Kein Größenaufschlag — fair für alle" };
const B_NACHKAUF: FeatureTile = { icon: "repeat", title: "Nachkaufgarantie", text: "Festes Design, jederzeit nachbestellbar" };
const B_EIGENE_PROD: FeatureTile = { icon: "badge-check", title: "Eigene Fertigung", text: "Entwickelt und produziert im Haus" };
const B_VEREINSPREIS: FeatureTile = { icon: "handshake", title: "Faire Vereinspreise", text: "Top Qualität zu attraktiven Konditionen" };
const B_LIEFERBAR: FeatureTile = { icon: "package", title: "Dauerhaft lieferbar", text: "Standardsortiment statt Wartezeit" };
const B_EINHEIT: FeatureTile = { icon: "users", title: "Ein Auftritt", text: "Die ganze Kompanie in einem Bild" };

const F_STANDARD: FooterNote[] = [
  { icon: "shield-check", label: "Konstante Qualität" },
  { icon: "repeat", label: "Jederzeit nachbestellbar" },
];
const F_VEREIN: FooterNote[] = [
  { icon: "users", label: "Für Vereine & Züge" },
  { icon: "ruler", label: "Normal- & Kurzgrößen" },
];

// ---------------------------------------------------------------------------
// Säule EMOTIONAL — Vereinsleben, Menschen, Anlässe
// ---------------------------------------------------------------------------

const EMOTIONAL: ConceptFormat[] = [
  {
    code: "E1",
    lane: "emotional",
    name: "Rückenbild",
    layouts: ["zentral-minimal", "karte-unten"],
    brief:
      "Menschen von hinten, eingehakt oder Schulter an Schulter, Blick auf das, was sie verbindet — der Betrachter stellt sich dazu. Zeile 1 (Serife): konkretes Jetzt. Zeile 2 (Schreibschrift): das Gefühl dahinter. Beide KURZ.",
    exampleHeadlines: ["Eingehakt. / Mehr Plan braucht der Abend nicht.", "Gemeinsam heute. / Tradition für morgen."],
    photoDirection:
      "Rückansicht von 2–4 Personen in dunkelgrünen Westen/Jacken, eingehakt, Blick auf Festplatz mit Wimpeln und Kirchturm, goldene Stunde.",
  },
  {
    code: "E2",
    lane: "emotional",
    name: "Zwei Uniformen, ein Verein",
    layouts: ["karte-unten", "band-unten"],
    brief:
      "Generationen: Der Altersabstand zwischen zwei Vereinsmitgliedern wird zur Zahl — und die Zahl zur Pointe. Konkrete Zeitspanne, kein Pathos.",
    exampleHeadlines: [
      "Zwischen diesen beiden Westen liegen 52 Jahre.",
      "Er stand 1974 zum ersten Mal hier. Sie heute.",
    ],
    photoDirection:
      "Älterer Mann und junge Frau in Uniform von hinten oder im Anschnitt (Hände, Schultern), vor Vereinsheim oder am Festzaun, warmes Seitenlicht, ruhige Bildsprache.",
  },
  {
    code: "E3",
    lane: "emotional",
    name: "Der Moment danach",
    layouts: ["karte-unten", "band-unten"],
    brief:
      "Nicht der Umzug ist das Bild, sondern die Sekunde danach — Jacke offen, Beine schwer, Herz voll. Anstrengung vorbei, Gefühl bleibt.",
    exampleHeadlines: [
      "Jacke auf. Herz noch im Takt der Kapelle.",
      "Sechs Kilometer marschiert. Und keinen Meter davon vergessen.",
    ],
    photoDirection:
      "Gruppe von hinten/seitlich auf einer Bierbank, offene Uniformjacken, Abendlicht, fast leerer Festplatz im Hintergrund.",
    months: [5, 6, 7, 8, 9],
    weatherReactive: true,
  },
  {
    code: "E4",
    lane: "emotional",
    name: "Elf Monate Vorfreude",
    layouts: ["band-unten", "karte-unten"],
    brief:
      "Sehnsucht außerhalb der Saison — der Verein zählt schon wieder rückwärts. Absurd konkreter Countdown oder Vorfreude-Gedanke mit Augenzwinkern.",
    exampleHeadlines: ["Noch 312-mal schlafen. Aber wer zählt schon.", "Vorfreude kennt keine Nebensaison."],
    photoDirection:
      "Einzelne Person in dunkelgrünem Sakko vor leerem oder winterlichem Festplatz oder Riesenrad, goldene oder blaue Stunde.",
    months: [10, 11, 12, 1, 2],
  },
  {
    code: "E5",
    lane: "emotional",
    name: "Kleine Rituale",
    layouts: ["zentral-minimal", "karte-unten"],
    brief:
      "Jeder Verein hat ein Mikro-Ritual — genau das eine Detail wird zum Post. Zeile 1: das Ritual, knapp. Zeile 2 (Schreibschrift): die Bedeutung.",
    exampleHeadlines: ["Erst die Weste, dann der Hut. / Seit 30 Jahren genau so.", "Derselbe Platz im Zelt. / Jedes Jahr."],
    photoDirection:
      "Detailaufnahme: Hände schließen Westenknöpfe, Hut auf Holztisch oder aufgereihte Jacken an der Garderobe — anonym, nah, warmes Licht.",
  },
  {
    code: "E6",
    lane: "emotional",
    name: "Die Unsichtbaren",
    layouts: ["karte-unten", "band-unten"],
    brief:
      "Applaus für die, die nie auf der Bühne stehen — Aufbau-Trupp, Kassenwart, Jugendwartin. Unsichtbare Leistung sichtbar machen, Dank ohne Pathos.",
    exampleHeadlines: [
      "Das Festzelt baut sich nicht von allein auf.",
      "Applaus für alle, die nie auf der Bühne stehen.",
    ],
    photoDirection:
      "Morgenszene Festzelt-Aufbau, Kaffeebecher, Arbeitshandschuhe neben Uniformjacke, Personen anonym oder von hinten, Reportage-Stil.",
  },
  {
    code: "E7",
    lane: "emotional",
    name: "Ein Jahr im Mittelpunkt",
    layouts: ["zentral-minimal", "band-unten"],
    brief:
      "Königswürde menschlich erzählt — ein Jahr im Rampenlicht, und trotzdem eine(r) von uns. Würde und Bodenständigkeit im Kontrast. NIE das Schießen erwähnen, nur das Amt und das Jahr.",
    exampleHeadlines: ["Königin für ein Jahr. / Vereinsmitglied für immer.", "365 Tage vorne. / Und beim Aufbau wieder mittendrin."],
    photoDirection:
      "Königspaar von hinten Richtung Festzelt gehend, Kette nur angedeutet, Spalier unscharf, würdevoll und warm, realistische Standardsortiment-Uniformen.",
    months: [5, 6, 7, 8],
  },
  {
    code: "E8",
    lane: "emotional",
    name: "Das erste Mal",
    layouts: ["karte-unten", "zentral-minimal"],
    brief:
      "Der erste Umzug, das erste Fest, die erste eigene Uniform — Neuanfang als stärkste Emotion des Vereinsjahres. Erstes Mal + Detail + Gefühlsumschwung.",
    exampleHeadlines: [
      "Beim ersten Umzug zählt man die Schritte. Beim zweiten die Freunde.",
      "Die erste eigene Uniform hängt nie einfach nur im Schrank.",
    ],
    photoDirection:
      "Junge Person von hinten am Rand einer angetretenen Gruppe, sichtbar frische Uniform, Morgensonne.",
    months: [3, 4, 5, 6],
  },
  {
    code: "E9",
    lane: "emotional",
    name: "Wenn das Dorf still wird",
    layouts: ["zentral-minimal", "band-unten"],
    brief:
      "Der Tag nach dem Fest — Abbau, Stille, und trotzdem hallt alles nach. Aufräum-Detail + was bleibt. Melancholisch-warm, nie traurig.",
    exampleHeadlines: ["Die Wimpel sind ab. / Die Geschichten hängen noch.", "Montagmorgen. / Und trotzdem voll."],
    photoDirection:
      "Fast leerer Festplatz mit letzten Wimpeln, eine einzelne Person in Uniformjacke von hinten, Morgennebel oder weiches Licht.",
    months: [6, 7, 8, 9],
    weatherReactive: true,
  },
  {
    code: "E10",
    lane: "emotional",
    name: "Der Klang von Zuhause",
    layouts: ["band-unten", "zentral-minimal"],
    brief:
      "Ein Sinneseindruck (Blasmusik von weitem, Marschtrommel, Festzelt-Geruch) löst sofort Vereinsgefühl aus. Sinneseindruck + was er auslöst.",
    exampleHeadlines: [
      "Manche hören Blasmusik. Wir hören: Bald ist es wieder so weit.",
      "Drei Straßen weiter probt die Kapelle. Und du gehst automatisch im Takt.",
    ],
    photoDirection:
      "Marschkapelle unscharf im Hintergrund, Zuhörer von hinten im Vordergrund; oder offenes Fenster mit Abendlicht und Uniformjacke über Stuhllehne.",
    months: [3, 4, 5],
  },
  {
    code: "E11",
    lane: "emotional",
    name: "Der Spielmannszug",
    layouts: ["karte-unten", "band-unten"],
    brief:
      "Spielmannszug/Tambourkorps als eigene Welt: Takt, Gleichschritt, Trommelwirbel. Formel: [musikalisches Detail] + [was der Takt mit der Gruppe macht]. Zielgruppe direkt ansprechen — Spielmannszüge und Musikzüge sind eigenständige Vereine, keine Anhängsel.",
    exampleHeadlines: [
      "Einer gibt den Takt vor. Vierzig halten ihn.",
      "Zwei Takte Vorlauf — und das ganze Dorf dreht sich um.",
    ],
    photoDirection:
      "Spielmannszug in dunkelgrünen Uniformjacken von hinten oder seitlich, Marschtrommeln und Querflöten sichtbar, Gleichschritt auf Dorfstraße, Tageslicht, Reportage-Stil.",
    months: [4, 5, 6, 7, 8, 9],
  },
  {
    code: "E12",
    lane: "emotional",
    name: "Die Fahnenabordnung",
    layouts: ["zentral-minimal", "karte-unten"],
    brief:
      "Wer die Fahne trägt, trägt die Geschichte des Vereins. Formel: [das Gewicht/die Verantwortung] + [wer sie weitergibt]. Würdevoll, nie schwülstig. Die Fahne bleibt im Bild ohne lesbare Schrift oder Symbole.",
    exampleHeadlines: ["Vorneweg. / Seit über hundert Jahren.", "Die Fahne trägt man nicht allein. / Man trägt sie weiter."],
    photoDirection:
      "Fahnenträger in dunkelgrüner Uniform von hinten an der Spitze eines Zuges, Fahnentuch unscharf in Bewegung, KEINE lesbaren Symbole oder Schrift auf der Fahne, Morgenlicht.",
    months: [4, 5, 6, 7, 8, 9],
  },
  {
    code: "E13",
    lane: "emotional",
    name: "Jubiläumsjahr",
    layouts: ["band-unten", "karte-unten"],
    brief:
      "Vereinsjubiläum (25/50/75/100/125 Jahre) als Anlass: Was in dieser Zeit alles blieb — und wer alles kam. Formel: [runde Zahl] + [was sich NICHT verändert hat]. Konkrete Jahreszahl gehört dazu.",
    exampleHeadlines: [
      "100 Jahre. Und immer noch derselbe Weg durchs Dorf.",
      "Drei Generationen, ein Vereinsheim, kein einziges verpasstes Fest.",
    ],
    photoDirection:
      "Vereinsheim oder Schützenhalle im Abendlicht, davor eine kleine Gruppe in Uniform von hinten; oder alte Vereinschronik und Uniformjacke nebeneinander auf Holztisch (KEINE lesbare Schrift).",
  },
  {
    code: "E14",
    lane: "emotional",
    name: "Der Uniformwart",
    layouts: ["karte-unten", "band-unten"],
    brief:
      "Porträt der Rolle, die alles zusammenhält: Kleiderkammer, Größenlisten, ‚wer wächst bis Mai noch raus‘. Formel: [unsichtbare Fleißarbeit] + [warum am Festtag alles passt]. Brücke zwischen Gefühl und Beschaffung — aber KEIN Verkaufstext.",
    exampleHeadlines: [
      "Am Festtag passt alles. Weil im Februar jemand Listen geführt hat.",
      "Der wichtigste Posten im Verein hat keinen eigenen Orden.",
    ],
    photoDirection:
      "Vereins-Kleiderkammer: dunkelgrüne Uniformjacken ordentlich auf einer Stange, eine Person im Anschnitt (Hände, Schulter) sortiert, warmes Licht, KEINE lesbaren Etiketten oder Zahlen.",
    months: [1, 2, 3, 10, 11, 12],
  },
  {
    code: "E15",
    lane: "emotional",
    name: "Ehrenabend",
    layouts: ["karte-unten", "zentral-minimal"],
    brief:
      "Ordensfest, Ehrungen, Jubilare: 40 Jahre dabei, und noch keinen Abend ausgelassen. Formel: [Zahl an Jahren] + [was das über den Menschen sagt]. Warm, respektvoll, mit Augenzwinkern statt Ehrfurcht.",
    exampleHeadlines: [
      "40 Jahre dabei. Und noch keinen Aufbau verpasst.",
      "Für manche ist es ein Verein. Für ihn ein halbes Leben.",
    ],
    photoDirection:
      "Festlich gedeckter Saal im Vereinsheim, warmes Abendlicht, ältere Person in dunkelgrüner Uniformjacke im Profil oder Anschnitt, Applaus unscharf im Hintergrund.",
    months: [10, 11, 12, 1, 2],
  },
  {
    code: "E16",
    lane: "emotional",
    name: "Neu dabei",
    layouts: ["zentral-minimal", "karte-unten"],
    brief:
      "Mitgliedergewinnung aus Vereinssicht: Wie fühlt sich der erste Abend an, an dem man dazugehört? Formel: [Schwelle] + [wie schnell sie verschwindet]. Einladend, nie werbend.",
    exampleHeadlines: [
      "Beim ersten Mal sitzt man am Rand. Beim zweiten hält man Plätze frei.",
      "Dazugehören dauert genau einen Abend.",
    ],
    photoDirection:
      "Lange Bierzeltbank von schräg hinten, eine Person rückt zur Seite und macht Platz, Gruppe in dunkelgrünen Westen, warmes Licht, Reportage-Stil.",
  },
  {
    code: "E17",
    lane: "emotional",
    name: "Bruderschaft",
    layouts: ["band-unten", "karte-unten"],
    brief:
      "Der Bruderschaftsgedanke: Man ist auch dann da, wenn gerade kein Fest ist — Nachbarschaftshilfe, Krankenbesuch, letzte Ehre. Formel: [Alltagssituation ohne Fest] + [dass der Verein trotzdem da ist]. Ernst und warm, nie fromm-belehrend.",
    exampleHeadlines: [
      "Zwischen zwei Festen liegen 51 Wochen. Auch die zählen.",
      "Man erkennt den Verein nicht am Fest. Sondern am Rest des Jahres.",
    ],
    photoDirection:
      "Zwei Personen in dunkelgrünen Uniformjacken von hinten auf einem ruhigen Dorfweg oder vor einer Kirche, gedecktes Tageslicht, zurückhaltende, würdevolle Stimmung, KEINE religiösen Symbole im Fokus.",
  },
];

// ---------------------------------------------------------------------------
// Säule PRODUKT — Sortiment, Verfügbarkeit, Beschaffung
// ---------------------------------------------------------------------------

const PRODUCT: ConceptFormat[] = [
  {
    code: "P1",
    lane: "product",
    name: "Die Damenweste",
    layouts: ["panel-links", "panel-cta"],
    brief:
      "Damenweste für Schützinnen und Damenkompanien. Headline-Formel: Die [Produkt] für alle, die [Haltung/Situation]. Selbstbewusst, nie anbiedernd. Größenangabe hier NUR als Damengrößen 30–60 — nie die Herren-Zahlen mischen.",
    exampleHeadlines: [
      "Die Damenweste für alle, die Tradition modern leben.",
      "Für Schützinnen, die nicht die ‚Damenversion‘ wollen — sondern die richtige.",
    ],
    photoDirection:
      "2–3 lachende Frauen in weißen Blusen und dunkelgrünen Westen beim Fest, halbnah, Tageslicht.",
    benefits: [
      { icon: "shirt", title: "Moderner Schnitt", text: "Zeitlos, elegant, bequem" },
      B_GROESSEN_DAMEN,
      B_VEREINSPREIS,
    ],
    cta: { title: "Muster für eure Damenkompanie anfragen", sub: "Wir schicken euch die Weste zum Anprobieren." },
    footerNotes: F_VEREIN,
  },
  {
    code: "P2",
    lane: "product",
    name: "Leicht durch den Festsommer",
    layouts: ["panel-cta", "panel-links"],
    brief:
      "Sakko/Jacke in leichter Stoffqualität bei Hitze. Formel: Wenn [Wetter-Realität], [gelassene Produkt-Antwort]. NIEMALS Technik-Claims (atmungsaktiv, kühlend, Funktionsstoff) — nur ‚leicht‘ und ‚angenehm zu tragen‘.",
    exampleHeadlines: ["Wenn andere ins Schwitzen kommen.", "30 Grad im Schatten. Der Umzug geht trotzdem."],
    photoDirection:
      "Helles Uniform-Sakko mit dunkelgrünem Kragen auf Schneiderbüste im Freien, dahinter unscharf Kirchturm und marschierende Schützen, Sonnenlicht.",
    months: [5, 6, 7, 8],
    weatherReactive: true,
    accentIcon: "sun",
    benefits: [
      { icon: "shirt", title: "Leichte Qualität", text: "Angenehm an langen Festtagen" },
      B_GROESSEN,
      B_NACHKAUF,
    ],
    cta: { title: "Jetzt Musterkollektion anfragen", sub: "Für euren Verein oder Spielmannszug." },
    footerNotes: F_STANDARD,
  },
  {
    code: "P3",
    lane: "product",
    name: "Normal- und Kurzgrößen",
    layouts: ["panel-links", "panel-cta"],
    brief:
      "Größenvielfalt als stärkster USP: Normalgrößen 46–70 (Hosen 44–70) PLUS Kurzgrößen 23–34 für kräftigere und kleinere Staturen, alle zum gleichen Preis, keine Größenaufschläge. WICHTIG: Das sind zwei getrennte Größensysteme — NIEMALS als durchgehende Spanne ‚23 bis 70‘ schreiben. Auch keine Kindergrößen (die gibt es nicht). Die Headline ist EIN klarer, grammatisch einwandfreier Satz (ggf. in 2–3 kurze Sätze aufgeteilt). Bewährte Struktur: erst die Vielfalt, dann der eine Preis. NIE Wörter kürzen.",
    exampleHeadlines: [
      "Vom Jungschützen bis zum Ehrenvorstand. Ein Preis für alle.",
      "Normalgrößen und Kurzgrößen. Ein Verein, ein Auftritt, ein Preis.",
    ],
    photoDirection:
      "Angetretene Reihe quer durchs Bild mit sichtbar verschiedenen Staturen und Generationen (alle erwachsen), alle identisch uniformiert, von hinten oder halbnah, Tageslicht.",
    benefits: [B_GROESSEN_HERREN, B_EIN_PREIS, B_EINHEIT],
    cta: { title: "Größenberatung für euren Verein anfragen", sub: "Normalgrößen 46–70 und Kurzgrößen 23–34." },
    footerNotes: F_STANDARD,
  },
  {
    code: "P4",
    lane: "product",
    name: "Die neue Kompanie",
    layouts: ["panel-links", "panel-cta"],
    brief:
      "Komplette Vereins-/Kompanie-Neuausstattung. Formel: [erster Auftritt in Neu] + [kollektiver Stolz]. Projektgeschäft, würdevoll erzählt.",
    exampleHeadlines: [
      "Erster Auftritt in neuer Uniform — und der ganze Ort schaut zweimal hin.",
      "Eine Kompanie, ein Bild: neu eingekleidet zum Jubiläum.",
    ],
    photoDirection:
      "Stolze Gruppe von 4–6 Personen in frischen Uniformen vor Vereinsheim, Tageslicht, würdevoll-warm.",
    benefits: [B_EINHEIT, B_EIGENE_PROD, { icon: "calendar-check", title: "Planbar", text: "Verlässlich fertig zum Festtermin" }],
    cta: { title: "Ausstattung für euren Verein anfragen", sub: "Wir planen den Termin rückwärts vom Fest." },
    footerNotes: F_VEREIN,
  },
  {
    code: "P5",
    lane: "product",
    name: "Nachkaufgarantie",
    layouts: ["panel-cta", "panel-links"],
    brief:
      "Dauerhafte Verfügbarkeit + festes Design — niemand fällt aus der Reihe. Formel: [Situation Neuzugang/Ersatz] + [sofort lieferbar, gleiches Design].",
    exampleHeadlines: [
      "Neues Mitglied im Mai? Die passende Jacke liegt schon bereit.",
      "Dieselbe Jacke wie vor fünf Jahren. Genau das ist der Punkt.",
    ],
    photoDirection:
      "Eine einzelne neue Uniformjacke wird zwischen getragene an die Vereins-Garderobe gehängt, fügt sich nahtlos ein, warmes Licht.",
    accentIcon: "repeat",
    benefits: [B_NACHKAUF, B_LIEFERBAR, B_EIGENE_PROD],
    cta: { title: "Nachbestellung unkompliziert anfragen", sub: "Gleiches Design, gleiche Qualität — auch Jahre später." },
    footerNotes: F_STANDARD,
  },
  {
    code: "P6",
    lane: "product",
    name: "Jungschützen startklar",
    layouts: ["panel-links", "panel-cta"],
    brief:
      "Polos, T-Shirts, Hoodies, Softshelljacken mit Vereinslogo (Stick/Druck) — der niedrigschwellige Einstieg. Formel: Vereinszugehörigkeit beginnt vor der Uniform. HARTE GRENZE: Jungschützen sind JUNGE ERWACHSENE und tragen normale Erwachsenengrößen. NIEMALS Kindergrößen, Kinderuniformen oder Ausstattung ‚für die Kleinsten‘ anbieten oder andeuten — die gibt es nicht.",
    exampleHeadlines: ["Vereinsstolz fängt nicht erst beim Frack an.", "Euer Wappen jetzt auch fürs Training."],
    photoDirection:
      "Gruppe junger Erwachsener von hinten in dunkelgrünen Hoodies, Sportplatz oder Vereinsheim, lockere Stimmung, Tageslicht. KEINE Kinder.",
    months: [8, 9, 10],
    benefits: [
      { icon: "sparkles", title: "Euer Logo", text: "Per Stick oder Druck aufs Textil" },
      B_VEREINSPREIS,
      { icon: "package", title: "Unkompliziert", text: "Einfach anfragen, schnell geliefert" },
    ],
    cta: { title: "Jugend-Ausstattung anfragen", sub: "Polos, Shirts, Hoodies und Softshelljacken." },
    footerNotes: F_VEREIN,
  },
  {
    code: "P7",
    lane: "product",
    name: "Das Detail entscheidet",
    layouts: ["panel-cta", "band-unten"],
    brief:
      "Verarbeitung: Naht, Knopf, Kragen — ein Detail groß machen + warum es Jahre hält. Stiller Qualitätsbeweis. KEINE Schneiderei-Romantik, kein ‚handgeschneidert‘ — es geht um konstante Serienqualität aus eigener Fertigung.",
    exampleHeadlines: [
      "Ein Knopf ist nur ein Knopf — bis er beim hundertsten Fest noch sitzt.",
      "Diese Naht soll ein Vereinsleben halten.",
    ],
    photoDirection:
      "Makroaufnahme von Wollstoff, Naht oder Knopf einer dunkelgrünen Uniformjacke, gerichtetes warmes Licht, edel und ruhig.",
    months: [10, 11, 1, 2],
    accentIcon: "gem",
    benefits: [B_EIGENE_PROD, { icon: "shield-check", title: "Konstante Qualität", text: "Gleiche Stoffe, gleiche Serie" }, B_NACHKAUF],
    footerNotes: F_STANDARD,
  },
  {
    code: "P8",
    lane: "product",
    name: "Euer Wappen, unser Stick",
    layouts: ["panel-links", "panel-cta"],
    brief:
      "Individualisierung im erlaubten Rahmen: Vereinslogo/-name per standardisiertem Stick oder Druck auf Polos, Shirts, Hoodies, Softshelljacken. Formel: [generisches Produkt] wird erst mit [eurem Wappen] zum [Vereinsstück].",
    exampleHeadlines: [
      "Ein Poloshirt ist ein Poloshirt. Bis euer Wappen drauf ist.",
      "Euer Name auf der Brust — unser Stick macht’s offiziell.",
    ],
    photoDirection:
      "Nahaufnahme einer Stickerei auf dunkelgrüner Softshelljacke (generisches Wappen-Motiv, KEIN echtes Logo, KEINE lesbare Schrift), daneben getragene Variante unscharf.",
    months: [10, 11, 12],
    benefits: [
      { icon: "sparkles", title: "Stick oder Druck", text: "Euer Logo, sauber umgesetzt" },
      { icon: "shirt", title: "Bewährtes Sortiment", text: "Polos, Shirts, Hoodies, Softshell" },
      B_VEREINSPREIS,
    ],
    cta: { title: "Logo-Ausstattung anfragen", sub: "Schickt uns euer Wappen — wir setzen es um." },
    footerNotes: F_VEREIN,
  },
  {
    code: "P9",
    lane: "product",
    name: "Für die großen Tage",
    layouts: ["panel-cta", "panel-links"],
    brief:
      "Schützenfrack für festliche Anlässe. Formel: [Anlass mit Fallhöhe] verdient [das feierlichste Stück]. Schlicht-elegant, keinerlei Fantasie-Verzierung. Die Headline muss ein vollständiger, klarer Satz sein. Das Wort ‚Frack‘ darf vorkommen — es ist ein reguläres Produkt.",
    exampleHeadlines: [
      "Für die Tage, an denen der ganze Ort zuschaut.",
      "Manche Termine verdienen mehr als eine Jacke.",
    ],
    photoDirection:
      "Ein eleganter dunkelgrüner Schützenfrack auf einer Schneiderbüste, sauber ausgeleuchtet; dahinter stark unscharf ein festlich erleuchteter Vereinssaal. KEINE Person, nur das Kleidungsstück.",
    months: [10, 11, 12, 1],
    accentIcon: "gem",
    benefits: [
      { icon: "gem", title: "Festliches Stück", text: "Für Proklamation und Ehrenabend" },
      B_GROESSEN,
      B_NACHKAUF,
    ],
    cta: { title: "Frack-Muster anfragen", sub: "Rechtzeitig vor eurem Ehrenabend." },
    footerNotes: F_STANDARD,
  },
  {
    code: "P10",
    lane: "product",
    name: "Eine Kiste, alle Antworten",
    layouts: ["panel-cta", "panel-links"],
    brief:
      "Musterkollektion + persönliche Beratung — Einstieg ins Projektgeschäft. Formel: [Anfassen vor Entscheiden] + [Vorstand als Held]. Härtester CTA im System.",
    exampleHeadlines: [
      "Erst anfassen, dann entscheiden: die Musterkollektion für euren Vorstand.",
      "Die wichtigste Vorstandssitzung des Jahres passt in eine Kiste.",
    ],
    photoDirection:
      "Geöffnetes Musterpaket mit ordentlich gefalteten dunkelgrünen Uniformteilen auf Holztisch im Vereinsheim, warmes Licht, KEIN Maßband, KEINE lesbaren Etiketten.",
    months: [10, 11, 12, 1, 2],
    accentIcon: "package-open",
    benefits: [
      { icon: "package-open", title: "Musterkollektion", text: "Zum Anfassen in eurer Sitzung" },
      B_VEREINSPREIS,
      B_GROESSEN,
    ],
    cta: { title: "Jetzt Musterkollektion anfragen", sub: "Kostenlos zu eurer nächsten Vorstandssitzung." },
    footerNotes: F_VEREIN,
  },
  {
    code: "P11",
    lane: "product",
    name: "Aus eigener Fertigung",
    layouts: ["panel-cta", "panel-links"],
    brief:
      "Die stärkste Sachgeschichte der Marke: Hersfelder entwickelt, beschafft, fertigt und liefert selbst — deshalb ist alles dauerhaft verfügbar und Jahre später nachbestellbar. Formel: [Warum andere ausverkauft sind] + [warum wir es nicht sind]. Sachlich stolz, KEIN Manufaktur-Pathos, KEIN ‚Schneiderhandwerk‘.",
    exampleHeadlines: [
      "Wir bestellen unsere Jacken nicht. Wir machen sie.",
      "‚Leider nicht mehr lieferbar‘ steht bei uns nicht im Sortiment.",
    ],
    photoDirection:
      "Ruhige Aufnahme gestapelter dunkelgrüner Uniformteile in einem hellen Lager- oder Fertigungsraum, ordentliche Reihen auf Regalen, sachliches Tageslicht, KEINE Menschen im Fokus, KEINE lesbaren Etiketten, Kartons und Regale ohne Beschriftung.",
    benefits: [B_EIGENE_PROD, B_LIEFERBAR, B_NACHKAUF],
    cta: { title: "Sortiment für euren Verein anfragen", sub: "Dauerhaft verfügbar statt einmalig ausverkauft." },
    footerNotes: F_STANDARD,
  },
  {
    code: "P12",
    lane: "product",
    name: "Spielmannszug & Musikzug",
    layouts: ["panel-links", "panel-cta"],
    brief:
      "Ausstattung für Spielmannszüge, Musikzüge und Tambourkorps — eigene Zielgruppe, nicht Anhängsel des Schützenvereins. Formel: [Anforderung beim Spielen/Marschieren] + [was das Sortiment dafür kann]. Bewegungsfreiheit darf man beschreiben, NIE technische Stoff-Claims aufstellen.",
    exampleHeadlines: [
      "Bewegungsfreiheit für alle, die zwei Stunden durchspielen.",
      "Der Zug spielt einheitlich. Er sollte auch so aussehen.",
    ],
    photoDirection:
      "Spielmannszug in einheitlichen dunkelgrünen Uniformjacken von hinten oder halbnah, Marschtrommeln und Querflöten sichtbar, Dorfstraße, Tageslicht.",
    months: [3, 4, 5, 6, 7, 8, 9],
    benefits: [B_EINHEIT, B_GROESSEN, B_NACHKAUF],
    cta: { title: "Ausstattung für euren Zug anfragen", sub: "Für Spielmannszüge, Musikzüge und Tambourkorps." },
    footerNotes: F_VEREIN,
  },
  {
    code: "P13",
    lane: "product",
    name: "Vereinsprojekt",
    layouts: ["panel-cta", "panel-links"],
    brief:
      "Vereinsprojekte: Ab produktionsfähigen Stückzahlen entwickeln wir eine eigene Vereinsuniform — Stofffarbe, Stoffgewicht, Vereinsfarben, Details. WICHTIG: klar abgrenzen — das ist ein PROJEKT für größere Vereine, keine Einzelanfertigung, keine kleinen Stückzahlen, keine Maßkonfektion. Formel: [was möglich ist] + [ab wann].",
    exampleHeadlines: [
      "Eure Vereinsfarben, unsere Fertigung — ab der richtigen Stückzahl.",
      "Ein eigenes Vereinsgrün ist möglich. Ab einem echten Projekt.",
    ],
    photoDirection:
      "Mehrere Stoffbahnen in verschiedenen Grüntönen ordentlich nebeneinander auf einem hellen Tisch, daneben eine fertige dunkelgrüne Uniformjacke, sachliches Tageslicht, KEINE Schrift, KEIN Maßband.",
    months: [9, 10, 11, 12, 1, 2],
    benefits: [
      { icon: "sparkles", title: "Eigene Vereinsfarbe", text: "Ab produktionsfähiger Stückzahl" },
      B_EIGENE_PROD,
      { icon: "handshake", title: "Projektpreis", text: "Individuell kalkuliert für euren Verein" },
    ],
    cta: { title: "Vereinsprojekt besprechen", sub: "Ab produktionsfähiger Menge — sagt uns eure Größenordnung." },
    footerNotes: F_STANDARD,
  },
  {
    code: "P14",
    lane: "product",
    name: "Die Hose zählt mit",
    layouts: ["panel-links", "panel-cta"],
    brief:
      "Hosen als unterschätzter Teil des einheitlichen Auftritts: Von vorne sieht man die Jacke, im Zug sieht man alles. Formel: [was im Umzug wirklich auffällt] + [warum die Hose dazugehört].",
    exampleHeadlines: [
      "Im Zug sieht man nicht nur Jacken.",
      "Einheitlich heißt: von oben bis unten.",
    ],
    photoDirection:
      "Halbtotale einer angetretenen Reihe von der Hüfte abwärts, einheitliche Hosen und geputzte Schuhe, Pflasterstraße, Tageslicht, sachlich und ruhig.",
    benefits: [B_EINHEIT, B_GROESSEN, B_LIEFERBAR],
    cta: { title: "Komplettausstattung anfragen", sub: "Jacke, Weste, Hose — aus einem Sortiment." },
    footerNotes: F_VEREIN,
  },
  {
    code: "P15",
    lane: "product",
    name: "Jetzt planen, im Mai fertig",
    layouts: ["panel-cta", "panel-links"],
    brief:
      "Der Beschaffungszyklus aus Vorstandssicht: Wer im Winter entscheidet, steht im Frühjahr fertig da. Direkt an Vorstand, Uniformwart und Einkauf gerichtet. Formel: [Winter-Realität] + [Fest-Termin]. Sachlich hilfreich, kein Druck.",
    exampleHeadlines: [
      "Im Januar entschieden. Im Mai angetreten.",
      "Die Uniform für das Fest im Juni beginnt bei der Winterversammlung.",
    ],
    photoDirection:
      "Vereinsheim-Tisch im Winterlicht: Kaffeetassen, Stuhlreihen, eine dunkelgrüne Uniformjacke über einer Stuhllehne, ruhige Abendstimmung, KEINE lesbaren Papiere oder Schrift.",
    months: [11, 12, 1, 2, 3],
    accentIcon: "calendar-check",
    benefits: [
      { icon: "calendar-check", title: "Planbar", text: "Verlässlich fertig zum Festtermin" },
      B_LIEFERBAR,
      B_VEREINSPREIS,
    ],
    cta: { title: "Termin für eure Ausstattung sichern", sub: "Sagt uns euer Festdatum — wir planen rückwärts." },
    footerNotes: F_STANDARD,
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
  // Klima-/Kühl-Behauptungen: laut Marken-Briefing ohne Nachweis verboten.
  // Die KI umschrieb sie umgangssprachlich („bleibt ihr cool") und rutschte so
  // an der Claim-Liste im Prompt vorbei — hier greift die harte Sperre.
  "bleibt ihr cool",
  "bleibt cool",
  "bleiben cool",
  "hält euch kühl",
  "hält kühl",
  "kühlt euch",
  "angenehm kühl",
  "trotzt der Hitze",
  "trotzt jeder Hitze",
  "trotz der Hitze kühl",
  "hält euch trocken",
];

// ---------------------------------------------------------------------------
// Format-Auswahl mit Rotation + Saison
// ---------------------------------------------------------------------------

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

/**
 * Wählt ein Konzept-Format: Lane vorgeben, kürzlich genutzte Codes meiden,
 * Saison-Fenster bevorzugen. Fällt weich zurück, wenn alles ausgeschlossen wäre.
 */
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
  return weightedPick(candidates, (f) => Math.max(0.4, mult?.[f.code] ?? 1), rnd) ?? pool[0];
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
