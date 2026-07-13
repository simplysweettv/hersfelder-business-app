import type { Platform } from "@/types";

/**
 * Konfigurierbarer Posting-Plan — Frequenz ist eine Einstellung, keine
 * Code-Entscheidung. Gespeichert als JSON im settings-Key "posting_plan".
 * Pure Funktionen (unit-getestet in tests/posting-plan.test.ts).
 */

export type ImageSize = "1024x1024" | "1024x1536" | "1536x1024";

export type PlanSlot = {
  /** 0=So, 1=Mo … 6=Sa (deutsche Ortszeit) */
  weekday: number;
  hour: number;
  minute: number;
  platforms: Platform[];
  imageSize: ImageSize;
};

export type PostingPlanMode = "ruhig" | "normal" | "aktiv" | "individuell";

export type PostingPlan = {
  mode: PostingPlanMode;
  slots: PlanSlot[];
};

const DEFAULT_PLATFORMS: Platform[] = ["instagram", "facebook", "tiktok"];
const PORTRAIT: ImageSize = "1024x1536";

const slot = (weekday: number, hour: number, minute = 0): PlanSlot => ({
  weekday,
  hour,
  minute,
  platforms: DEFAULT_PLATFORMS,
  imageSize: PORTRAIT,
});

/** Vordefinierte Modi: Ruhig 2×, Normal 3×, Aktiv 4× pro Woche. */
export const PLAN_PRESETS: Record<Exclude<PostingPlanMode, "individuell">, PlanSlot[]> = {
  ruhig: [slot(3, 19), slot(6, 11)], // Mi 19:00 · Sa 11:00
  normal: [slot(3, 19), slot(6, 11), slot(0, 19)], // Mi · Sa · So
  aktiv: [slot(3, 19), slot(5, 18), slot(6, 11), slot(0, 19)], // Mi · Fr · Sa · So
};

export const PLAN_MODE_LABEL: Record<PostingPlanMode, string> = {
  ruhig: "Ruhig · 2 Posts/Woche",
  normal: "Normal · 3 Posts/Woche",
  aktiv: "Aktiv · 4 Posts/Woche",
  individuell: "Individuell",
};

/** Bisheriges Verhalten (4 Slots) als Standard — kein Bruch für Bestand. */
export const DEFAULT_PLAN: PostingPlan = { mode: "aktiv", slots: PLAN_PRESETS.aktiv };

const VALID_PLATFORMS = new Set<Platform>(["instagram", "facebook", "tiktok", "linkedin"]);
const VALID_SIZES = new Set<ImageSize>(["1024x1024", "1024x1536", "1536x1024"]);

function sanitizeSlot(raw: unknown): PlanSlot | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const weekday = Number(s.weekday);
  const hour = Number(s.hour);
  const minute = Number(s.minute ?? 0);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return null;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  const platforms = (Array.isArray(s.platforms) ? s.platforms : DEFAULT_PLATFORMS).filter(
    (p): p is Platform => VALID_PLATFORMS.has(p as Platform),
  );
  const imageSize = VALID_SIZES.has(s.imageSize as ImageSize)
    ? (s.imageSize as ImageSize)
    : PORTRAIT;
  if (!platforms.length) return null;
  return { weekday, hour, minute, platforms, imageSize };
}

/**
 * Parst den settings-Wert. Ungültig/leer → DEFAULT_PLAN (nie werfen — die
 * Content-Engine darf an einer kaputten Einstellung nicht sterben).
 */
export function parsePostingPlan(value: string | null | undefined): PostingPlan {
  if (!value?.trim()) return DEFAULT_PLAN;
  try {
    const parsed = JSON.parse(value) as { mode?: string; slots?: unknown[] };
    const mode = (["ruhig", "normal", "aktiv", "individuell"] as const).find(
      (m) => m === parsed.mode,
    );
    if (!mode) return DEFAULT_PLAN;
    if (mode !== "individuell") return { mode, slots: PLAN_PRESETS[mode] };
    const slots = (parsed.slots ?? [])
      .map(sanitizeSlot)
      .filter((s): s is PlanSlot => s !== null)
      .slice(0, 7); // max. 1 Slot pro Wochentag ist gedacht — 7 als Obergrenze
    return slots.length ? { mode, slots } : DEFAULT_PLAN;
  } catch {
    return DEFAULT_PLAN;
  }
}
