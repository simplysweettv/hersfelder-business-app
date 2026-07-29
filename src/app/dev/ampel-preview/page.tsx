import { notFound } from "next/navigation";
import { PostDetailDialog } from "@/components/social/PostDetailDialog";
import { type PublicationRow } from "@/components/social/PublicationStatus";
import type { Post } from "@/types";

/**
 * Dev-only Vorschau der Kalender-Ampel mit allen Zuständen (grün/gelb/rot)
 * — ohne Login und ohne echte Daten, damit die Darstellung prüfbar ist.
 * In Produktion: 404.
 *
 *   GET /dev/ampel-preview
 */
export const dynamic = "force-dynamic";

function post(over: Partial<Post>): Post {
  return {
    id: crypto.randomUUID(),
    title: "Beispiel-Post",
    image_url: null,
    image_urls: null,
    caption: "---INSTAGRAM---\nBeispieltext für die Vorschau.\n\n---FACEBOOK---\nBeispieltext für Facebook.",
    status: "scheduled",
    scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
    published_at: null,
    platforms: ["instagram", "facebook", "tiktok"],
    week_number: null,
    year: null,
    quality_score: 88,
    quality_notes: null,
    quality_status: "passed",
    approved_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...over,
  };
}

function pub(platform: string, over: Partial<PublicationRow> = {}): PublicationRow {
  return {
    platform,
    status: "success",
    public_url: null,
    external_id: "sub_12345",
    error: null,
    error_code: null,
    attempt_count: 1,
    last_attempt_at: new Date().toISOString(),
    next_retry_at: null,
    published_at: null,
    ...over,
  };
}

const CASES: { label: string; post: Post; pubs: PublicationRow[] }[] = [
  {
    label: "GRÜN — alles live",
    post: post({
      title: "Ehrung und Zusammenhalt beim Schützenfest",
      status: "published",
      published_at: new Date(Date.now() - 3_600_000).toISOString(),
    }),
    pubs: [
      pub("instagram", { public_url: "https://instagram.com/p/abc", published_at: new Date().toISOString() }),
      pub("facebook", { public_url: "https://facebook.com/123", published_at: new Date().toISOString() }),
      pub("tiktok", { public_url: "https://tiktok.com/@x/video/1", published_at: new Date().toISOString() }),
    ],
  },
  {
    label: "GRÜN — live, ein Kanal nicht verbunden",
    post: post({ title: "Gemeinschaft nach dem Fest", status: "published" }),
    pubs: [
      pub("instagram", { public_url: "https://instagram.com/p/abc" }),
      pub("facebook", { public_url: "https://facebook.com/123" }),
      pub("tiktok", { status: "skipped", error: "Kein verbundenes tiktok-Konto in Blotato gefunden." }),
    ],
  },
  {
    label: "GELB — wartet auf Freigabe",
    post: post({ title: "Generation verbindet", status: "pending" }),
    pubs: [],
  },
  {
    label: "GELB — eingeplant, an Blotato übergeben",
    post: post({ title: "Vereinsausstattung im August" }),
    pubs: [pub("instagram"), pub("facebook"), pub("tiktok")],
  },
  {
    label: "ROT — Facebook fehlgeschlagen (dauerhaft)",
    post: post({ title: "Musterweste für den Schützenfest-Sommer", status: "failed" }),
    pubs: [
      pub("instagram", { public_url: "https://instagram.com/p/abc" }),
      pub("facebook", {
        status: "failed",
        error:
          "Keine Facebook-Page in Blotato gefunden — bitte die Facebook-Seite in Blotato verbinden. (HTTP 400: invalid page target)",
        error_code: "permanent",
        attempt_count: 3,
      }),
      pub("tiktok", {
        status: "failed",
        error:
          "Tiktok post failed to publish: TikTok encountered a connection error while downloading the photo. Ensure the URL is publicly accessible.",
        error_code: "transient",
        attempt_count: 2,
        next_retry_at: new Date(Date.now() + 900_000).toISOString(),
      }),
    ],
  },
  {
    label: "ROT — Termin verpasst, nie freigegeben",
    post: post({
      title: "Herbstabend im Verein",
      status: "pending",
      scheduled_at: new Date(Date.now() - 86_400_000).toISOString(),
    }),
    pubs: [],
  },
];

export default function AmpelPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="p-6 space-y-6 bg-background min-h-screen">
      <div>
        <h1 className="text-xl font-semibold">Kalender-Ampel — Dev-Vorschau</h1>
        <p className="text-sm text-muted-foreground">
          Alle Zustände auf einen Blick. Auf eine Zeile klicken öffnet das Status-Fenster.
        </p>
      </div>
      {CASES.map((c) => (
        <div key={c.label} className="space-y-1.5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {c.label}
          </h2>
          <PostDetailDialog post={c.post} pubs={c.pubs} />
        </div>
      ))}
    </div>
  );
}
