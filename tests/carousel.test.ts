import { describe, it, expect } from "vitest";
import { buildCarouselSlides, CAROUSEL_COVER_LAYOUTS, type RawCarouselStory } from "@/lib/carousel-post";
import { slideTextOf } from "@/lib/render-carousel";
import type { ConceptFormat } from "@/lib/concepts";

const emotional: ConceptFormat = {
  code: "E-TEST",
  lane: "emotional",
  name: "Testformat",
  layouts: ["karte-unten"],
  brief: "",
  exampleHeadlines: [],
  photoDirection: "",
};

const product: ConceptFormat = {
  ...emotional,
  code: "P-TEST",
  lane: "product",
  cta: { title: "Eigener CTA", sub: "Eigene Unterzeile." },
  benefits: [
    { icon: "ruler", title: "Eigener Nutzen", text: "…" },
    { icon: "euro", title: "Zweiter Nutzen", text: "…" },
    { icon: "repeat", title: "Dritter Nutzen", text: "…" },
  ],
};

const raw: RawCarouselStory = {
  points: [
    { icon: "users", kicker: "Der Anfang", heading: ["Erst kommt", "die Idee"], body: "Ein ganzer Verein einigt sich auf einen Auftritt" },
    { icon: "ruler", heading: ["Dann wird gemessen"], body: "Ein Musterset reicht" },
    { icon: "repeat", heading: ["Und dann bleibt es"], body: "Auch in fünf Jahren" },
  ],
  outro: { heading: ["Ein Auftritt", "ein Verein"], scriptAccent: "Bis zum Fest" },
};

describe("buildCarouselSlides", () => {
  it("nummeriert die Inhalts-Slides fortlaufend und hängt genau eine Abschluss-Slide an", () => {
    const slides = buildCarouselSlides(raw, emotional);
    expect(slides).toHaveLength(4);
    expect(slides.slice(0, 3).map((s) => (s.kind === "punkt" ? s.number : null))).toEqual([1, 2, 3]);
    expect(slides.at(-1)?.kind).toBe("abschluss");
  });

  it("schließt jede Headline und jeden Fließtext mit einem Satzzeichen ab", () => {
    const slides = buildCarouselSlides(raw, emotional);
    for (const s of slides) {
      const last = s.kind === "punkt" ? s.heading.at(-1) : s.heading.at(-1);
      expect(last).toMatch(/[.!?…]$/);
      if (s.kind === "punkt" && s.body) expect(s.body).toMatch(/[.!?…]$/);
    }
  });

  it("nimmt CTA und Beweis-Trio aus dem Format — nicht von der KI", () => {
    const withOwn = buildCarouselSlides({ ...raw, outro: { ...raw.outro, ctaTitle: "KI-CTA" } }, product);
    const outro = withOwn.at(-1);
    expect(outro?.kind).toBe("abschluss");
    if (outro?.kind !== "abschluss") return;
    expect(outro.cta.title).toBe("Eigener CTA");
    expect(outro.benefits?.[0].title).toBe("Eigener Nutzen");
  });

  it("fällt bei fehlendem Format-CTA auf den Marken-Standard zurück", () => {
    const outro = buildCarouselSlides(raw, emotional).at(-1);
    if (outro?.kind !== "abschluss") throw new Error("keine Abschluss-Slide");
    expect(outro.cta.title).toMatch(/Musterkollektion/);
    expect(outro.benefits).toHaveLength(3);
    expect(outro.url).toBe("schuetzen-ausstatter.de");
  });

  it("wirft unbrauchbare Punkte weg, statt leere Slides zu rendern", () => {
    const slides = buildCarouselSlides(
      { points: [{ heading: [] }, { heading: ["Bleibt drin"] }], outro: raw.outro },
      emotional,
    );
    expect(slides.filter((s) => s.kind === "punkt")).toHaveLength(1);
  });

  it("deckelt die Inhalts-Slides bei 5", () => {
    const many = { ...raw, points: Array.from({ length: 9 }, (_, i) => ({ heading: [`Punkt ${i}`] })) };
    expect(buildCarouselSlides(many, emotional).filter((s) => s.kind === "punkt")).toHaveLength(5);
  });

  it("hält die Zeilen im Zeichen-Budget (sonst kippt das Layout)", () => {
    const lang = {
      points: [{ heading: ["Eine viel zu lange Zeile die niemals in das Layout passen wird"], body: "x".repeat(400) }],
      outro: raw.outro,
    };
    const punkt = buildCarouselSlides(lang, emotional)[0];
    if (punkt.kind !== "punkt") throw new Error("keine Punkt-Slide");
    expect(punkt.heading[0].length).toBeLessThanOrEqual(22);
    expect(punkt.body!.length).toBeLessThanOrEqual(166);
  });

  it("slideTextOf liefert alle sichtbaren Zeilen fürs QA-Gate", () => {
    const slides = buildCarouselSlides(raw, product);
    const text = slideTextOf(slides[0]);
    expect(text).toContain("Der Anfang");
    expect(text).toContain("Erst kommt");
  });
});

describe("CAROUSEL_COVER_LAYOUTS", () => {
  it("enthält nur Statement-Layouts — Benefit-Leiste und CTA gehören ans Ende", () => {
    expect([...CAROUSEL_COVER_LAYOUTS].sort()).toEqual(["band-unten", "karte-unten", "zentral-minimal"]);
  });
});
