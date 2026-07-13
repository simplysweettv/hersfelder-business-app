import { describe, it, expect } from "vitest";
import { parsePostingPlan, DEFAULT_PLAN, PLAN_PRESETS } from "@/lib/posting-plan";

describe("parsePostingPlan", () => {
  it("leer/null → Default (aktiv, 4 Slots)", () => {
    expect(parsePostingPlan(null).mode).toBe("aktiv");
    expect(parsePostingPlan("").slots.length).toBe(4);
  });
  it("Preset-Modus liefert die Preset-Slots", () => {
    expect(parsePostingPlan(JSON.stringify({ mode: "ruhig" })).slots).toEqual(
      PLAN_PRESETS.ruhig,
    );
    expect(parsePostingPlan(JSON.stringify({ mode: "normal" })).slots.length).toBe(3);
  });
  it("kaputtes JSON → Default (wirft nicht)", () => {
    expect(parsePostingPlan("{nicht valide")).toEqual(DEFAULT_PLAN);
  });
  it("unbekannter Modus → Default", () => {
    expect(parsePostingPlan(JSON.stringify({ mode: "turbo" }))).toEqual(DEFAULT_PLAN);
  });
  it("individuell: filtert ungültige Slots weg", () => {
    const plan = parsePostingPlan(
      JSON.stringify({
        mode: "individuell",
        slots: [
          { weekday: 3, hour: 19, minute: 0, platforms: ["instagram"], imageSize: "1024x1536" },
          { weekday: 9, hour: 5 }, // ungültiger Wochentag → verworfen
        ],
      }),
    );
    expect(plan.mode).toBe("individuell");
    expect(plan.slots.length).toBe(1);
  });
  it("individuell ohne gültige Slots → Default", () => {
    const plan = parsePostingPlan(JSON.stringify({ mode: "individuell", slots: [] }));
    expect(plan).toEqual(DEFAULT_PLAN);
  });
});
