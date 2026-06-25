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

/** Text für genau eine Plattform — fällt auf Instagram bzw. Rohtext zurück. */
export function captionForPlatform(caption: string, platform: Platform): string {
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
