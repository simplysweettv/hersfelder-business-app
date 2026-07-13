import type { Post } from "@/types";

/**
 * Verbindliche Qualitätsregeln — deterministisch, unabhängig von der KI-Prüfung.
 * Pure Funktionen (unit-getestet in tests/quality.test.ts).
 */

export type QualityStatus = "passed" | "warning" | "failed" | "not_checked";

export const QUALITY_STATUS_LABEL: Record<QualityStatus, string> = {
  passed: "TÜV bestanden",
  warning: "TÜV mit Hinweisen",
  failed: "TÜV nicht bestanden",
  not_checked: "ungeprüft",
};

/**
 * Verbotene Marken-Claims aus dem Master-Briefing (Andreas, Juli 2026):
 * Hersfelder ist eine Standardsortiment-Marke — keine Maßschneiderei, keine
 * unbelegten Technik-Versprechen. Wortgrenzen-tolerant, case-insensitive.
 */
const FORBIDDEN_CLAIMS = [
  "maßgeschneidert",
  "massgeschneidert",
  "handgeschneidert",
  "maßkonfektion",
  "masskonfektion",
  "einzelanfertigung",
  "schneiderhandwerk",
  "couture",
  "atmungsaktiv",
  "klimaregulierend",
  "temperaturregulierend",
  "hightech-faser",
  "funktionsstoff",
];

/** Findet verbotene Claims in einem Text — leeres Array = sauber. */
export function findForbiddenClaims(text: string | null | undefined): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  return FORBIDDEN_CLAIMS.filter((claim) => lower.includes(claim));
}

/** Ergebnis der KI-Prüfung (reviewPost) → expliziter Qualitäts-Status. */
export function qualityStatusFrom(review: {
  checked: boolean;
  score: number;
  captionOk: boolean;
  imageOk: boolean;
  issues: string[];
}): QualityStatus {
  if (!review.checked) return "not_checked";
  if (!review.captionOk || !review.imageOk || review.score < 5) return "failed";
  if (review.score >= 8 && review.issues.length === 0) return "passed";
  return "warning";
}

export type ApprovalGate = {
  /** Freigabe unmöglich — auch mit Override nicht (Post wäre nicht postbar). */
  hardBlockers: string[];
  /** Freigabe nur mit bewusster Bestätigung (Override). */
  blockers: string[];
  /** Hinweise — blockieren nicht. */
  warnings: string[];
};

/**
 * Prüft, ob ein Post freigegeben werden darf. Deterministische Regeln aus
 * dem Review: fehlendes Bild/Caption/Plattform blockieren hart, verbotene
 * Claims und nicht bestandener/fehlender TÜV verlangen bewusstes Override.
 */
export function approvalGate(
  post: Pick<
    Post,
    "image_url" | "caption" | "platforms" | "scheduled_at" | "quality_score" | "quality_notes"
  > & { quality_status?: QualityStatus | string | null },
  now: Date = new Date(),
): ApprovalGate {
  const hardBlockers: string[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!post.image_url) hardBlockers.push("Kein Bild vorhanden.");
  if (!post.caption?.trim()) hardBlockers.push("Keine Caption vorhanden.");
  if (!post.platforms?.length) hardBlockers.push("Keine Plattform ausgewählt.");

  const claims = findForbiddenClaims(post.caption);
  if (claims.length) {
    blockers.push(
      `Verbotene Marken-Claims im Text: ${claims.join(", ")} (Hersfelder ist Standardsortiment-Marke).`,
    );
  }

  const qs = (post.quality_status ?? null) as QualityStatus | null;
  if (qs === "failed") {
    const notes = (post.quality_notes ?? []).slice(0, 3).join(" · ");
    blockers.push(`Qualitätsprüfung nicht bestanden${notes ? ` — ${notes}` : ""}.`);
  } else if (qs === "not_checked") {
    blockers.push("Qualitätsprüfung konnte nicht durchgeführt werden (ungeprüfter Post).");
  }

  if (post.scheduled_at) {
    if (new Date(post.scheduled_at).getTime() <= now.getTime()) {
      blockers.push("Der geplante Termin ist bereits vorbei — der Post würde SOFORT veröffentlicht.");
    }
  } else {
    blockers.push("Kein Termin gesetzt — der Post würde SOFORT veröffentlicht.");
  }

  if (qs === "warning" || (qs == null && (post.quality_score ?? 10) < 8)) {
    const notes = (post.quality_notes ?? []).slice(0, 3).join(" · ");
    warnings.push(`Qualitätsprüfung mit Hinweisen${notes ? `: ${notes}` : ""}.`);
  }

  return { hardBlockers, blockers, warnings };
}
