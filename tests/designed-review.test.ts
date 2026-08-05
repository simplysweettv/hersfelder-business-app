import { describe, it, expect } from "vitest";
import { qualityStatusFromGate } from "@/lib/designed-review";
import type { GateResult } from "@/lib/qa-gate";
import { renderedTextOf, type PosterContent } from "@/lib/render-poster";

function gate(over: Partial<GateResult> = {}): GateResult {
  return {
    pass: true,
    qa: { ok: true, problems: [], failArea: null, hardFail: false },
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
      qa: { ok: false, problems: ["Abgebrochener Satz in der Facebook-Caption"], failArea: "text", hardFail: true },
      score: 4,
    });
    expect(qualityStatusFromGate(g)).toBe("failed");
  });

  it("nur der Kreativ-Agent ist unzufrieden → warning (postbar, aber schwach)", () => {
    const g = gate({
      pass: false,
      qa: { ok: true, problems: [], failArea: null, hardFail: false },
      social: { wouldPost: false, score: 5, reasons: ["Kein Scroll-Stopp"] },
      score: 5,
    });
    expect(qualityStatusFromGate(g)).toBe("warning");
  });

  it("strittige Motiv-Anmerkung blockiert NICHT — nur Warnung", () => {
    // Der Motiv-Check urteilte in echten Läufen zu streng ("Slogan nicht im
    // Bild belegt"). Ohne hardFail darf er die Freigabe nicht blockieren.
    const g = gate({
      pass: false,
      qa: {
        ok: false,
        problems: ["Text sagt 'im Verein stark', im Bild nicht dargestellt"],
        failArea: "image",
        hardFail: false,
      },
      score: 6,
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

describe("renderedTextOf — was der QA-Agent im Bild sieht", () => {
  it("sammelt alle sichtbaren Zeilen ein", () => {
    const poster: PosterContent = {
      layout: "zentral-minimal",
      headline: ["Gemeinsam lachen,", "gemeinsam feiern."],
      scriptAccent: "Das ist Verein.",
      sub: "Drei, die zusammengehören.",
    };
    const text = renderedTextOf(poster);
    expect(text).toContain("Gemeinsam lachen,");
    expect(text).toContain("Das ist Verein.");
    expect(text).toContain("Drei, die zusammengehören.");
  });

  it("nimmt auch Benefit-Kacheln, CTA und Fußleiste mit", () => {
    const poster: PosterContent = {
      layout: "panel-cta",
      headline: ["Die Damenweste"],
      cta: { title: "Jetzt Muster anfordern", sub: "Für eure Damenkompanie." },
      features: [{ icon: "ruler", title: "Damengrößen 30–60", text: "alle zum gleichen Preis" }],
      footerNotes: [{ icon: "repeat", label: "Jederzeit nachbestellbar" }],
    };
    const text = renderedTextOf(poster);
    expect(text).toContain("Jetzt Muster anfordern");
    expect(text).toContain("Für eure Damenkompanie.");
    expect(text).toContain("Damengrößen 30–60");
    expect(text).toContain("alle zum gleichen Preis");
    expect(text).toContain("Jederzeit nachbestellbar");
  });

  it("leeres Plakat ergibt leeren String (kein 'undefined')", () => {
    expect(renderedTextOf({ layout: "zentral-minimal" })).toBe("");
  });
});
