import type { Platform } from "@/types";
import type { Publisher } from "./types";
import { makeBlotatoPublisher } from "./blotato";
// import { makeMetaPublisher } from "./meta"; // ← Alternativweg, siehe unten

/**
 * Plattform → Publisher.
 *
 * Aktuell laufen ALLE 4 Kanäle über Blotato (eine Integration, ein Tool).
 *
 * Anbieter tauschen = eine Zeile ändern. Beispiel "Meta direkt (gratis) für
 * FB+IG, Blotato nur für TikTok+LinkedIn":
 *
 *   instagram: makeMetaPublisher("instagram"),
 *   facebook:  makeMetaPublisher("facebook"),
 *   tiktok:    makeBlotatoPublisher("tiktok"),
 *   linkedin:  makeBlotatoPublisher("linkedin"),
 *
 * Der Rest der App (Cron, DB, UI) merkt davon nichts.
 */
const REGISTRY: Record<Platform, Publisher> = {
  instagram: makeBlotatoPublisher("instagram"),
  facebook: makeBlotatoPublisher("facebook"),
  tiktok: makeBlotatoPublisher("tiktok"),
  linkedin: makeBlotatoPublisher("linkedin"),
};

export function getPublisher(platform: Platform): Publisher {
  return REGISTRY[platform];
}
