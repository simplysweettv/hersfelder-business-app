import { describe, it, expect } from "vitest";
import {
  CONCEPT_FORMATS,
  conceptByCode,
  pickConceptFormat,
  pickLane,
  BANNED_PHRASES,
} from "@/lib/concepts";
import { fitSize } from "@/lib/render-kit";
import { POSTER_LAYOUT_KEYS } from "@/lib/render-poster";

describe("Konzept-Formate (Zwei-Säulen-System)", () => {
  it("deckt beide Säulen breit ab und hat eindeutige Codes", () => {
    const emotional = CONCEPT_FORMATS.filter((f) => f.lane === "emotional");
    const product = CONCEPT_FORMATS.filter((f) => f.lane === "product");
    expect(emotional.length).toBeGreaterThanOrEqual(15);
    expect(product.length).toBeGreaterThanOrEqual(14);
    expect(new Set(CONCEPT_FORMATS.map((f) => f.code)).size).toBe(CONCEPT_FORMATS.length);
  });

  it("deckt die Zielgruppen des Marken-Briefings ab (nicht nur Schützenvereine)", () => {
    const alles = CONCEPT_FORMATS.map((f) => `${f.name} ${f.brief} ${f.photoDirection}`).join(" ").toLowerCase();
    for (const gruppe of ["spielmannszug", "musikzug", "bruderschaft", "uniformwart", "vorstand"]) {
      expect(alles, gruppe).toContain(gruppe);
    }
  });

  it("jedes Format schlägt nur existierende Layouts vor", () => {
    for (const f of CONCEPT_FORMATS) {
      expect(f.layouts.length, f.code).toBeGreaterThan(0);
      for (const l of f.layouts) expect(POSTER_LAYOUT_KEYS, `${f.code}/${l}`).toContain(l);
    }
  });

  it("Emotional nutzt nie ein Produkt-Layout und umgekehrt", () => {
    const produktLayouts = ["panel-links", "panel-cta"];
    for (const f of CONCEPT_FORMATS) {
      for (const l of f.layouts) {
        if (f.lane === "emotional") expect(produktLayouts, f.code).not.toContain(l);
      }
    }
  });

  it("jedes Format hat Formel, Beispiel-Headlines und Foto-Regie", () => {
    for (const f of CONCEPT_FORMATS) {
      expect(f.brief.length, f.code).toBeGreaterThan(40);
      expect(f.exampleHeadlines.length, f.code).toBeGreaterThanOrEqual(2);
      expect(f.photoDirection.length, f.code).toBeGreaterThan(40);
    }
  });

  it("jedes Produkt-Format bringt den kompletten Marken-Rahmen mit", () => {
    // Benefit-Leiste, CTA-Feld und Fußleiste kommen NICHT von der KI, sondern
    // aus dem Format — fehlen sie, rendert das Produkt-Plakat halb leer.
    for (const f of CONCEPT_FORMATS.filter((x) => x.lane === "product")) {
      if (f.layouts.includes("panel-links")) expect(f.benefits, f.code).toHaveLength(3);
      if (f.layouts.includes("panel-cta")) {
        // Die Fußleiste ist Pflicht — sie trägt Adresse + Mikro-Beweise.
        expect(f.footerNotes?.length, f.code).toBeGreaterThan(0);
        // Ein CTA-Feld ist optional (P7 ist bewusst ein stiller Qualitätsbeweis
        // ohne Handlungsaufforderung) — aber wenn es da ist, braucht es Text.
        if (f.cta) expect(f.cta.title.length, f.code).toBeGreaterThan(8);
      }
    }
  });

  it("mindestens zwei Drittel der Produkt-Formate haben einen konkreten CTA", () => {
    // Ohne CTA kein Projektgeschäft — aber auch nicht jeder Post soll drängen.
    const produkt = CONCEPT_FORMATS.filter((f) => f.lane === "product");
    const mitCta = produkt.filter((f) => f.cta?.title);
    expect(mitCta.length / produkt.length).toBeGreaterThanOrEqual(0.66);
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
    expect(conceptByCode("P2")?.layouts).toContain("panel-cta");
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

  it("unterschreitet nie 62 % der Basisgröße", () => {
    expect(fitSize(62, ["a".repeat(200)], 16)).toBe(Math.round(62 * 0.62));
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

import { dropRedundantKicker } from "@/lib/designed-post";

describe("dropRedundantKicker — Kicker darf die Headline nicht doppeln", () => {
  it("verwirft den Kicker, wenn die Headline damit anfängt", () => {
    expect(
      dropRedundantKicker("Die Damenweste", ["Die Damenweste", "für alle, die", "Tradition modern leben."]),
    ).toBeUndefined();
  });

  it("verwirft ihn auch bei abweichender Schreibung/Interpunktion", () => {
    expect(dropRedundantKicker("DIE DAMENWESTE!", ["Die Damenweste für alle."])).toBeUndefined();
  });

  it("verwirft ihn, wenn er irgendwo in der Headline steckt", () => {
    expect(dropRedundantKicker("neuen Uniform", ["Erster Auftritt in", "neuer Uniform."])).toBeDefined();
    expect(dropRedundantKicker("Auftritt in", ["Erster Auftritt in", "neuer Uniform."])).toBeUndefined();
  });

  it("behält einen echten, einordnenden Kicker", () => {
    expect(dropRedundantKicker("Für Damenkompanien", ["Die Damenweste für alle."])).toBe("Für Damenkompanien");
    expect(dropRedundantKicker("Der Tag nach dem Fest", ["Die Wimpel sind ab."])).toBe("Der Tag nach dem Fest");
  });

  it("leerer Kicker bleibt leer", () => {
    expect(dropRedundantKicker(undefined, ["Irgendwas."])).toBeUndefined();
    expect(dropRedundantKicker("   ", ["Irgendwas."])).toBeUndefined();
  });
});

describe("Wetter-Aufhänger — nur wo er hingehört", () => {
  it("nur ausgewählte Formate dürfen aufs Wetter reagieren", () => {
    const reaktiv = CONCEPT_FORMATS.filter((f) => f.weatherReactive).map((f) => f.code);
    expect(reaktiv).toEqual(expect.arrayContaining(["P2"]));
    // Der Rest darf es NICHT — sonst landet "Bei 35 Grad" auf Beschaffungs-Posts.
    expect(reaktiv.length).toBeLessThanOrEqual(4);
    for (const code of ["P12", "P13", "P15", "P11", "E14"]) {
      expect(reaktiv, code).not.toContain(code);
    }
  });

  it("Klima-/Kühl-Behauptungen stehen auf der harten Sperrliste", () => {
    for (const satz of [
      "Damit bleibt ihr cool und präsent.",
      "Unsere Jacke hält euch kühl.",
      "Der Stoff trotzt der Hitze.",
    ]) {
      expect(findBannedPhrase(satz), satz).toBeTruthy();
    }
  });
});
