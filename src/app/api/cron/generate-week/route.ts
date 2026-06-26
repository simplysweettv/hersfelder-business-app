import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSettings } from "@/lib/settings";
import {
  buildCaptionPrompt,
  buildImagePrompt,
  generateBrief,
  generateCaption,
  generateImage,
  pickPillar,
  pillarPick,
  reviewPost,
} from "@/lib/openai";
import { CONTENT_PILLARS } from "@/types";
import type { Platform } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 300;
// Cron immer frisch ausführen — nie statisch prerendern.
export const dynamic = "force-dynamic";

/**
 * Autonome Content-Engine.
 *
 * Läuft täglich und hält einen rollenden Puffer geplanter Posts für die
 * nächsten LOOKAHEAD_DAYS Tage. Slots stehen zu Zeiten, an denen die
 * Schützen-Zielgruppe aktiv ist (Abende & Wochenende, DEUTSCHE Zeit).
 * Pro Lauf werden bis zu MAX_PER_RUN leere Slots gefüllt — mit gewichteter
 * Content-Säule, Anti-Wiederholung und Qualitäts-TÜV.
 */

// Wochentag: 0=So, 1=Mo … 6=Sa. Uhrzeiten in DEUTSCHER Ortszeit.
const POSTING_PLAN: Array<{
  weekday: number;
  hour: number;
  minute: number;
  platforms: Platform[];
  imageSize: "1024x1024" | "1024x1536" | "1536x1024";
}> = [
  { weekday: 3, hour: 19, minute: 0, platforms: ["instagram", "facebook", "tiktok"], imageSize: "1024x1536" }, // Mi
  { weekday: 5, hour: 18, minute: 0, platforms: ["instagram", "facebook", "tiktok"], imageSize: "1024x1536" }, // Fr
  { weekday: 6, hour: 11, minute: 0, platforms: ["instagram", "facebook", "tiktok"], imageSize: "1024x1536" }, // Sa
  { weekday: 0, hour: 19, minute: 0, platforms: ["instagram", "facebook", "tiktok"], imageSize: "1024x1536" }, // So
];

const LOOKAHEAD_DAYS = 8;
const MAX_PER_RUN = 3;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

// Offset (Minuten) der Zeitzone Europe/Berlin für einen UTC-Zeitpunkt (DST-bewusst).
function berlinOffsetMinutes(d: Date): number {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(d)) p[part.type] = part.value;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return Math.round((asUTC - d.getTime()) / 60000);
}

// Deutsche Wandzeit (Y-M-D H:M) → korrekter UTC-Instant.
function berlinWallToUtc(y: number, m: number, day: number, hour: number, minute: number): Date {
  const guess = new Date(Date.UTC(y, m, day, hour, minute));
  const off = berlinOffsetMinutes(guess);
  return new Date(guess.getTime() - off * 60000);
}

function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}
function isoWeekYear(d: Date) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  return t.getUTCFullYear();
}

export async function GET(req: NextRequest) {
  if (!authorized(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const settings = await loadSettings();
  const apiKey = process.env.OPENAI_API_KEY || settings["openai_api_key"] || undefined;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY missing." }, { status: 400 });
  }

  const now = new Date();

  // 1) Kommende Slots (deutsche Zeit) für die nächsten LOOKAHEAD_DAYS berechnen.
  const slots: { when: Date; size: "1024x1024" | "1024x1536" | "1536x1024"; platforms: Platform[] }[] = [];
  for (let i = 0; i <= LOOKAHEAD_DAYS; i++) {
    const dayUtc = new Date(now.getTime() + i * 86_400_000);
    // Wochentag in Berlin bestimmen
    const berlinWeekday = new Date(
      new Date(dayUtc).toLocaleString("en-US", { timeZone: "Europe/Berlin" }),
    ).getDay();
    for (const plan of POSTING_PLAN) {
      if (plan.weekday !== berlinWeekday) continue;
      // Berlin-Datum dieses Tages holen
      const bf = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Berlin",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(dayUtc);
      const bp: Record<string, string> = {};
      for (const part of bf) bp[part.type] = part.value;
      const when = berlinWallToUtc(+bp.year, +bp.month - 1, +bp.day, plan.hour, plan.minute);
      if (when.getTime() <= now.getTime() + 60 * 60 * 1000) continue; // mind. 1h Vorlauf
      slots.push({ when, size: plan.imageSize, platforms: plan.platforms });
    }
  }
  slots.sort((a, b) => a.when.getTime() - b.when.getTime());

  // 2) Bereits belegte Slot-Zeiten ermitteln (Idempotenz).
  const from = now.toISOString();
  const to = new Date(now.getTime() + (LOOKAHEAD_DAYS + 1) * 86_400_000).toISOString();
  const { data: existing } = await supabase
    .from("posts")
    .select("scheduled_at")
    .gte("scheduled_at", from)
    .lte("scheduled_at", to)
    .not("status", "in", "(draft)");
  const taken = new Set(
    (existing ?? []).map((p) => new Date(p.scheduled_at as string).toISOString()),
  );

  const open = slots.filter((s) => !taken.has(s.when.toISOString())).slice(0, MAX_PER_RUN);

  // 3) Anti-Wiederholung: zuletzt genutzte Themen/Botschaften laden.
  const { data: recentBriefs } = await supabase
    .from("post_briefs")
    .select("theme, message")
    .order("created_at", { ascending: false })
    .limit(8);
  const avoid = (recentBriefs ?? [])
    .flatMap((b) => [b.theme, b.message])
    .filter((x): x is string => Boolean(x));

  const created: string[] = [];
  const errors: string[] = [];

  for (const slot of open) {
    try {
      const week = isoWeek(slot.when);
      const year = isoWeekYear(slot.when);
      const pillar = pickPillar();
      const { styleType, themeCategory } = pillarPick(pillar);
      const pillarLabel = CONTENT_PILLARS.find((p) => p.key === pillar)?.label;

      const makePost = async () => {
        const brief = await generateBrief({
          apiKey,
          themeCategory,
          styleType,
          weekNumber: week,
          year,
          pillar,
          avoid,
        });
        const imagePrompt = buildImagePrompt({
          brandStyle: settings["brand_style_prompt"],
          theme: brief.theme,
          product: brief.product,
          message: brief.message,
          styleType,
          visualDetails: brief.visualDetails,
        });
        const captionPrompt = buildCaptionPrompt({
          theme: brief.theme,
          product: brief.product,
          message: brief.message,
          platforms: slot.platforms as string[],
          pillar,
        });
        const [image, caption] = await Promise.all([
          generateImage({ apiKey, prompt: imagePrompt, size: slot.size }),
          generateCaption({ apiKey, prompt: captionPrompt }),
        ]);
        let imageUrl: string | null = null;
        if (image.b64) {
          const buffer = Buffer.from(image.b64, "base64");
          const filename = `${crypto.randomUUID()}.jpg`;
          const { error: upErr } = await supabase.storage
            .from("post-images")
            .upload(filename, buffer, { contentType: "image/jpeg" });
          if (!upErr) {
            imageUrl = supabase.storage.from("post-images").getPublicUrl(filename).data.publicUrl;
          }
        } else if (image.url) {
          imageUrl = image.url;
        }
        const review = await reviewPost({ apiKey, caption, imageUrl, styleType, pillarLabel });
        return { brief, imagePrompt, caption, imageUrl, review };
      };

      // Generieren + TÜV; bei schlechtem Ergebnis EINMAL komplett neu.
      let result = await makePost();
      if (!result.review.imageOk || result.review.score < 5) {
        const retry = await makePost();
        if (retry.review.score >= result.review.score) result = retry;
      }

      const { brief, imagePrompt, caption, imageUrl, review } = result;
      avoid.unshift(brief.theme, brief.message); // nächster Slot vermeidet auch diesen

      const { data: post } = await supabase
        .from("posts")
        .insert({
          title: `${brief.theme}`.slice(0, 200),
          image_url: imageUrl,
          caption,
          status: "pending",
          platforms: slot.platforms,
          scheduled_at: slot.when.toISOString(),
          week_number: week,
          year,
          quality_score: review.score,
          quality_notes: review.issues,
        })
        .select("id")
        .single();

      if (post) {
        created.push(post.id);
        await supabase.from("post_briefs").insert({
          post_id: post.id,
          theme: brief.theme,
          occasion: themeCategory,
          product: brief.product,
          message: brief.message,
          prompt_used: imagePrompt,
          pillar,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[content-engine] ERROR", msg);
      errors.push(msg);
    }
  }

  return NextResponse.json({
    created: created.length,
    openSlots: open.length,
    ids: created,
    errors,
  });
}
