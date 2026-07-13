import { describe, it, expect } from "vitest";
import { splitCaption, captionForPlatform, buildCaption } from "@/lib/caption";

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
    expect(captionForPlatform(raw, "facebook")).toBe("FB");
  });
  it("fällt auf Instagram zurück, wenn Plattform fehlt", () => {
    expect(captionForPlatform(raw, "tiktok")).toBe("IG");
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
