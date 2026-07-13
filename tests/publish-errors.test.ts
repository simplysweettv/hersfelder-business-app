import { describe, it, expect } from "vitest";
import { classifyPublishError, nextRetryAt } from "@/lib/publishers/errors";

describe("classifyPublishError", () => {
  it("reauth-Flag → reauth", () => {
    expect(classifyPublishError("kein Konto", true)).toBe("reauth");
  });
  it("Netzwerk/Timeout → transient", () => {
    expect(classifyPublishError("fetch failed: network timeout")).toBe("transient");
    expect(classifyPublishError("HTTP 503 unavailable")).toBe("transient");
    expect(classifyPublishError("Too Many Requests")).toBe("transient");
  });
  it("Format/zu lang/4xx → permanent", () => {
    expect(classifyPublishError("Caption too long")).toBe("permanent");
    expect(classifyPublishError("nicht unterstütztes Bildformat")).toBe("permanent");
    expect(classifyPublishError("HTTP 400 bad request")).toBe("permanent");
  });
  it("unbekannt → transient (lieber Retry als liegenbleiben)", () => {
    expect(classifyPublishError("irgendein seltsamer Fehler")).toBe("transient");
  });
});

describe("nextRetryAt", () => {
  const now = new Date("2026-07-15T12:00:00Z");
  it("permanent/reauth → kein Retry", () => {
    expect(nextRetryAt("permanent", 1, now)).toBeNull();
    expect(nextRetryAt("reauth", 1, now)).toBeNull();
  });
  it("transient: Backoff steigt (5min → 15min)", () => {
    const first = nextRetryAt("transient", 1, now)!;
    const second = nextRetryAt("transient", 2, now)!;
    expect(first.getTime() - now.getTime()).toBe(5 * 60_000);
    expect(second.getTime() - now.getTime()).toBe(15 * 60_000);
  });
  it("transient: deckelt bei der letzten Stufe (24h)", () => {
    const late = nextRetryAt("transient", 99, now)!;
    expect(late.getTime() - now.getTime()).toBe(1440 * 60_000);
  });
});
