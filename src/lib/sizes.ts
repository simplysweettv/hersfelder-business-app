/**
 * Größen — EINE Quelle der Wahrheit für alle Prompts, Kacheln und Prüfungen.
 *
 * Stand: Shop-Varianten von schuetzen-ausstatter.de, nachgezählt am 05.08.2026
 * (Shopify-Varianten je Produkt, nicht aus dem Fließtext geraten).
 *
 * Warum diese Datei existiert: In den Posts stand lange „Größen 23–70" als
 * durchgehende Spanne. Das ist FALSCH. Es sind zwei verschiedene Größensysteme:
 *
 *   • NORMALGRÖSSEN  46–70 (Oberteile) / 44–70 (Herrenhosen)
 *   • KURZGRÖSSEN    23–34 — „untersetzte" Größen: kürzer in der Länge,
 *                    weiter in der Weite. Eigene Zählweise, KEINE Fortsetzung
 *                    der Normalgrößen nach unten.
 *   • DAMENGRÖSSEN   30–60 (Damenwesten, in Zweierschritten)
 *
 * Zwischen 35 und 43 gibt es NICHTS — „23 bis 70" behauptet also eine Spanne,
 * die es so nicht gibt, und suggeriert obendrein Kindergrößen.
 *
 * KINDERGRÖSSEN GIBT ES NICHT. Die 23er-Größen sind Erwachsenen-Kurzgrößen.
 * Kein Post, keine Caption, kein Bildtext darf Kinder- oder Jugendgrößen,
 * Kinderuniformen oder Ausstattung „für die Kleinsten" anbieten.
 */

export const SIZE_FACTS = {
  /** Sakkos, Schützenjacken, Herrenwesten */
  herrenOberteile: { normal: [46, 70] as const, kurz: [23, 34] as const },
  /** Herrenhosen (beginnen eine Nummer tiefer als die Oberteile) */
  herrenhosen: { normal: [44, 70] as const, kurz: [23, 34] as const },
  /** Damenwesten „Concordia" / „Teutonia" */
  damenwesten: { normal: [30, 60] as const },
} as const;

/**
 * Prompt-Baustein. Wird MASTER_BRIEFING, der Konzept-KI und dem QA-Agenten
 * vorangestellt — damit Bildtext, Caption und Prüfung dieselben Zahlen kennen.
 */
export const SIZE_BRIEFING = `GRÖSSEN (verbindlich, nie anders behaupten):
- Herren-Oberteile (Sakko, Schützenjacke, Weste): Normalgrößen 46–70.
- Herrenhosen: Normalgrößen 44–70.
- Zusätzlich KURZGRÖSSEN 23–34 (auch „untersetzte Größen"): kürzer geschnitten und weiter in der Weite — für kräftigere und kleinere Staturen. Das ist ein EIGENES Größensystem, KEINE Fortsetzung der Normalgrößen.
- Damenwesten: Damengrößen 30–60.
- Alle Größen eines Produkts kosten dasselbe — kein Größenaufschlag. DAS ist der USP, nicht die Zahlenspanne.
- FALSCH und streng verboten: „Größen 23 bis 70", „23–70", „von 23 bis 70" oder jede andere durchgehende Spanne über beide Systeme hinweg. Zwischen 35 und 43 gibt es keine Größen.
- RICHTIG formuliert: „Normalgrößen 46–70 plus Kurzgrößen 23–34", „Normal- und Kurzgrößen", „Damengrößen 30–60", „für jede Statur die passende Größe".
- KINDERGRÖSSEN GIBT ES NICHT. Niemals Kinder- oder Jugendgrößen, Kinderuniformen, Ausstattung „für die Kleinsten" oder „vom Kind bis zum Ehrenvorstand" anbieten oder andeuten. Die 23er-Größen sind ERWACHSENEN-Kurzgrößen. Jugendliche werden über die normalen Erwachsenengrößen und über Polos/Shirts/Hoodies ausgestattet.`;

/** Kurzform für enge Textfelder (Benefit-Kacheln, Fußleisten). */
export const SIZE_SHORT = "Normal- & Kurzgrößen";

// ---------------------------------------------------------------------------
// Deterministische Sperre
// ---------------------------------------------------------------------------

/** „Größe(n)" in allen üblichen Schreibweisen (ß / ss / oe). */
const GR = "gr(?:ö|oe|o)(?:ß|ss|s)?en?";

/** Kinder-/Jugendgrößen in jeder Schreibweise. */
const CHILD_PATTERNS: { re: RegExp; label: string }[] = [
  {
    re: new RegExp(
      `kinder[-\\s]?(?:${GR}|konfektion|uniform\\w*|jacken?|westen?|hosen?|sakkos?|bekleidung|ausstattung|kollektion|mode|shirts?)`,
      "i",
    ),
    label: "Kindergrößen/Kinderbekleidung",
  },
  { re: new RegExp(`jugend[-\\s]?${GR}`, "i"), label: "Jugendgrößen" },
  { re: new RegExp(`${GR}\\s+(?:für|ab)\\s+kinder`, "i"), label: "Größen für Kinder" },
  { re: /(vom|ab)\s+kind(e|es)?\s+(bis|an)/i, label: "vom Kind bis …" },
  { re: /auch\s+für\s+kinder/i, label: "auch für Kinder" },
];

/**
 * Spanne, die die Lücke zwischen Kurz- und Normalgrößen überbrückt
 * (z. B. „23 bis 70", „23–70"). Damengrößen 30–60 sind erlaubt und werden
 * über den Kontext ausgenommen. Der Schrägstrich ist bewusst KEIN Trenner —
 * „25/50/75 Jahre Vereinsjubiläum" ist keine Größenangabe.
 */
const GAP_RANGE = /\b(2[3-9]|3[0-4])\s*(?:bis|–|—|-)\s*(4[4-9]|5\d|6\d|70)\b/gi;

/**
 * Findet die erste falsche Größenaussage in einem Text (Headline, Caption,
 * Bildtext). Gibt eine Klartext-Beschreibung zurück, sonst null.
 *
 * Läuft deterministisch VOR jedem KI-Urteil — der Vision-Prüfer darf so etwas
 * nicht als Geschmacksfrage durchwinken.
 */
export function findSizeViolation(text: string): string | null {
  if (!text) return null;

  for (const { re, label } of CHILD_PATTERNS) {
    if (re.test(text)) return `Kindergrößen behauptet (${label}) — die gibt es nicht, 23–34 sind Erwachsenen-Kurzgrößen.`;
  }

  GAP_RANGE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = GAP_RANGE.exec(text)) !== null) {
    // Damengrößen 30–60 sind eine echte, durchgehende Spanne.
    const context = text.slice(Math.max(0, m.index - 60), m.index + m[0].length + 20).toLowerCase();
    if (context.includes("damen")) continue;
    return `Falsche Größenspanne „${m[0]}" — Normalgrößen 46–70 (Hosen 44–70) und Kurzgrößen 23–34 sind zwei getrennte Systeme, dazwischen gibt es nichts.`;
  }

  return null;
}
