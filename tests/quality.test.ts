import { describe, it, expect } from "vitest";
import {
  findForbiddenClaims,
  qualityStatusFrom,
  approvalGate,
} from "@/lib/quality";
import type { Platform } from "@/types";

const base = {
  image_url: "https://x/img.jpg" as string | null,
  caption: "---INSTAGRAM---\nSchöner Vereinsabend." as string | null,
  platforms: ["instagram"] as Platform[],
  scheduled_at: new Date(Date.now() + 3_600_000).toISOString() as string | null,
  quality_score: 9 as number | null,
  quality_notes: [] as string[] | null,
  quality_status: "passed" as
    | "passed"
    | "warning"
    | "failed"
    | "not_checked"
    | null,
};

describe("findForbiddenClaims", () => {
  it("findet verbotene Maßschneiderei-Claims", () => {
    expect(findForbiddenClaims("Unsere maßgeschneiderte Uniform")).toContain(
      "maßgeschneidert",
    );
  });
  it("findet unbelegte Technik-Claims", () => {
    expect(findForbiddenClaims("besonders atmungsaktiv")).toContain("atmungsaktiv");
  });
  it("sauberer Text = leer", () => {
    expect(findForbiddenClaims("Ein schöner Vereinsabend.")).toEqual([]);
  });
});

describe("qualityStatusFrom", () => {
  it("technischer Prüf-Fehler → not_checked", () => {
    expect(
      qualityStatusFrom({ checked: false, score: 0, captionOk: true, imageOk: true, issues: [] }),
    ).toBe("not_checked");
  });
  it("hohe Note ohne Mängel → passed", () => {
    expect(
      qualityStatusFrom({ checked: true, score: 9, captionOk: true, imageOk: true, issues: [] }),
    ).toBe("passed");
  });
  it("niedrige Note → failed", () => {
    expect(
      qualityStatusFrom({ checked: true, score: 3, captionOk: true, imageOk: true, issues: ["x"] }),
    ).toBe("failed");
  });
  it("mittlere Note → warning", () => {
    expect(
      qualityStatusFrom({ checked: true, score: 7, captionOk: true, imageOk: true, issues: ["x"] }),
    ).toBe("warning");
  });
});

describe("approvalGate", () => {
  it("sauberer Post: keine Blocker", () => {
    const g = approvalGate(base);
    expect(g.hardBlockers).toEqual([]);
    expect(g.blockers).toEqual([]);
  });
  it("fehlendes Bild ist ein harter Blocker", () => {
    const g = approvalGate({ ...base, image_url: null });
    expect(g.hardBlockers.length).toBeGreaterThan(0);
  });
  it("verbotener Claim → Blocker (Override nötig)", () => {
    const g = approvalGate({ ...base, caption: "maßgeschneiderte Jacke" });
    expect(g.blockers.join(" ")).toMatch(/Claim/i);
  });
  it("failed-Status → Blocker", () => {
    const g = approvalGate({ ...base, quality_status: "failed" });
    expect(g.blockers.length).toBeGreaterThan(0);
  });
  it("not_checked → Blocker", () => {
    const g = approvalGate({ ...base, quality_status: "not_checked" });
    expect(g.blockers.length).toBeGreaterThan(0);
  });
  it("vergangener Termin → Blocker (würde sofort posten)", () => {
    const g = approvalGate({
      ...base,
      scheduled_at: new Date(Date.now() - 3_600_000).toISOString(),
    });
    expect(g.blockers.join(" ")).toMatch(/vorbei|sofort/i);
  });
});
