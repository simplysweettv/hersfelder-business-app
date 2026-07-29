import { runQaGate, type GateResult } from "./qa-gate";
import type { DesignedConcept } from "./designed-post";
import { renderedTextOf } from "./render-poster";
import type { OverlayContent } from "./render-post";
import type { QualityStatus } from "./quality";

/**
 * Brücke zwischen der designten Pipeline und der Zwei-Agenten-Freigabe.
 *
 * Der alte Einzel-TÜV (reviewPost) prüfte Bild und Text getrennt über eine
 * URL. Das neue Gate prüft das FERTIGE Composite als Bild — dadurch kann es
 * sehen, ob Bild und Text dasselbe Motiv meinen (der häufigste Fehler:
 * "diese beiden Westen" über einem Foto mit drei Personen).
 *
 * Diese Datei sammelt alles, was das Gate braucht, aus dem Konzept ein — damit
 * alle Generierungs-Wege (Cron, Generator, Zufall) identisch prüfen.
 */

export type DesignedReview = {
  /** true = beide Agenten geben frei */
  pass: boolean;
  /** 1-10, wandert nach posts.quality_score */
  score: number;
  /** Klartext-Mängel, wandert nach posts.quality_notes */
  notes: string[];
  /** Für posts.quality_status */
  status: QualityStatus;
  /** Wo lag das Problem? Steuert den Neuanlauf. */
  failArea: "image" | "text" | "both" | null;
};

/** Welche Säule? Aus dem Template abgeleitet (product-* vs. emotional-*). */
function laneOf(template: string): "emotional" | "product" {
  return template.startsWith("product") ? "product" : "emotional";
}

/**
 * Alle Textzeilen, die tatsächlich ins Bild gerendert wurden — damit der
 * QA-Agent nicht per OCR raten muss, was da steht.
 */
export function renderedTextOfOverlay(overlay: OverlayContent): string {
  return [
    ...(overlay.headline ?? []),
    overlay.serifLine,
    overlay.scriptLine,
    overlay.subline,
    overlay.copy,
    overlay.microClaim,
    overlay.tagline,
    overlay.statement,
    overlay.cta,
    ...(overlay.features ?? []).flatMap((f) => [f.title, f.text]),
  ]
    .filter(Boolean)
    .join(" | ");
}

/** Gate-Ergebnis → Qualitäts-Status für die Freigabe-Regeln. */
export function qualityStatusFromGate(gate: GateResult): QualityStatus {
  if (gate.pass) return "passed";
  // Nur OBJEKTIVE Mängel blockieren die Freigabe: Compliance, kaputter Satz,
  // entstellte Hände. Motiv-Auslegung und kreative Schwäche sind Warnungen —
  // der Motiv-Check urteilt zu oft zu streng, um allein zu blockieren.
  if (gate.qa.hardFail) return "failed";
  return "warning";
}

/**
 * Prüft EINEN fertig gerenderten designten Post mit beiden Agenten.
 * `jpeg` ist das Composite aus createDesignedPostImage.
 */
export async function reviewDesignedPost(opts: {
  apiKey?: string;
  jpeg: Buffer;
  concept: DesignedConcept;
  caption: string;
}): Promise<DesignedReview> {
  const gate = await runQaGate({
    apiKey: opts.apiKey,
    jpeg: opts.jpeg,
    // Genau die Zeilen, die die Poster-Engine ins Bild gesetzt hat.
    renderedText: renderedTextOf(opts.concept.poster),
    // Das Motiv ist die Foto-Idee — genau das, was Bild UND Text tragen sollen.
    motif: `${opts.concept.photoIdea} — Kernaussage: ${opts.concept.message}`,
    caption: opts.caption,
    kind: opts.concept.poster.kind,
    lane: laneOf(opts.concept.template),
  });

  return {
    pass: gate.pass,
    score: gate.score,
    notes: gate.notes,
    status: qualityStatusFromGate(gate),
    failArea: gate.failArea,
  };
}
