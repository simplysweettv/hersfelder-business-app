import { describe, it, expect } from "vitest";
import {
  splitCaption,
  captionForPlatform,
  rawCaptionForPlatform,
  buildCaption,
  withAiDisclosure,
  hasAiDisclosure,
  AI_DISCLOSURE,
} from "@/lib/caption";

describe("splitCaption", () => {
  it("parst alle Plattform-Abschnitte", () => {
    const raw = `---INSTAGRAM---
IG-Text

---FACEBOOK---
FB-Text

---TIKTOK---
TT-Text

---LINKEDIN---
LI-Text`;
    const r = splitCaption(raw);
    expect(r.instagram).toBe("IG-Text");
    expect(r.facebook).toBe("FB-Text");
    expect(r.tiktok).toBe("TT-Text");
    expect(r.linkedin).toBe("LI-Text");
  });

  it("behandelt Text ohne Trenner als Instagram", () => {
    const r = splitCaption("Nur ein Satz.");
    expect(r.instagram).toBe("Nur ein Satz.");
    expect(r.facebook).toBeUndefined();
  });

  it("gibt für leere Caption ein leeres Objekt", () => {
    expect(splitCaption("")).toEqual({});
  });
});

describe("captionForPlatform", () => {
  const raw = `---INSTAGRAM---\nIG\n\n---FACEBOOK---\nFB`;
  it("liefert den plattformspezifischen Text", () => {
    expect(rawCaptionForPlatform(raw, "facebook")).toBe("FB");
  });
  it("fällt auf Instagram zurück, wenn Plattform fehlt", () => {
    expect(rawCaptionForPlatform(raw, "tiktok")).toBe("IG");
  });
  it("hängt die KI-Kennzeichnung auf jeder Plattform an", () => {
    for (const p of ["instagram", "facebook", "tiktok", "linkedin"] as const) {
      expect(captionForPlatform(raw, p).endsWith(AI_DISCLOSURE)).toBe(true);
    }
  });
});

describe("KI-Kennzeichnung", () => {
  it("hängt den Hinweis ans Ende — nach den Hashtags", () => {
    const out = withAiDisclosure("Text\n\n#hersfelder #schützenfest");
    expect(out).toBe(`Text\n\n#hersfelder #schützenfest\n\n${AI_DISCLOSURE}`);
  });

  it("ist idempotent — kein doppelter Hinweis", () => {
    expect(withAiDisclosure(withAiDisclosure("Text"))).toBe(withAiDisclosure("Text"));
  });

  it("erkennt selbst formulierte Kennzeichnungen", () => {
    expect(hasAiDisclosure("Dieses Bild wurde mit KI erstellt.")).toBe(true);
    expect(hasAiDisclosure("Foto: KI-generiert")).toBe(true);
    expect(hasAiDisclosure("Ein ganz normaler Post.")).toBe(false);
    expect(withAiDisclosure("Post. Bild KI-generiert.")).toBe("Post. Bild KI-generiert.");
  });

  it("lässt leeren Text leer", () => {
    expect(withAiDisclosure("")).toBe("");
    expect(withAiDisclosure("   ")).toBe("");
  });
});

describe("buildCaption / round-trip", () => {
  it("baut Trenner-String und splitCaption ergibt dasselbe zurück", () => {
    const parts = { instagram: "A", facebook: "B", tiktok: "C" };
    const built = buildCaption(parts);
    expect(splitCaption(built)).toMatchObject(parts);
  });
  it("überspringt leere Werte", () => {
    const built = buildCaption({ instagram: "A", facebook: "  " });
    expect(built).toContain("INSTAGRAM");
    expect(built).not.toContain("FACEBOOK");
  });
});
