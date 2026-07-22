import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Zentrale Kosten-Logik für alle KI-Aufrufe (server-only).
 *
 * Jeder OpenAI-Aufruf liefert ein `usage`-Feld mit echten Token-Zahlen.
 * Daraus berechnen wir die Kosten exakt und schreiben pro Aufruf eine Zeile
 * in `ai_usage`. Fehlt das usage-Feld (alte Daten / Edge-Case), greift eine
 * konservative Pauschale, markiert als `estimated`.
 */

// Preise in USD pro 1 Mio. Token — OpenAI öffentliche Preisliste (Stand 2025).
// gpt-image-1 rechnet getrennt ab: Text-Input, Bild-Input (nur bei Edits mit
// Eingabebild) und Bild-Output (die generierten Pixel-Token).
const PRICE = {
  "gpt-image-1": { textInput: 5, imageInput: 10, imageOutput: 40 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
} as const;

// Pauschalen, wenn keine echten Token vorliegen (Backfill der Altdaten oder
// fehlendes usage-Feld). Werte an real gemessenen Aufrufen ausgerichtet:
// gpt-image-1 liefert "high" (~4160 Output-Token) → ~$0.17/Bild; die Text-
// Aufrufe (Brief + Caption + Prüfung) zusammen < $0.001. Solche Zeilen sind
// estimated=true und im Dashboard als „≈ geschätzt" gekennzeichnet.
export const BACKFILL_IMAGE_USD = 0.17; // 1 gpt-image-1 Bild (high)
export const BACKFILL_TEXT_USD = 0.001; // Brief + Caption + Qualitätsprüfung je Post

export type AiOperation = "image" | "caption" | "brief" | "review" | "carousel" | "concept";

type ChatUsage = { prompt_tokens?: number; completion_tokens?: number };
type ImageUsage = {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { text_tokens?: number; image_tokens?: number };
};

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Kosten + Token-Aufschlüsselung für einen gpt-image-1 Aufruf. */
export function costForImage(usage: unknown) {
  const u = (usage ?? {}) as ImageUsage;
  const textInput = num(u.input_tokens_details?.text_tokens) || num(u.input_tokens);
  const imageInput = num(u.input_tokens_details?.image_tokens);
  const output = num(u.output_tokens);
  const p = PRICE["gpt-image-1"];
  const cost =
    (textInput * p.textInput + imageInput * p.imageInput + output * p.imageOutput) /
    1_000_000;
  return {
    cost,
    text_input_tokens: textInput,
    image_input_tokens: imageInput,
    output_tokens: output,
    input_tokens: textInput + imageInput,
    hasTokens: textInput + imageInput + output > 0,
  };
}

/** Kosten + Token für einen gpt-4o-mini Chat-Aufruf (auch Vision/Review). */
export function costForChat(usage: unknown) {
  const u = (usage ?? {}) as ChatUsage;
  const input = num(u.prompt_tokens);
  const output = num(u.completion_tokens);
  const p = PRICE["gpt-4o-mini"];
  const cost = (input * p.input + output * p.output) / 1_000_000;
  return { cost, input_tokens: input, output_tokens: output, hasTokens: input + output > 0 };
}

/**
 * Schreibt eine `ai_usage`-Zeile für einen KI-Aufruf. Vollständig gekapselt —
 * ein DB-/Berechnungsfehler darf die Post-Generierung niemals blockieren.
 */
export async function recordAiUsage(entry: {
  operation: AiOperation;
  model: string;
  usage?: unknown;
  imageCount?: number;
  postId?: string | null;
}): Promise<void> {
  try {
    let row: Record<string, unknown>;
    if (entry.operation === "image") {
      const c = costForImage(entry.usage);
      const estimated = !c.hasTokens;
      row = {
        operation: entry.operation,
        model: entry.model,
        input_tokens: c.input_tokens,
        output_tokens: c.output_tokens,
        image_input_tokens: c.image_input_tokens,
        text_input_tokens: c.text_input_tokens,
        image_count: entry.imageCount ?? 1,
        cost_usd: estimated ? BACKFILL_IMAGE_USD : c.cost,
        estimated,
        post_id: entry.postId ?? null,
      };
    } else {
      const c = costForChat(entry.usage);
      const estimated = !c.hasTokens;
      row = {
        operation: entry.operation,
        model: entry.model,
        input_tokens: c.input_tokens,
        output_tokens: c.output_tokens,
        image_input_tokens: 0,
        text_input_tokens: c.input_tokens,
        image_count: 0,
        cost_usd: estimated ? BACKFILL_TEXT_USD : c.cost,
        estimated,
        post_id: entry.postId ?? null,
      };
    }
    const supabase = createAdminClient();
    await supabase.from("ai_usage").insert(row);
  } catch (e) {
    console.error("recordAiUsage failed:", e);
  }
}

// ── Aggregation für das Kosten-Dashboard ─────────────────────────────

export type UsageRow = {
  created_at: string;
  operation: string;
  cost_usd: number | string;
  image_count: number | null;
  estimated: boolean | null;
};

export type OpStat = { operation: string; label: string; count: number; usd: number };
export type MonthBucket = {
  key: string; // "2026-06"
  label: string; // "Jun"
  aiUsd: number;
  imageUsd: number;
  textUsd: number;
  imageCount: number;
  estimated: boolean;
};

const OP_LABEL: Record<string, string> = {
  image: "Bilder",
  caption: "Captions",
  brief: "Briefings",
  review: "Qualitätsprüfung",
  carousel: "Karussell-Texte",
};

const MONTHS_DE = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Reine Aggregation der Roh-Zeilen für die Anzeige: Verlauf der letzten N
 * Monate, aktueller/voriger Monat, Aufschlüsselung nach Operation (akt. Monat).
 * `nowMs` wird übergeben, damit die Funktion rein/testbar bleibt.
 */
export function summarizeCosts(rows: UsageRow[], nowMs: number, monthsBack = 6) {
  const now = new Date(nowMs);
  const buckets = new Map<string, MonthBucket>();
  const order: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d);
    buckets.set(key, {
      key,
      label: MONTHS_DE[d.getMonth()],
      aiUsd: 0,
      imageUsd: 0,
      textUsd: 0,
      imageCount: 0,
      estimated: false,
    });
    order.push(key);
  }

  const curKey = monthKey(now);
  const opMap = new Map<string, OpStat>(); // nur aktueller Monat
  let totalImages = 0;

  for (const r of rows) {
    const d = new Date(r.created_at);
    const key = monthKey(d);
    const usd = typeof r.cost_usd === "string" ? parseFloat(r.cost_usd) : num(r.cost_usd);
    const imgs = r.image_count ?? 0;
    totalImages += imgs;

    const b = buckets.get(key);
    if (b) {
      b.aiUsd += usd;
      if (r.operation === "image") {
        b.imageUsd += usd;
        b.imageCount += imgs;
      } else {
        b.textUsd += usd;
      }
      if (r.estimated) b.estimated = true;
    }

    if (key === curKey) {
      const label = OP_LABEL[r.operation] ?? r.operation;
      const o = opMap.get(r.operation) ?? { operation: r.operation, label, count: 0, usd: 0 };
      o.count += 1;
      o.usd += usd;
      opMap.set(r.operation, o);
    }
  }

  const months = order.map((k) => buckets.get(k)!);
  const current = buckets.get(curKey)!;
  const prevKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const previous = buckets.get(prevKey) ?? null;

  return {
    months,
    current,
    previous,
    byOperation: Array.from(opMap.values()).sort((a, b) => b.usd - a.usd),
    totalImages,
    hasEstimated: rows.some((r) => r.estimated),
  };
}

export type CostSummary = ReturnType<typeof summarizeCosts>;
