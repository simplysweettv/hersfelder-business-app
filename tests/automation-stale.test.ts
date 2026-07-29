import { describe, it, expect } from "vitest";
import { isStale } from "@/lib/automation";

/**
 * Ein von der Plattform abgebrochener Cron-Lauf bleibt für immer auf "running".
 * Vorher fiel dieser Zustand durch alle Zweige der Systemampel — sie blieb
 * grün, obwohl seit Tagen nichts mehr lief.
 */
const NOW = new Date("2026-07-29T18:00:00Z");

describe("isStale — hängengebliebene Läufe erkennen", () => {
  it("gerade gestartet → nicht hängengeblieben", () => {
    expect(isStale("2026-07-29T17:58:00Z", NOW)).toBe(false);
  });

  it("29 Minuten alt → noch im Rahmen (längste Funktion darf 300s laufen)", () => {
    expect(isStale("2026-07-29T17:31:00Z", NOW)).toBe(false);
  });

  it("31 Minuten alt → hängengeblieben", () => {
    expect(isStale("2026-07-29T17:29:00Z", NOW)).toBe(true);
  });

  it("gestern gestartet → eindeutig hängengeblieben", () => {
    expect(isStale("2026-07-28T05:00:00Z", NOW)).toBe(true);
  });

  it("unlesbares Datum schlägt nicht fälschlich Alarm", () => {
    expect(isStale("kein datum", NOW)).toBe(false);
  });
});
