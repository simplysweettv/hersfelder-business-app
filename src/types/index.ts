export type Platform = "instagram" | "facebook" | "tiktok" | "linkedin";

export type PostStatus =
  | "draft"
  | "pending"
  | "approved"
  | "scheduled"
  | "published"
  | "failed";

export interface Post {
  id: string;
  title: string;
  image_url: string | null;
  caption: string | null;
  status: PostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  platforms: Platform[];
  week_number: number | null;
  year: number | null;
  created_at: string;
  updated_at: string;
}

export interface PostBrief {
  id: string;
  post_id: string;
  theme: string | null;
  occasion: string | null;
  product: string | null;
  season: string | null;
  message: string | null;
  prompt_used: string | null;
  created_at: string;
}

export interface SettingRow {
  id: string;
  key: string;
  value: string | null;
  updated_at: string;
}

export interface PublishLog {
  id: string;
  post_id: string;
  platform: Platform;
  status: "success" | "failed" | "pending";
  platform_post_id: string | null;
  error_message: string | null;
  response: Record<string, unknown> | null;
  created_at: string;
}

export type PublicationStatus = "pending" | "success" | "failed";

/** Per-Plattform-Veröffentlichungsstatus (Idempotenz + UI-Anzeige). */
export interface PostPublication {
  id: string;
  post_id: string;
  platform: Platform;
  status: PublicationStatus;
  external_id: string | null;
  error: string | null;
  published_at: string | null;
  updated_at: string;
}

export type GeneratorInput = {
  theme: string;
  occasion?: string;
  product: string;
  season?: string;
  message: string;
  platforms: Platform[];
};

export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
};

export const PLATFORM_COLOR: Record<Platform, string> = {
  instagram: "#E1306C",
  facebook: "#1877F2",
  tiktok: "#000000",
  linkedin: "#0A66C2",
};

export const PLATFORM_SHORT: Record<Platform, string> = {
  instagram: "IG",
  facebook: "FB",
  tiktok: "TT",
  linkedin: "LI",
};

export const STATUS_LABEL: Record<PostStatus, string> = {
  draft: "Entwurf",
  pending: "ausstehend",
  approved: "freigegeben",
  scheduled: "geplant",
  published: "veröffentlicht",
  failed: "fehlgeschlagen",
};

// ── Content-Säulen (Strategie) ───────────────────────────────
// Jede Säule hat einen Job im Funnel. Die Gewichte steuern die
// automatische (gewichtete) Auswahl im Zufalls-Generator.
export type PillarKey = "community" | "craft" | "proof" | "service";

export const CONTENT_PILLARS: {
  key: PillarKey;
  label: string;
  emoji: string;
  weight: number;
  hint: string;
}[] = [
  {
    key: "community",
    label: "Gemeinschaft & Emotion",
    emoji: "🎉",
    weight: 40,
    hint: "Reichweite — echtes Vereinsleben, Feiern, Zusammenhalt",
  },
  {
    key: "craft",
    label: "Handwerk & Qualität",
    emoji: "🧵",
    weight: 20,
    hint: "Vertrauen — Detail, Verarbeitung, Langlebigkeit",
  },
  {
    key: "proof",
    label: "Verein-Stories",
    emoji: "⭐",
    weight: 20,
    hint: "Überzeugung — Vereine, die Hersfelder ausgestattet hat",
  },
  {
    key: "service",
    label: "Service & Angebot",
    emoji: "📣",
    weight: 20,
    hint: "Leads — Einladung zur Ausstattung, Beratung, Aktion",
  },
];
