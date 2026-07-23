import { describe, it, expect } from "vitest";
import {
  CONCEPT_FORMATS,
  conceptByCode,
  pickConceptFormat,
  pickLane,
  BANNED_PHRASES,
} from "@/lib/concepts";
import { fitSize } from "@/lib/render-post";

describe("Konzept-Formate (Zwei-Säulen-System)", () => {
  it("hat 10 emotionale und 10 Produkt-Formate mit eindeutigen Codes", () => {
    const emotional = CONCEPT_FORMATS.filter((f) => f.lane === "emotional");
    const product = CONCEPT_FORMATS.filter((f) => f.lane === "product");
    expect(emotional).toHaveLength(10);
    expect(product).toHaveLength(10);
    expect(new Set(CONCEPT_FORMATS.map((f) => f.code)).size).toBe(20);
  });

  it("jedes Format hat Formel, Beispiel-Headlines und Foto-Regie", () => {
    for (const f of CONCEPT_FORMATS) {
      expect(f.brief.length, f.code).toBeGreaterThan(40);
      expect(f.exampleHeadlines.length, f.code).toBeGreaterThanOrEqual(2);
      expect(f.photoDirection.length, f.code).toBeGreaterThan(40);
    }
  });

  it("Produkt-Formate im Feature-Template haben genau 3 Benefits", () => {
    for (const f of CONCEPT_FORMATS.filter((x) => x.template === "product-feature")) {
      expect(f.benefits, f.code).toHaveLength(3);
      expect(f.cta, f.code).toBeTruthy();
    }
  });

  it("keine Beispiel-Headline enthält eine verbotene Floskel", () => {
    for (const f of CONCEPT_FORMATS) {
      for (const h of f.exampleHeadlines) {
        for (const banned of BANNED_PHRASES) {
          expect(h.toLowerCase()).not.toContain(banned.toLowerCase());
        }
      }
    }
  });

  it("conceptByCode findet Formate", () => {
    expect(conceptByCode("E1")?.name).toBe("Rückenbild");
    expect(conceptByCode("P2")?.template).toBe("product-reactive");
    expect(conceptByCode("X9")).toBeUndefined();
  });
});

describe("pickConceptFormat — Rotation + Saison", () => {
  it("respektiert die Lane", () => {
    for (let i = 0; i < 20; i++) {
      expect(pickConceptFormat({ lane: "product" }).lane).toBe("product");
      expect(pickConceptFormat({ lane: "emotional" }).lane).toBe("emotional");
    }
  });

  it("meidet kürzlich genutzte Codes", () => {
    const avoid = ["E1", "E2", "E3", "E4"];
    for (let i = 0; i < 30; i++) {
      const f = pickConceptFormat({ lane: "emotional", avoidCodes: avoid });
      expect(avoid).not.toContain(f.code);
    }
  });

  it("bevorzugt Formate im Saison-Fenster", () => {
    // Dezember: E4 (Vorfreude, Okt–Feb) ist im Fenster, E3 (Moment danach, Mai–Sep) nicht
    for (let i = 0; i < 30; i++) {
      const f = pickConceptFormat({ lane: "emotional", month: 12 });
      expect(f.months === undefined || f.months.includes(12), f.code).toBe(true);
    }
  });

  it("fällt weich zurück, wenn alle Codes gemieden würden", () => {
    const all = CONCEPT_FORMATS.filter((f) => f.lane === "product").map((f) => f.code);
    const f = pickConceptFormat({ lane: "product", avoidCodes: all });
    expect(f.lane).toBe("product");
  });

  it("ist mit injiziertem Zufall deterministisch", () => {
    const a = pickConceptFormat({ lane: "emotional", random: () => 0 });
    const b = pickConceptFormat({ lane: "emotional", random: () => 0 });
    expect(a.code).toBe(b.code);
  });
});

describe("pickLane — 60:40-Mix ohne Produkt-Doppel", () => {
  it("nach einem Produkt-Post kommt IMMER emotional", () => {
    for (let i = 0; i < 30; i++) {
      expect(pickLane({ previousLane: "product" })).toBe("emotional");
    }
  });

  it("Zufall < 0.4 → product, sonst emotional", () => {
    expect(pickLane({ previousLane: "emotional", random: () => 0.39 })).toBe("product");
    expect(pickLane({ previousLane: "emotional", random: () => 0.4 })).toBe("emotional");
    expect(pickLane({ previousLane: null, random: () => 0.1 })).toBe("product");
  });
});

describe("fitSize — Zeichenbudget", () => {
  it("lässt die Basisgröße innerhalb des Budgets unangetastet", () => {
    expect(fitSize(62, ["kurz"], 16)).toBe(62);
  });

  it("skaliert proportional herunter bei Überlänge", () => {
    // 20 Zeichen bei Budget 16 → 62 * 16/20 = 49.6 → 50
    expect(fitSize(62, ["a".repeat(20)], 16)).toBe(50);
  });

  it("unterschreitet nie 68 % der Basisgröße", () => {
    expect(fitSize(62, ["a".repeat(200)], 16)).toBe(Math.round(62 * 0.68));
  });
});

import { findBannedPhrase } from "@/lib/designed-post";

describe("findBannedPhrase — harte Floskel-Sperre", () => {
  it("findet verbotene Floskel case-insensitiv im Fließtext", () => {
    expect(findBannedPhrase("Heute feiern wir. Gemeinsam feiern wir die Tage.")).toBeTruthy();
    expect(findBannedPhrase("... tradition verbindet uns ...")).toBeTruthy();
  });
  it("gibt null zurück, wenn keine Floskel enthalten ist", () => {
    expect(findBannedPhrase("Ein ruhiger Morgen nach dem Fest, die Wimpel eingerollt.")).toBeNull();
  });
});

describe("pickLane — selbstlernende Gewichtung (mit Explorations-Grenze)", () => {
  it("verschiebt Richtung Produkt, wenn Produkt besser performt — gedeckelt auf 50%", () => {
    const m = { emotional: 0.5, product: 2 }; // Produkt läuft stark → pProduct → 0.5 (Deckel)
    expect(pickLane({ previousLane: null, laneMult: m, random: () => 0.49 })).toBe("product");
    expect(pickLane({ previousLane: null, laneMult: m, random: () => 0.51 })).toBe("emotional");
  });
  it("bleibt bei emotional-Übergewicht min. 25% Produkt (Explorations-Untergrenze)", () => {
    const m = { emotional: 2, product: 0.5 }; // emotional stark → pProduct → 0.25 (Boden)
    expect(pickLane({ previousLane: null, laneMult: m, random: () => 0.24 })).toBe("product");
    expect(pickLane({ previousLane: null, laneMult: m, random: () => 0.26 })).toBe("emotional");
  });
  it("nach Produkt-Post immer emotional — Lernen überschreibt das nicht", () => {
    expect(pickLane({ previousLane: "product", laneMult: { emotional: 0.1, product: 9 } })).toBe("emotional");
  });
  it("ohne Lernen-Daten bleibt der 60/40-Basis-Mix", () => {
    expect(pickLane({ previousLane: null, laneMult: null, random: () => 0.39 })).toBe("product");
    expect(pickLane({ previousLane: null, laneMult: null, random: () => 0.4 })).toBe("emotional");
  });
});

describe("pickConceptFormat — Performance-Gewichtung", () => {
  it("liefert weiterhin ein Format der richtigen Lane und respektiert Mult", () => {
    for (let i = 0; i < 20; i++) {
      const f = pickConceptFormat({
        lane: "product",
        formatMult: { P1: 2, P2: 0.5 },
        random: Math.random,
      });
      expect(f.lane).toBe("product");
    }
  });
  it("kein Format fällt ganz raus (Explorations-Untergrenze), auch mit Mult 0", () => {
    const f = pickConceptFormat({ lane: "emotional", formatMult: { E1: 0, E2: 0, E3: 0 }, random: () => 0.99 });
    expect(f.lane).toBe("emotional");
  });
});
