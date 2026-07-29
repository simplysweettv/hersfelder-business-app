import { describe, it, expect } from "vitest";
import { postHealth, type PublicationLike } from "@/lib/post-health";
import type { Platform, Post } from "@/types";

const NOW = new Date("2026-07-29T12:00:00Z");
const FUTURE = "2026-07-30T17:00:00Z";
const PAST = "2026-07-28T17:00:00Z";

function post(
  over: Partial<Pick<Post, "status" | "platforms" | "scheduled_at">> = {},
): Pick<Post, "status" | "platforms" | "scheduled_at"> {
  return {
    status: "scheduled",
    platforms: ["instagram", "facebook"] as Platform[],
    scheduled_at: FUTURE,
    ...over,
  };
}

function pub(platform: string, over: Partial<PublicationLike> = {}): PublicationLike {
  return {
    platform,
    status: "success",
    public_url: null,
    external_id: "sub_1",
    error: null,
    error_code: null,
    attempt_count: 1,
    last_attempt_at: null,
    next_retry_at: null,
    published_at: null,
    ...over,
  };
}

describe("postHealth — grün", () => {
  it("alle Plattformen live → grün", () => {
    const h = postHealth(
      post(),
      [
        pub("instagram", { public_url: "https://ig.example/1" }),
        pub("facebook", { public_url: "https://fb.example/1" }),
      ],
      NOW,
    );
    expect(h.light).toBe("green");
    expect(h.label).toBe("Veröffentlicht");
    expect(h.canRetry).toBe(false);
  });

  it("live + nicht verbundener Kanal → trotzdem grün", () => {
    const h = postHealth(
      post(),
      [
        pub("instagram", { public_url: "https://ig.example/1" }),
        pub("facebook", { status: "skipped", error: "Konto nicht verbunden" }),
      ],
      NOW,
    );
    expect(h.light).toBe("green");
    expect(h.detail).toMatch(/nicht verbunden/i);
  });
});

describe("postHealth — rot", () => {
  it("eine Plattform failed → rot", () => {
    const h = postHealth(
      post(),
      [
        pub("instagram", { public_url: "https://ig.example/1" }),
        pub("facebook", { status: "failed", error: "HTTP 500", error_code: "transient" }),
      ],
      NOW,
    );
    expect(h.light).toBe("red");
    expect(h.canRetry).toBe(true);
    expect(h.detail).toMatch(/Teilweise veröffentlicht/);
  });

  it("Fehlertext und Fehlerart werden pro Plattform durchgereicht", () => {
    const h = postHealth(
      post(),
      [
        pub("instagram"),
        pub("facebook", {
          status: "failed",
          error: "Keine Facebook-Page in Blotato gefunden",
          error_code: "reauth",
          attempt_count: 3,
        }),
      ],
      NOW,
    );
    const fb = h.platforms.find((p) => p.platform === "facebook")!;
    expect(fb.error).toBe("Keine Facebook-Page in Blotato gefunden");
    expect(fb.errorKind).toBe("Verbindung fehlt");
    expect(fb.advice).toMatch(/Blotato/);
    expect(fb.attempts).toBe(3);
  });

  it("teilweise übergeben, ein Kanal blieb liegen → rot", () => {
    const h = postHealth(
      post({ platforms: ["instagram", "facebook"], scheduled_at: PAST }),
      [pub("instagram", { public_url: "https://ig.example/1" })],
      NOW,
    );
    expect(h.light).toBe("red");
    expect(h.detail).toMatch(/nie übergeben/);
  });
});

describe("postHealth — verpasster Termin ist gelb, nicht rot", () => {
  // Rot ist echten Fehlern vorbehalten: das System hat es versucht und es ging
  // schief. Ein nie freigegebener Post ist keine Panne, sondern eine offene
  // Aufgabe — der Text benennt sie trotzdem klar.
  it("Termin vorbei und nie freigegeben → gelb 'Termin verpasst'", () => {
    const h = postHealth(post({ status: "pending", scheduled_at: PAST }), [], NOW);
    expect(h.light).toBe("amber");
    expect(h.label).toBe("Termin verpasst");
    expect(h.detail).toMatch(/nicht veröffentlicht worden/);
    // Nie freigegeben → kein Retry-Knopf, sonst würde der TÜV umgangen.
    expect(h.canRetry).toBe(false);
    expect(h.needsApproval).toBe(true);
  });
});

describe("postHealth — Retry-Regeln", () => {
  it("nicht verbundener Kanal ist nachholbar → canRetry", () => {
    const h = postHealth(
      post(),
      [
        pub("instagram", { public_url: "https://ig.example/1" }),
        pub("facebook", { status: "skipped", error: "Konto nicht verbunden" }),
      ],
      NOW,
    );
    expect(h.canRetry).toBe(true);
    expect(h.needsApproval).toBe(false);
  });

  it("alles live → weder Retry noch Freigabe nötig", () => {
    const h = postHealth(
      post(),
      [
        pub("instagram", { public_url: "https://ig.example/1" }),
        pub("facebook", { public_url: "https://fb.example/1" }),
      ],
      NOW,
    );
    expect(h.canRetry).toBe(false);
    expect(h.needsApproval).toBe(false);
  });
});

describe("postHealth — gelb", () => {
  it("Termin in der Zukunft, noch nicht freigegeben → gelb", () => {
    const h = postHealth(post({ status: "pending" }), [], NOW);
    expect(h.light).toBe("amber");
    expect(h.label).toBe("Wartet auf Freigabe");
    expect(h.canRetry).toBe(false);
  });

  it("übergeben ohne Live-Link → gelb 'Eingeplant'", () => {
    const h = postHealth(post(), [pub("instagram"), pub("facebook")], NOW);
    expect(h.light).toBe("amber");
    expect(h.label).toBe("Eingeplant");
  });

  it("innerhalb der 30-Minuten-Karenz gilt der Termin noch nicht als verpasst", () => {
    const justPassed = new Date(NOW.getTime() - 10 * 60_000).toISOString();
    const h = postHealth(post({ status: "pending", scheduled_at: justPassed }), [], NOW);
    expect(h.light).toBe("amber");
  });

  it("kein Kanal verbunden → gelb, nicht grün", () => {
    const h = postHealth(
      post(),
      [
        pub("instagram", { status: "skipped" }),
        pub("facebook", { status: "skipped" }),
      ],
      NOW,
    );
    expect(h.light).toBe("amber");
    expect(h.label).toBe("Kein Kanal verbunden");
  });
});

describe("postHealth — Plattform-Details", () => {
  it("liefert für jede geplante Plattform genau einen Eintrag", () => {
    const h = postHealth(
      post({ platforms: ["instagram", "facebook", "tiktok"] as Platform[] }),
      [pub("instagram", { public_url: "https://ig.example/1" })],
      NOW,
    );
    expect(h.platforms.map((p) => p.platform)).toEqual([
      "instagram",
      "facebook",
      "tiktok",
    ]);
    expect(h.platforms.find((p) => p.platform === "tiktok")!.state).toBe("open");
  });

  it("Live-Link und Zeitstempel werden durchgereicht", () => {
    const h = postHealth(
      post({ platforms: ["instagram"] as Platform[] }),
      [
        pub("instagram", {
          public_url: "https://ig.example/1",
          published_at: "2026-07-29T09:00:00Z",
        }),
      ],
      NOW,
    );
    const ig = h.platforms[0];
    expect(ig.state).toBe("live");
    expect(ig.publicUrl).toBe("https://ig.example/1");
    expect(ig.publishedAt).toBe("2026-07-29T09:00:00Z");
  });
});
