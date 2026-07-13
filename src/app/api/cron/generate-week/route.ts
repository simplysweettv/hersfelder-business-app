import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSettings } from "@/lib/settings";
import { cronAuthorized } from "@/lib/cron-auth";
import { startRun, finishRun } from "@/lib/automation";
import {
  buildCaptionPrompt,
  buildImagePrompt,
  generateBrief,
  generateCaption,
  generateImage,
  pickPillarWeighted,
  pillarPick,
  reviewPost,
} from "@/lib/openai";
import { computeInsights } from "@/lib/learning";
import { getWeatherForPublishDay } from "@/lib/topical";
import { qualityStatusFrom } from "@/lib/quality";
import { parsePostingPlan } from "@/lib/posting-plan";
import {
  berlinWallToUtc,
  berlinDayKey,
  berlinWeekday,
  isoWeek,
  isoWeekYear,
} from "@/lib/berlin-time";
import { CONTENT_PILLARS } from "@/types";
import type { Platform } from "@/types";
import type { ImageSize } from "@/lib/posting-plan";

export const runtime = "nodejs";
export const maxDuration = 300;
// Cron immer frisch ausführen — nie statisch prerendern.
export const dynamic = "force-dynamic";

/**
 * Autonome Content-Engine.
 *
 * Läuft täglich und hält einen rollenden Puffer geplanter Posts für die
 * nächsten LOOKAHEAD_DAYS Tage. Die Slots (Wochentage/Uhrzeiten/Plattformen)
 * kommen aus dem konfigurierbaren Posting-Plan (Einstellungen → Ruhig/Normal/
 * Aktiv/Individuell), nicht mehr fest aus dem Code.
 *
 * Pro Lauf werden bis zu MAX_PER_RUN leere Slots gefüllt — mit gewichteter
 * Content-Säule (service nur im festen 5er-CTA-Slot), Anti-Wiederholung und
 * verbindlichem Qualitäts-TÜV.
 */

const LOOKAHEAD_DAYS = 8;
const MAX_PER_RUN = 3;

export async function GET(req: NextRequest) {
  const auth = cronAuthorized(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.reason ?? "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const settings = await loadSettings();
  const apiKey = process.env.OPENAI_API_KEY || settings["openai_api_key"] || undefined;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY missing." }, { status: 400 });
  }

  const runId = await startRun(supabase, "content_generation", "cron");
  const now = new Date();
  const plan = parsePostingPlan(settings["posting_plan"]);

  // 1) Kommende Slots (deutsche Zeit) für die nächsten LOOKAHEAD_DAYS berechnen.
  const slots: { when: Date; size: ImageSize; platforms: Platform[] }[] = [];
  for (let i = 0; i <= LOOKAHEAD_DAYS; i++) {
    const dayUtc = new Date(now.getTime() + i * 86_400_000);
    const weekday = berlinWeekday(dayUtc);
    for (const p of plan.slots) {
      if (p.weekday !== weekday) continue;
      const [y, m, d] = berlinDayKey(dayUtc).split("-").map(Number);
      const when = berlinWallToUtc(y, m - 1, d, p.hour, p.minute);
      if (when.getTime() <= now.getTime() + 60 * 60 * 1000) continue; // mind. 1h Vorlauf
      slots.push({ when, size: p.imageSize, platforms: p.platforms });
    }
  }
  slots.sort((a, b) => a.when.getTime() - b.when.getTime());

  // 2) Belegte Slots ermitteln — Idempotenz pro Berlin-KALENDERTAG (nicht exaktem
  //    Timestamp): wird die Uhrzeit im Plan geändert, entsteht kein Doppel-Post.
  const from = now.toISOString();
  const to = new Date(now.getTime() + (LOOKAHEAD_DAYS + 1) * 86_400_000).toISOString();
  const { data: existing } = await supabase
    .from("posts")
    .select("scheduled_at")
    .gte("scheduled_at", from)
    .lte("scheduled_at", to)
    .not("status", "in", "(draft)");
  const takenDays = new Set(
    (existing ?? [])
      .filter((p) => p.scheduled_at)
      .map((p) => berlinDayKey(new Date(p.scheduled_at as string))),
  );

  // Nur ein Post pro Tag; erste freien Tage bis MAX_PER_RUN.
  const open: typeof slots = [];
  const plannedDays = new Set<string>();
  for (const s of slots) {
    const key = berlinDayKey(s.when);
    if (takenDays.has(key) || plannedDays.has(key)) continue;
    plannedDays.add(key);
    open.push(s);
    if (open.length >= MAX_PER_RUN) break;
  }

  // 3) Anti-Wiederholung: zuletzt genutzte Themen/Botschaften + Stile laden.
  const { data: recentBriefs } = await supabase
    .from("post_briefs")
    .select("theme, message, style_type")
    .order("created_at", { ascending: false })
    .limit(8);
  const avoid = (recentBriefs ?? [])
    .flatMap((b) => [b.theme, b.message])
    .filter((x): x is string => Boolean(x));
  const recentStyles = (recentBriefs ?? [])
    .map((b) => b.style_type)
    .filter((x): x is string => Boolean(x));

  // 5er-Zyklus: jeder fünfte Post = Service/CTA-Säule (der EINZIGE Weg zu service).
  const { count: totalPostCount } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true });
  const baseIndex = totalPostCount ?? 0;

  // Lern-Schleife: gelernte Säulen-Gewichte (oder Basis, wenn zu wenig Daten).
  const insights = await computeInsights(supabase);
  const weights = insights.learnedWeights ?? {};

  const created: string[] = [];
  const errors: string[] = [];

  for (const slot of open) {
    try {
      const week = isoWeek(slot.when);
      const year = isoWeekYear(slot.when);
      const month = slot.when.getUTCMonth() + 1;

      const postIndex = baseIndex + created.length;
      const isCTASlot = postIndex % 5 === 4;
      const pillar = isCTASlot ? "service" : pickPillarWeighted(weights);
      const { styleType, themeCategory } = pillarPick(pillar, recentStyles);
      recentStyles.unshift(styleType);
      const pillarLabel = CONTENT_PILLARS.find((p) => p.key === pillar)?.label;

      // Wetter für den KONKRETEN Veröffentlichungstag (Prognose, wenn > 24h weg).
      const topical = await getWeatherForPublishDay(slot.when, now);

      const makePost = async () => {
        const brief = await generateBrief({
          apiKey,
          themeCategory,
          styleType,
          weekNumber: week,
          year,
          month,
          pillar,
          avoid,
          topical: topical.text,
          // Reaktiver Hook nur, wenn der Termin < 24h weg ist (sonst null).
          reactiveHook: topical.reactiveHook ?? undefined,
        });
        const imagePrompt = buildImagePrompt({
          brandStyle: settings["brand_style_prompt"],
          theme: brief.theme,
          product: brief.product,
          message: brief.message,
          styleType,
          visualDetails: brief.visualDetails,
          sceneIdea: brief.sceneIdea,
          pillar,
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
      if (!result.review.imageOk || (result.review.checked && result.review.score < 5)) {
        const retry = await makePost();
        if (retry.review.score >= result.review.score) result = retry;
      }

      const { brief, imagePrompt, caption, imageUrl, review } = result;
      const qualityStatus = qualityStatusFrom(review);
      avoid.unshift(brief.theme, brief.message);

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
          quality_status: qualityStatus,
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
          style_type: styleType,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[content-engine] ERROR", msg);
      errors.push(msg);
    }
  }

  await finishRun(supabase, runId, {
    planned: open.length,
    succeeded: created.length,
    failed: open.length - created.length,
    errors,
    postIds: created,
    meta: { mode: plan.mode },
  });

  return NextResponse.json({
    created: created.length,
    openSlots: open.length,
    ids: created,
    errors,
  });
}
