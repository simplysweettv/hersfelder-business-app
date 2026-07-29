import { describe, it, expect } from "vitest";
import { qualityStatusFromGate, renderedTextOfOverlay } from "@/lib/designed-review";
import type { GateResult } from "@/lib/qa-gate";
import type { OverlayContent } from "@/lib/render-post";

function gate(over: Partial<GateResult> = {}): GateResult {
  return {
    pass: true,
    qa: { ok: true, problems: [], failArea: null },
    social: { wouldPost: true, score: 9, reasons: [] },
    score: 9,
    notes: [],
    failArea: null,
    ...over,
  };
}

describe("qualityStatusFromGate", () => {
  it("beide Agenten frei → passed", () => {
    expect(qualityStatusFromGate(gate())).toBe("passed");
  });

  it("QA findet einen echten Mangel → failed (blockiert die Freigabe)", () => {
    const g = gate({
      pass: false,
      qa: { ok: false, problems: ["Bild zeigt drei Personen, Text spricht von zwei"], failArea: "image" },
      score: 4,
    });
    expect(qualityStatusFromGate(g)).toBe("failed");
  });

  it("nur der Kreativ-Agent ist unzufrieden → warning (postbar, aber schwach)", () => {
    const g = gate({
      pass: false,
      qa: { ok: true, problems: [], failArea: null },
      social: { wouldPost: false, score: 5, reasons: ["Kein Scroll-Stopp"] },
      score: 5,
    });
    expect(qualityStatusFromGate(g)).toBe("warning");
  });

  it("Social-Score knapp unter der Schwelle → warning, nicht failed", () => {
    const g = gate({
      pass: false,
      social: { wouldPost: true, score: 6, reasons: ["etwas beliebig"] },
      score: 6,
    });
    expect(qualityStatusFromGate(g)).toBe("warning");
  });
});

describe("renderedTextOfOverlay", () => {
  it("sammelt alle sichtbaren Zeilen ein", () => {
    const overlay: OverlayContent = {
      template: "emotional-minimal",
      headline: ["Gemeinsam lachen,", "gemeinsam feiern."],
      scriptLine: "Das ist Verein.",
      subline: "Drei, die zusammengehören.",
    };
    const text = renderedTextOfOverlay(overlay);
    expect(text).toContain("Gemeinsam lachen,");
    expect(text).toContain("Das ist Verein.");
    expect(text).toContain("Drei, die zusammengehören.");
  });

  it("nimmt auch Benefit-Kacheln und CTA mit", () => {
    const overlay: OverlayContent = {
      template: "product-feature",
      headline: ["Die Damenweste"],
      cta: "Jetzt Muster anfordern",
      features: [
        { icon: "ruler", title: "Größen 23–70", text: "alle zum gleichen Preis" },
      ],
    };
    const text = renderedTextOfOverlay(overlay);
    expect(text).toContain("Jetzt Muster anfordern");
    expect(text).toContain("Größen 23–70");
    expect(text).toContain("alle zum gleichen Preis");
  });

  it("leeres Overlay ergibt leeren String (kein 'undefined')", () => {
    expect(renderedTextOfOverlay({ template: "emotional-minimal" })).toBe("");
  });
});
