import { describe, it, expect } from "vitest";
import { formatDateTime, formatTime, formatDate } from "@/lib/date-utils";

/**
 * Regression: Anzeige-Zeiten müssen IMMER deutsche Zeit sein — egal ob der Code
 * auf dem Server (Vercel läuft in UTC) oder im Browser rendert. Vorher zeigte
 * der Leitstand 17:00, wo der Kalender für denselben Post 19:00 zeigte.
 */
describe("Anzeige-Zeiten sind immer deutsche Zeit", () => {
  it("Sommerzeit: 17:00 UTC → 19:00 Uhr (MESZ, +2)", () => {
    expect(formatDateTime("2026-07-29T17:00:00Z")).toBe("29.07.2026 · 19:00 Uhr");
    expect(formatTime("2026-07-29T17:00:00Z")).toBe("19:00");
    expect(formatDate("2026-07-29T17:00:00Z")).toBe("29.07.2026");
  });

  it("Winterzeit: 17:00 UTC → 18:00 Uhr (MEZ, +1)", () => {
    expect(formatDateTime("2026-01-15T17:00:00Z")).toBe("15.01.2026 · 18:00 Uhr");
  });

  it("Tageswechsel wird korrekt gerechnet: 23:30 UTC → nächster Tag 01:30", () => {
    expect(formatDateTime("2026-07-29T23:30:00Z")).toBe("30.07.2026 · 01:30 Uhr");
  });

  it("Mitternacht bleibt zweistellig (kein '24:00')", () => {
    expect(formatTime("2026-07-29T22:00:00Z")).toBe("00:00");
  });

  it("nimmt auch ein Date-Objekt entgegen", () => {
    expect(formatDate(new Date("2026-12-24T12:00:00Z"))).toBe("24.12.2026");
  });
});
