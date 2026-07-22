import { describe, it, expect } from "vitest";
import { ensurePunct, fixHeadlineCasing } from "@/lib/designed-post";

describe("ensurePunct — Satzabschluss", () => {
  it("ergänzt fehlenden Punkt", () => {
    expect(ensurePunct("Die Erinnerungen leuchten")).toBe("Die Erinnerungen leuchten.");
  });
  it("lässt vorhandene Satzzeichen unangetastet", () => {
    expect(ensurePunct("Gemeinsam heute.")).toBe("Gemeinsam heute.");
    expect(ensurePunct("Wer kommt mit?")).toBe("Wer kommt mit?");
    expect(ensurePunct("Endlich!")).toBe("Endlich!");
  });
  it("liefert undefined für leere Eingabe", () => {
    expect(ensurePunct("")).toBeUndefined();
    expect(ensurePunct(undefined)).toBeUndefined();
  });
});

describe("fixHeadlineCasing — Groß-/Kleinschreibung an Zeilenfortsetzung", () => {
  it("macht falsch großgeschriebene Fortsetzung klein", () => {
    // „Ein Preis für / Alle Größen." → „… / alle Größen."
    expect(fixHeadlineCasing(["Ein Preis für", "Alle Größen."])).toEqual(["Ein Preis für", "alle Größen."]);
  });
  it("lässt die erste Zeile immer groß", () => {
    expect(fixHeadlineCasing(["Alle feiern mit."])).toEqual(["Alle feiern mit."]);
  });
  it("respektiert Satzende in der Vorzeile (dann bleibt groß)", () => {
    expect(fixHeadlineCasing(["Von 23 bis 70.", "Ein Preis für alle."])).toEqual([
      "Von 23 bis 70.",
      "Ein Preis für alle.",
    ]);
  });
  it("lässt echte Substantive/Anfänge unberührt", () => {
    // „Damenweste" ist Substantiv → bleibt groß
    expect(fixHeadlineCasing(["Die", "Damenweste"])).toEqual(["Die", "Damenweste"]);
  });
});
