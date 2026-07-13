import { describe, it, expect } from "vitest";
import {
  berlinOffsetMinutes,
  berlinWallToUtc,
  berlinDayKey,
  berlinWeekday,
  isoWeek,
  isoWeekYear,
} from "@/lib/berlin-time";

describe("Berlin-Zeitzone (DST-bewusst)", () => {
  it("Sommerzeit = UTC+2 (Juli)", () => {
    expect(berlinOffsetMinutes(new Date("2026-07-15T12:00:00Z"))).toBe(120);
  });
  it("Winterzeit = UTC+1 (Januar)", () => {
    expect(berlinOffsetMinutes(new Date("2026-01-15T12:00:00Z"))).toBe(60);
  });

  it("berlinWallToUtc: 19:00 Berlin im Sommer = 17:00 UTC", () => {
    const utc = berlinWallToUtc(2026, 6, 15, 19, 0); // Juli (m0=6)
    expect(utc.toISOString()).toBe("2026-07-15T17:00:00.000Z");
  });
  it("berlinWallToUtc: 19:00 Berlin im Winter = 18:00 UTC", () => {
    const utc = berlinWallToUtc(2026, 0, 15, 19, 0); // Januar
    expect(utc.toISOString()).toBe("2026-01-15T18:00:00.000Z");
  });

  it("berlinDayKey rollt am späten UTC-Abend auf den nächsten Berlin-Tag", () => {
    // 23:30 UTC im Sommer = 01:30 Berlin des Folgetags
    expect(berlinDayKey(new Date("2026-07-15T23:30:00Z"))).toBe("2026-07-16");
  });

  it("berlinWeekday: 2026-07-15 ist ein Mittwoch (3)", () => {
    expect(berlinWeekday(new Date("2026-07-15T12:00:00Z"))).toBe(3);
  });
});

describe("ISO-Wochen", () => {
  it("1. Januar 2026 gehört zu KW 1 / Jahr 2026", () => {
    const d = new Date("2026-01-01T12:00:00Z");
    expect(isoWeek(d)).toBe(1);
    expect(isoWeekYear(d)).toBe(2026);
  });
  it("31. Dezember 2025 gehört zu ISO-Woche mit Wochenjahr 2026", () => {
    // 2025-12-31 ist ein Mittwoch → ISO-Woche 1/2026
    const d = new Date("2025-12-31T12:00:00Z");
    expect(isoWeekYear(d)).toBe(2026);
  });
});
