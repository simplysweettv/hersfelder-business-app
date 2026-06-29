import type { Platform } from "@/types";

/**
 * Publisher-Abstraktion.
 *
 * Der Rest der App (Cron, UI) kennt NUR dieses Interface — nie den
 * plattform-spezifischen Code. Ein Adapter pro Plattform implementiert
 * `publish()`. So lassen sich Anbieter (Blotato, Meta direkt, …) tauschen,
 * ohne dass der Cron oder die DB etwas davon merken.
 */

/** Liest einen Konfigwert: zuerst ENV (falls envKey gesetzt), dann settings-Tabelle. */
export type ConfigGetter = (settingKey: string, envKey?: string) => string | undefined;

export type PublishPayload = {
  imageUrl: string;
  /** Karussell: mehrere Bild-URLs. Hat Vorrang vor imageUrl, wenn gesetzt. */
  mediaUrls?: string[];
  /** Bereits für DIESE Plattform aufgeteilte Caption (ohne Trenner). */
  caption: string;
  /**
   * Optionaler Veröffentlichungszeitpunkt (ISO 8601 mit Offset).
   * Gesetzt → der Anbieter plant den Post selbst auf diese Zeit (z.B. Blotato
   * `scheduledTime`). Leer → sofort posten.
   */
  scheduledTime?: string;
};

export type PublishOutcome =
  | { ok: true; externalId: string; raw?: unknown }
  | { ok: false; error: string; reauth?: boolean; raw?: unknown };

/**
 * Echter Veröffentlichungs-Status beim Anbieter (nach Abfrage per externalId).
 * "in-progress" = angenommen, aber noch nicht live.
 */
export type StatusOutcome =
  | { state: "published"; publicUrl?: string; raw?: unknown }
  | { state: "failed"; error: string; raw?: unknown }
  | { state: "in-progress"; raw?: unknown };

export interface Publisher {
  readonly platform: Platform;
  /** Menschlicher Name für Logs/Fehler, z. B. "Blotato:instagram". */
  readonly name: string;
  /** Sind die nötigen Zugangsdaten vorhanden? */
  isConfigured(get: ConfigGetter): boolean;
  publish(payload: PublishPayload, get: ConfigGetter): Promise<PublishOutcome>;
  /**
   * Optional: echten Status einer Einreichung abfragen (z.B. Blotato
   * GET /posts/{id}). Anbieter ohne Status-Abfrage lassen das weg.
   */
  checkStatus?(externalId: string, get: ConfigGetter): Promise<StatusOutcome>;
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
