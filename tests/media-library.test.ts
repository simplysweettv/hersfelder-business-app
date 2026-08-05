import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseMediaUsageMode,
  describeReferences,
  planPhotoSource,
  type MediaAsset,
} from "@/lib/media-library";
import { pickPosterLayout, PHOTO_SAFE_LAYOUTS, buildReferencePhotoPrompt } from "@/lib/designed-post";
import { conceptByCode } from "@/lib/concepts";

const asset = (over: Partial<MediaAsset> = {}): MediaAsset => ({
  id: "a1",
  storage_path: "a1.jpg",
  public_url: "https://example.test/a1.jpg",
  title: "Festumzug",
  description: "Mitglieder in dunkelgrünen Westen",
  lane: "both",
  usage: "both",
  active: true,
  mime: "image/jpeg",
  bytes: 1024,
  width: 1024,
  height: 1280,
  times_used: 0,
  last_used_at: null,
  created_at: "2026-08-01T10:00:00Z",
  ...over,
});

/**
 * Minimaler Supabase-Doppelgänger: liefert je nach `usage`-Filter eine feste
 * Kandidatenliste. Genug, um die Auswahl-Logik zu prüfen, ohne echte DB.
 */
function fakeSupabase(byUsage: { photo?: MediaAsset[]; reference?: MediaAsset[] }) {
  return {
    from() {
      let wanted: "photo" | "reference" = "photo";
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: (col: string, values: string[]) => {
          if (col === "usage") wanted = values[0] as "photo" | "reference";
          return chain;
        },
        order: () => chain,
        limit: () => Promise.resolve({ data: byUsage[wanted] ?? [], error: null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

describe("parseMediaUsageMode", () => {
  it("leer/unbekannt → Standard (echte Fotos + Referenz)", () => {
    expect(parseMediaUsageMode(null)).toBe("photo+reference");
    expect(parseMediaUsageMode("quatsch")).toBe("photo+reference");
  });
  it("bekannte Werte bleiben erhalten", () => {
    expect(parseMediaUsageMode("off")).toBe("off");
    expect(parseMediaUsageMode("reference")).toBe("reference");
  });
});

describe("planPhotoSource", () => {
  it("Modus aus → immer reine KI, ohne DB-Zugriff", async () => {
    const plan = await planPhotoSource(fakeSupabase({ photo: [asset()] }), {
      lane: "emotional",
      mode: "off",
    });
    expect(plan.mode).toBe("ai");
  });

  it("Modus reference nutzt nie ein echtes Foto direkt", async () => {
    const plan = await planPhotoSource(
      fakeSupabase({ photo: [asset({ id: "p1" })], reference: [asset({ id: "r1" })] }),
      { lane: "product", mode: "reference", random: () => 0 },
    );
    expect(plan.mode).toBe("ai-reference");
    expect(plan.assets.map((a) => a.id)).toEqual(["r1"]);
  });

  it("photo+reference: unter der Schwelle kommt das echte Foto", async () => {
    const plan = await planPhotoSource(
      fakeSupabase({ photo: [asset({ id: "p1" })], reference: [asset({ id: "r1" })] }),
      { lane: "emotional", mode: "photo+reference", photoShare: 0.6, random: () => 0.1 },
    );
    expect(plan.mode).toBe("library");
    expect(plan.assets[0].id).toBe("p1");
  });

  it("photo+reference: über der Schwelle dient das Bild nur als Referenz", async () => {
    const plan = await planPhotoSource(
      fakeSupabase({ photo: [asset({ id: "p1" })], reference: [asset({ id: "r1" })] }),
      { lane: "emotional", mode: "photo+reference", photoShare: 0.6, random: () => 0.9 },
    );
    expect(plan.mode).toBe("ai-reference");
  });

  it("leere Bibliothek → reine KI (kein Post ohne Bild)", async () => {
    const plan = await planPhotoSource(fakeSupabase({}), {
      lane: "product",
      mode: "photo+reference",
      random: () => 0.1,
    });
    expect(plan.mode).toBe("ai");
  });

  it("nur Referenzbilder vorhanden, Foto gewürfelt → fällt auf Referenz zurück", async () => {
    const plan = await planPhotoSource(fakeSupabase({ reference: [asset({ id: "r1" })] }), {
      lane: "product",
      mode: "photo+reference",
      random: () => 0.1,
    });
    expect(plan.mode).toBe("ai-reference");
  });
});

describe("describeReferences", () => {
  it("fasst Titel und Beschreibung als Prompt-Liste zusammen", () => {
    expect(describeReferences([asset()])).toBe(
      "- Festumzug — Mitglieder in dunkelgrünen Westen",
    );
  });
  it("ohne Texte bleibt der Baustein leer", () => {
    expect(describeReferences([asset({ title: null, description: null })])).toBe("");
  });
});

describe("Layout-Wahl bei echtem Foto", () => {
  it("liefert nur Layouts mit deckender Textfläche", () => {
    // Über viele Ziehungen darf nie ein Verlaufs-Layout herauskommen.
    for (const code of ["P1", "E1"]) {
      const format = conceptByCode(code);
      if (!format) continue;
      for (let i = 0; i < 50; i++) {
        const layout = pickPosterLayout(format, [], Math.random, PHOTO_SAFE_LAYOUTS);
        expect(PHOTO_SAFE_LAYOUTS).toContain(layout);
      }
    }
  });

  it("ohne Einschränkung bleibt die Format-Auswahl unangetastet", () => {
    const format = conceptByCode("P1");
    if (!format) return;
    const layout = pickPosterLayout(format, [], () => 0);
    expect(format.layouts).toContain(layout);
  });
});

describe("buildReferencePhotoPrompt", () => {
  it("verbietet das Kopieren von Gesichtern und behält den Basis-Prompt", () => {
    const prompt = buildReferencePhotoPrompt("SZENE", "- Festumzug");
    expect(prompt).toContain("SZENE");
    expect(prompt).toContain("- Festumzug");
    expect(prompt.toLowerCase()).toContain("do not copy");
  });
});
