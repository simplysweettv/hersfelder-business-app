/**
 * Fehlerklassifizierung fürs Publishing — nicht alle Fehler sind gleich.
 * transient  → automatisch erneut versuchen (Netzwerk, Timeout, 5xx, Rate-Limit)
 * permanent  → kein Auto-Retry, manuell klären (ungültiges Format, Caption zu lang …)
 * reauth     → Konto/Verbindung fehlt — Retry erst nach Neu-Verbinden sinnvoll
 * Pure Funktionen (unit-getestet in tests/publish-errors.test.ts).
 */

export type PublishErrorCode = "transient" | "permanent" | "reauth";

const PERMANENT_PATTERNS =
  /nicht unterstützt|unsupported|invalid|ungültig|zu lang|too long|caption.*(limit|length)|media.*(format|type)|bad request|http 4(0[04689]|1[0-9]|2[0-9])/i;

const TRANSIENT_PATTERNS =
  /timeout|timed out|network|fetch failed|econn|socket|rate limit|too many requests|http (429|5\d\d)|temporar|vorübergehend|unavailable|nicht erreichbar/i;

export function classifyPublishError(error: string, reauth?: boolean): PublishErrorCode {
  if (reauth) return "reauth";
  if (TRANSIENT_PATTERNS.test(error)) return "transient";
  if (PERMANENT_PATTERNS.test(error)) return "permanent";
  // Unbekannt → transient: lieber ein überflüssiger Retry (idempotent durch
  // Claim + success-Skip) als ein liegengebliebener Post.
  return "transient";
}

/** Backoff-Staffel aus dem Review: 5 min → 15 min → 60 min → 6 h → 24 h. */
const BACKOFF_MINUTES = [5, 15, 60, 360, 1440];

/**
 * Nächster Retry-Zeitpunkt für einen transienten Fehler.
 * attempt = wievielter Versuch gerade fehlschlug (1-basiert).
 * permanent/reauth → null (kein automatischer Retry).
 */
export function nextRetryAt(
  code: PublishErrorCode,
  attempt: number,
  now: Date = new Date(),
): Date | null {
  if (code !== "transient") return null;
  const idx = Math.min(Math.max(attempt, 1) - 1, BACKOFF_MINUTES.length - 1);
  return new Date(now.getTime() + BACKOFF_MINUTES[idx] * 60_000);
}
