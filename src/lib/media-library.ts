import type { SupabaseClient } from "@supabase/supabase-js";
import type { PhotoInput } from "./designed-post";

/**
 * Bildbibliothek — echte Schützenbilder aus dem Verein/Betrieb.
 *
 * Zwei Verwendungen, beide gewollt:
 *  1. DIREKT als Foto im Post („photo") — dann erzeugt gpt-image-1 gar kein
 *     Bild; das echte Foto trägt das Plakat. Authentischer geht es nicht.
 *  2. Als REFERENZ („reference") — das echte Foto geht als Vorlage an
 *     gpt-image-1, das daraus eine NEUE Szene im selben Look baut. So sehen
 *     auch die KI-Fotos nach echten Vereinen aus statt nach Stockfotografie.
 *
 * Rotation ist Pflicht: Ohne `last_used_at`-Sortierung landet immer dasselbe
 * Motiv im Feed. Deshalb liegen die Bilder in einer Tabelle und nicht nur
 * im Storage-Bucket.
 */

export const MEDIA_BUCKET = "media-library";

export type MediaLane = "emotional" | "product" | "both";
export type MediaUsage = "photo" | "reference" | "both";

export type MediaAsset = {
  id: string;
  storage_path: string;
  public_url: string;
  title: string | null;
  description: string | null;
  lane: MediaLane;
  usage: MediaUsage;
  active: boolean;
  mime: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  times_used: number;
  last_used_at: string | null;
  created_at: string;
};

/**
 * Wie stark die Automatik (Zufalls-Post, Cron) auf die Bibliothek zugreift.
 * Der manuelle Generator entscheidet unabhängig davon pro Post.
 */
export type MediaUsageMode = "off" | "reference" | "photo+reference";

export const MEDIA_USAGE_MODE_DEFAULT: MediaUsageMode = "photo+reference";

export function parseMediaUsageMode(raw?: string | null): MediaUsageMode {
  const v = (raw ?? "").trim();
  if (v === "off" || v === "reference" || v === "photo+reference") return v;
  return MEDIA_USAGE_MODE_DEFAULT;
}

export const MEDIA_USAGE_MODE_LABEL: Record<MediaUsageMode, string> = {
  off: "Aus — die KI erzeugt alle Fotos selbst",
  reference: "Nur als Referenz — KI-Fotos orientieren sich an euren Bildern",
  "photo+reference": "Echte Fotos verwenden UND als Referenz nutzen",
};

/** Wie das Foto eines Posts zustande kommt. Landet in post_briefs.photo_source. */
export type PhotoSourceMode = "ai" | "ai-reference" | "library";

export type MediaPlan =
  | { mode: "ai"; assets: [] }
  | { mode: "library"; asset: MediaAsset; assets: MediaAsset[] }
  | { mode: "ai-reference"; assets: MediaAsset[] };

const SELECT_COLUMNS =
  "id, storage_path, public_url, title, description, lane, usage, active, mime, bytes, width, height, times_used, last_used_at, created_at";

/** Alle Bilder der Bibliothek — neueste zuerst (für die Verwaltungsseite). */
export async function listMediaAssets(
  supabase: SupabaseClient,
  opts: { activeOnly?: boolean } = {},
): Promise<MediaAsset[]> {
  let q = supabase.from("media_assets").select(SELECT_COLUMNS).order("created_at", { ascending: false });
  if (opts.activeOnly) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as MediaAsset[];
}

/**
 * Kandidaten für eine Säule, am längsten nicht benutzte zuerst.
 * `usage` filtert auf den gewünschten Einsatzzweck ("both" zählt immer mit).
 */
export async function pickCandidates(
  supabase: SupabaseClient,
  opts: { lane: "emotional" | "product"; usage: "photo" | "reference"; limit?: number },
): Promise<MediaAsset[]> {
  const { data, error } = await supabase
    .from("media_assets")
    .select(SELECT_COLUMNS)
    .eq("active", true)
    .in("lane", [opts.lane, "both"])
    .in("usage", [opts.usage, "both"])
    // Am längsten nicht genutzte zuerst — „noch nie benutzt" (null) ganz vorn.
    .order("last_used_at", { ascending: true, nullsFirst: true })
    .order("times_used", { ascending: true })
    .limit(opts.limit ?? 3);
  if (error) throw new Error(error.message);
  return (data ?? []) as MediaAsset[];
}

/**
 * Entscheidet für EINEN Post, woher das Foto kommt.
 *
 * `photoShare` ist die Wahrscheinlichkeit, mit der ein vorhandenes echtes Foto
 * direkt verwendet wird (statt nur als Referenz). Bewusst nicht 100 %: Die
 * Bibliothek ist anfangs klein, und ein Feed aus fünfmal demselben Motiv wäre
 * schlechter als eine Mischung.
 */
export async function planPhotoSource(
  supabase: SupabaseClient,
  opts: {
    lane: "emotional" | "product";
    mode: MediaUsageMode;
    photoShare?: number;
    random?: () => number;
  },
): Promise<MediaPlan> {
  if (opts.mode === "off") return { mode: "ai", assets: [] };
  const random = opts.random ?? Math.random;
  const share = opts.photoShare ?? 0.6;

  if (opts.mode === "photo+reference" && random() < share) {
    const photos = await pickCandidates(supabase, { lane: opts.lane, usage: "photo", limit: 1 });
    if (photos.length) return { mode: "library", asset: photos[0], assets: [photos[0]] };
  }

  const refs = await pickCandidates(supabase, { lane: opts.lane, usage: "reference", limit: 3 });
  if (refs.length) return { mode: "ai-reference", assets: refs };

  // Kein Referenz-Material? Dann doch ein echtes Foto, falls erlaubt und da.
  if (opts.mode === "photo+reference") {
    const photos = await pickCandidates(supabase, { lane: opts.lane, usage: "photo", limit: 1 });
    if (photos.length) return { mode: "library", asset: photos[0], assets: [photos[0]] };
  }
  return { mode: "ai", assets: [] };
}

/** Ein bestimmtes Bild laden (manuelle Auswahl im Generator). */
export async function getMediaAsset(
  supabase: SupabaseClient,
  id: string,
): Promise<MediaAsset | null> {
  const { data, error } = await supabase
    .from("media_assets")
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MediaAsset | null) ?? null;
}

/** Nutzung protokollieren — Grundlage der Rotation. */
export async function markMediaUsed(
  supabase: SupabaseClient,
  assets: MediaAsset[],
): Promise<void> {
  const now = new Date().toISOString();
  for (const a of assets) {
    const { error } = await supabase
      .from("media_assets")
      .update({ times_used: (a.times_used ?? 0) + 1, last_used_at: now, updated_at: now })
      .eq("id", a.id);
    // Ein fehlgeschlagenes Protokoll darf keinen fertigen Post verwerfen.
    if (error) console.error("media_assets Nutzung nicht protokolliert:", error.message);
  }
}

/** Bild-Datei aus dem Storage holen (öffentliche URL). */
export async function downloadMediaBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Bild aus der Bibliothek nicht ladbar (HTTP ${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Die Motivbeschreibungen als Prompt-Baustein. Ohne diesen Text weiß
 * gpt-image-1 nicht, WAS an den Referenzbildern nachahmenswert ist.
 */
export function describeReferences(assets: MediaAsset[]): string {
  const lines = assets
    .map((a) => [a.title, a.description].filter(Boolean).join(" — "))
    .filter(Boolean);
  return lines.length ? lines.map((l) => `- ${l}`).join("\n") : "";
}

/**
 * Aus dem Plan die konkrete Foto-Vorgabe für `createDesignedPostImage` machen
 * (Dateien laden). Schlägt ein Download fehl, fällt der Post auf reine
 * KI-Erzeugung zurück statt zu scheitern — ein Post ohne Bild gibt es nicht.
 */
export async function resolvePhotoInput(plan: MediaPlan): Promise<PhotoInput> {
  try {
    if (plan.mode === "library") {
      const buffer = await downloadMediaBuffer(plan.asset.public_url);
      return {
        mode: "library",
        buffer,
        description: [plan.asset.title, plan.asset.description].filter(Boolean).join(" — ") || null,
      };
    }
    if (plan.mode === "ai-reference" && plan.assets.length) {
      const references = await Promise.all(
        plan.assets.map((a) => downloadMediaBuffer(a.public_url)),
      );
      return {
        mode: "ai-reference",
        references,
        referenceNotes: describeReferences(plan.assets) || undefined,
      };
    }
  } catch (e) {
    console.error("Bibliotheksbild nicht nutzbar, weiche auf reine KI aus:", e);
  }
  return { mode: "ai" };
}
