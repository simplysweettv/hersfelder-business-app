import { describe, it, expect } from "vitest";
import { findSizeViolation, SIZE_BRIEFING, SIZE_FACTS } from "../src/lib/sizes";
import { CONCEPT_FORMATS } from "../src/lib/concepts";

describe("findSizeViolation — Kindergrößen", () => {
  it("blockt Kindergrößen in jeder Schreibweise", () => {
    for (const t of [
      "Jetzt auch Kindergrößen im Sortiment.",
      "Unsere Kinder-Größen für den Nachwuchs.",
      "Kinderuniformen für die Jüngsten.",
      "Jugendgrößen ab sofort lieferbar.",
      "Größen für Kinder gibt es dazu.",
      "Vom Kind bis zum Ehrenvorstand.",
      "Auch für Kinder erhältlich.",
    ]) {
      expect(findSizeViolation(t), t).toBeTruthy();
    }
  });

  it("lässt Kinder als Festbesucher durch (kein Größen-Claim)", () => {
    expect(findSizeViolation("Kinder winken vom Straßenrand, Konfetti in der Luft.")).toBeNull();
    expect(findSizeViolation("Die Kinder klatschen, wenn der Zug vorbeikommt.")).toBeNull();
  });
});

describe("findSizeViolation — falsche Größenspanne", () => {
  it("blockt die durchgehende Spanne über beide Systeme", () => {
    for (const t of [
      "Größen 23 bis 70.",
      "Größen 23–70 zum gleichen Preis",
      "Wir liefern 23-70.",
      "Von 24 bis 68 alles da.",
    ]) {
      expect(findSizeViolation(t), t).toBeTruthy();
    }
  });

  it("erlaubt die korrekten Formulierungen", () => {
    for (const t of [
      "Normalgrößen 46–70 plus Kurzgrößen 23–34.",
      "Normal- und Kurzgrößen, ein Preis.",
      "Herrenhosen von 44 bis 70.",
      "Kurzgrößen 23 bis 34 für kräftigere Staturen.",
      "Damengrößen 30–60 für eure Damenkompanie.",
      "Die Damenweste gibt es in 30 bis 60.",
    ]) {
      expect(findSizeViolation(t), t).toBeNull();
    }
  });

  it("meldet auch Treffer weiter hinten im Text", () => {
    const caption = "Ein Verein, ein Auftritt.\n\nUnd das in Größen 23 bis 70.\n\n#hersfelder";
    expect(findSizeViolation(caption)).toContain("Größenspanne");
  });
});

describe("Marken-Konstanten bleiben sauber", () => {
  it("SIZE_BRIEFING enthält die geprüften Zahlen", () => {
    expect(SIZE_BRIEFING).toContain("46–70");
    expect(SIZE_BRIEFING).toContain("44–70");
    expect(SIZE_BRIEFING).toContain("23–34");
    expect(SIZE_BRIEFING).toContain("30–60");
    expect(SIZE_FACTS.herrenOberteile.normal[0]).toBe(46);
    expect(SIZE_FACTS.herrenhosen.normal[0]).toBe(44);
  });

  it("kein Konzept-Format behauptet eine falsche Größe", () => {
    for (const f of CONCEPT_FORMATS) {
      const texts = [
        f.brief,
        f.photoDirection,
        ...f.exampleHeadlines,
        ...(f.benefits ?? []).flatMap((b) => [b.title, b.text]),
        ...(f.footerNotes ?? []).map((n) => n.label),
        f.cta?.title ?? "",
        f.cta?.sub ?? "",
      ];
      for (const t of texts) {
        // Zwei Briefs zitieren die falschen Formulierungen bewusst — als Verbot
        // an die KI. Alles andere muss sauber sein.
        if (t.includes("NIEMALS als durchgehende Spanne") || t.includes("NIEMALS Kindergrößen")) continue;
        expect(findSizeViolation(t), `${f.code}: ${t}`).toBeNull();
      }
    }
  });
});
