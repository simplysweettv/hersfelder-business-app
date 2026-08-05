import type { Platform } from "@/types";

/**
 * Zentrale Caption-Logik — EINE Quelle der Wahrheit für UI und Cron.
 *
 * Captions werden mit Plattform-Trennern in einer DB-Spalte gespeichert:
 *
 *   ---INSTAGRAM---
 *   Text für Instagram
 *
 *   ---FACEBOOK---
 *   Text für Facebook
 *   ...
 *
 * splitCaption() zerlegt das in einzelne Plattform-Texte. captionForPlatform()
 * gibt den Text für genau eine Plattform zurück (mit sinnvollem Fallback).
 */

const SEP_RE = /(---(?:INSTAGRAM|FACEBOOK|TIKTOK|LINKEDIN)---)/;
const SEP_MATCH = /^---(INSTAGRAM|FACEBOOK|TIKTOK|LINKEDIN)---$/;

export function splitCaption(caption: string): Partial<Record<Platform, string>> {
  const result: Partial<Record<Platform, string>> = {};
  const parts = (caption ?? "").split(SEP_RE);
  let currentKey: Platform | null = null;

  for (const part of parts) {
    const m = part.trim().match(SEP_MATCH);
    if (m) {
      currentKey = m[1].toLowerCase() as Platform;
    } else if (currentKey && part.trim()) {
      result[currentKey] = part.trim();
    }
  }

  // Kein Trenner gefunden → ganze Caption als Instagram-Text behandeln
  if (Object.keys(result).length === 0 && caption?.trim()) {
    result.instagram = caption.trim();
  }
  return result;
}

/**
 * KI-Kennzeichnung — steht am Ende JEDER veröffentlichten Caption, auf allen
 * Plattformen. Wird nicht in der Datenbank gespeichert, sondern beim
 * Veröffentlichen angehängt (`captionForPlatform`), damit sie auch bei alten
 * Posts und von Hand bearbeiteten Texten garantiert dabei ist.
 */
export const AI_DISCLOSURE = "Hinweis: Dieser Beitrag wurde mit KI erstellt.";

/**
 * Erkennt eine bereits vorhandene Kennzeichnung (z. B. von Hand getippt oder
 * von der KI selbst geschrieben) — verhindert doppelte Hinweise.
 */
export function hasAiDisclosure(text: string): boolean {
  return /\bmit\s+KI\b|\bKI[-\s]generiert|\bKI[-\s]erstellt|\bK[Ii]\s*[-–]\s*Hinweis/i.test(
    text ?? "",
  );
}

/** Hängt die KI-Kennzeichnung an — idempotent, leerer Text bleibt leer. */
export function withAiDisclosure(text: string): string {
  const t = (text ?? "").trim();
  if (!t) return t;
  if (hasAiDisclosure(t)) return t;
  return `${t}\n\n${AI_DISCLOSURE}`;
}

/**
 * Text für genau eine Plattform — fällt auf Instagram bzw. Rohtext zurück.
 * Enthält immer die KI-Kennzeichnung (siehe `AI_DISCLOSURE`).
 */
export function captionForPlatform(caption: string, platform: Platform): string {
  return withAiDisclosure(rawCaptionForPlatform(caption, platform));
}

/** Wie `captionForPlatform`, aber ohne KI-Kennzeichnung (Bearbeiten/Anzeige). */
export function rawCaptionForPlatform(caption: string, platform: Platform): string {
  const split = splitCaption(caption);
  return split[platform] ?? split.instagram ?? (caption ?? "").trim();
}

/** Aus einzelnen Plattform-Texten wieder einen Trenner-String bauen. */
export function buildCaption(captions: Partial<Record<Platform, string>>): string {
  return (Object.entries(captions) as [Platform, string][])
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `---${k.toUpperCase()}---\n${v.trim()}`)
    .join("\n\n");
}
