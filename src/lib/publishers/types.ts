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
  /** Bereits für DIESE Plattform aufgeteilte Caption (ohne Trenner). */
  caption: string;
};

export type PublishOutcome =
  | { ok: true; externalId: string; raw?: unknown }
  | { ok: false; error: string; reauth?: boolean; raw?: unknown };

export interface Publisher {
  readonly platform: Platform;
  /** Menschlicher Name für Logs/Fehler, z. B. "Blotato:instagram". */
  readonly name: string;
  /** Sind die nötigen Zugangsdaten vorhanden? */
  isConfigured(get: ConfigGetter): boolean;
  publish(payload: PublishPayload, get: ConfigGetter): Promise<PublishOutcome>;
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
