import { describe, it, expect } from "vitest";
import { derivePostStatus } from "@/lib/publishers/publish";
import type { Platform } from "@/types";

const P: Platform[] = ["instagram", "facebook"];

describe("derivePostStatus", () => {
  it("alle success + immediate → published", () => {
    const m = new Map<Platform, string>([
      ["instagram", "success"],
      ["facebook", "success"],
    ]);
    expect(derivePostStatus(P, m, "immediate")).toBe("published");
  });
  it("alle success + schedule → scheduled", () => {
    const m = new Map<Platform, string>([
      ["instagram", "success"],
      ["facebook", "success"],
    ]);
    expect(derivePostStatus(P, m, "schedule")).toBe("scheduled");
  });
  it("ein failed → failed (hat Vorrang)", () => {
    const m = new Map<Platform, string>([
      ["instagram", "success"],
      ["facebook", "failed"],
    ]);
    expect(derivePostStatus(P, m, "immediate")).toBe("failed");
  });
  it("skipped zählt wie erfolgreich (nicht verbunden blockiert nicht)", () => {
    const m = new Map<Platform, string>([
      ["instagram", "success"],
      ["facebook", "skipped"],
    ]);
    expect(derivePostStatus(P, m, "immediate")).toBe("published");
  });
  it("noch pending → scheduled (nicht published)", () => {
    const m = new Map<Platform, string>([
      ["instagram", "success"],
      ["facebook", "pending"],
    ]);
    expect(derivePostStatus(P, m, "immediate")).toBe("scheduled");
  });
});
