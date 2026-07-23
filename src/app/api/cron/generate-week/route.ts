import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSettings } from "@/lib/settings";
import { cronAuthorized } from "@/lib/cron-auth";
import { startRun, finishRun } from "@/lib/automation";
import { buildCaptionPrompt, reviewPost } from "@/lib/openai";
import {
  generateDesignedConcept,
  createDesignedPostImage,
  conceptHookText,
  generateCompliantCaption,
} from "@/lib/designed-post";
import { pickConceptFormat, pickLane, BANNED_PHRASES, type Lane } from "@/lib/concepts";
import { computeContentPerformance } from "@/lib/learning";
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

  // 3) Anti-Wiederholung: zuletzt genutzte Themen/Botschaften + Formate/Lanes laden.
  const { data: recentBriefs } = await supabase
    .from("post_briefs")
    .select("theme, message, format_code, lane")
    .order("created_at", { ascending: false })
    .limit(8);
  const avoid = (recentBriefs ?? [])
    .flatMap((b) => [b.theme, b.message])
    .filter((x): x is string => Boolean(x));
  const recentFormats = (recentBriefs ?? [])
    .map((b) => b.format_code)
    .filter((x): x is string => Boolean(x))
    .slice(0, 4);
  let prevLane: Lane | null = ((recentBriefs?.[0]?.lane as Lane | undefined) ?? null) || null;

  // 5er-Zyklus: jeder fünfte Post = garantierter Produkt-Post (mit CTA).
  const { count: totalPostCount } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true });
  const baseIndex = totalPostCount ?? 0;

  const created: string[] = [];
  const errors: string[] = [];

  // Selbstlernend: welche Lane/Formate performen am besten? (greift ab ≥8 Posts,
  // sonst neutrale Faktoren → keine Verzerrung). Einmal pro Lauf.
  const perf = await computeContentPerformance();

  for (const slot of open) {
    try {
      const week = isoWeek(slot.when);
      const year = isoWeekYear(slot.when);
      const month = slot.when.getUTCMonth() + 1;

      const postIndex = baseIndex + created.length;
      const isCTASlot = postIndex % 5 === 4;
      // Zwei-Säulen-System: 60 % emotional / 40 % Produkt, nie zwei Produkt-
      // Posts in Folge; der 5er-CTA-Slot erzwingt einen Produkt-Post.
      const lane: Lane = isCTASlot
        ? "product"
        : pickLane({ previousLane: prevLane, laneMult: perf.laneMult });
      const format = pickConceptFormat({
        lane,
        avoidCodes: recentFormats,
        month,
        formatMult: perf.formatMult,
      });
      const pillar = lane === "product" ? "service" : "community";

      // Wetter für den KONKRETEN Veröffentlichungstag (Prognose, wenn > 24h weg).
      const topical = await getWeatherForPublishDay(slot.when, now);

      const makePost = async () => {
        // 1) Konzept: Idee + Overlay-Text + Foto-Szene nach Format-Formel
        const concept = await generateDesignedConcept({
          apiKey,
          format,
          // Reaktiver Hook nur, wenn der Termin < 24h weg ist (sonst null).
          reactiveHook: topical.reactiveHook ?? null,
          // Wetter-Kontext nur bei echtem reaktivem Aufhänger.
          topical: topical.reactiveHook ? topical.text : null,
          avoid,
          month,
        });
        const captionPrompt = buildCaptionPrompt({
          theme: concept.theme,
          product: concept.product,
          message: concept.message,
          platforms: slot.platforms as string[],
          pillar,
          hook: conceptHookText(concept),
          bannedPhrases: BANNED_PHRASES,
        });
        // 2) Foto ohne Text + Marken-Overlay (parallel zur Caption)
        const [rendered, caption] = await Promise.all([
          createDesignedPostImage({ apiKey, concept, brandStyle: settings["brand_style_prompt"] }),
          generateCompliantCaption({ apiKey, captionPrompt, bannedPhrases: BANNED_PHRASES }),
        ]);
        let imageUrl: string | null = null;
        const filename = `${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("post-images")
          .upload(filename, rendered.jpeg, { contentType: "image/jpeg" });
        if (!upErr) {
          imageUrl = supabase.storage.from("post-images").getPublicUrl(filename).data.publicUrl;
        }
        const review = await reviewPost({
          apiKey,
          caption,
          imageUrl,
          styleType: "hook",
          pillarLabel: format.name,
        });
        return { concept, photoPrompt: rendered.photoPrompt, caption, imageUrl, review };
      };

      // Generieren + TÜV; bei schlechtem Ergebnis EINMAL komplett neu.
      let result = await makePost();
      if (!result.review.imageOk || (result.review.checked && result.review.score < 5)) {
        const retry = await makePost();
        if (retry.review.score >= result.review.score) result = retry;
      }

      const { concept, photoPrompt, caption, imageUrl, review } = result;
      const qualityStatus = qualityStatusFrom(review);
      avoid.unshift(concept.theme, concept.message);
      recentFormats.unshift(format.code);
      prevLane = lane;

      const { data: post } = await supabase
        .from("posts")
        .insert({
          title: `${concept.theme}`.slice(0, 200),
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
          theme: concept.theme,
          occasion: format.name,
          product: concept.product,
          message: concept.message,
          prompt_used: photoPrompt,
          pillar,
          style_type: "designed",
          lane,
          format_code: format.code,
          template: concept.template,
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
