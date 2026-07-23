import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadSettings } from "@/lib/settings";
import { buildCaptionPrompt, reviewPost } from "@/lib/openai";
import {
  generateDesignedConcept,
  createDesignedPostImage,
  conceptHookText,
  generateCompliantCaption,
} from "@/lib/designed-post";
import { conceptByCode, pickConceptFormat, pickLane, BANNED_PHRASES, type Lane } from "@/lib/concepts";
import { computeContentPerformance } from "@/lib/learning";
import { getTopicalContext } from "@/lib/topical";
import { qualityStatusFrom } from "@/lib/quality";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Zufalls-Post im Zwei-Säulen-System (Juli 2026):
 * Konzept-Format wählen (Rotation + Saison) → Konzept-KI (Idee + Headline nach
 * Formel) → Foto ohne Text (gpt-image-1) → Marken-Overlay (render-post) →
 * JPEG-Upload → Caption → Qualitäts-TÜV → pending in den Freigaben.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let platforms: string[] = ["instagram", "facebook"];
  let scheduledAt: string | null = null;
  let laneParam: Lane | null = null;
  let formatCodeParam: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body.platforms) && body.platforms.length > 0) {
      platforms = body.platforms;
    }
    if (typeof body.scheduledAt === "string" && body.scheduledAt.trim()) {
      scheduledAt = body.scheduledAt;
    }
    if (body.lane === "emotional" || body.lane === "product") {
      laneParam = body.lane;
    }
    if (typeof body.formatCode === "string" && body.formatCode.trim()) {
      formatCodeParam = body.formatCode.trim();
    }
  } catch {
    // use defaults
  }

  const settings = await loadSettings();
  const apiKey = process.env.OPENAI_API_KEY || settings["openai_api_key"] || undefined;
  if (!apiKey) {
    return NextResponse.json({ error: "Kein OPENAI_API_KEY gesetzt." }, { status: 400 });
  }

  try {
    // Rotation: letzte Formate/Themen meiden, Lane-Wechsel erzwingen
    const { data: recentBriefs } = await supabase
      .from("post_briefs")
      .select("format_code, lane, theme")
      .order("created_at", { ascending: false })
      .limit(8);
    const recentFormats = (recentBriefs ?? [])
      .map((b) => b.format_code)
      .filter((x): x is string => Boolean(x))
      .slice(0, 4);
    const avoidThemes = (recentBriefs ?? [])
      .map((b) => b.theme)
      .filter((x): x is string => Boolean(x));
    const prevLane = ((recentBriefs?.[0]?.lane as Lane | null) ?? null) || null;

    const refDate = scheduledAt ? new Date(scheduledAt) : new Date();
    const month = refDate.getMonth() + 1;
    const week = isoWeek(refDate);
    const year = isoWeekYear(refDate);

    // Selbstlernend: Lane/Formate nach Performance gewichten (neutral < 8 Posts).
    const perf = await computeContentPerformance();
    const lane: Lane = laneParam ?? pickLane({ previousLane: prevLane, laneMult: perf.laneMult });
    const format =
      (formatCodeParam ? conceptByCode(formatCodeParam) : undefined) ??
      pickConceptFormat({ lane, avoidCodes: recentFormats, month, formatMult: perf.formatMult });

    const topical = await getTopicalContext();

    // 1) Konzept: Idee + Overlay-Text + Foto-Szene aus einer Hand
    const concept = await generateDesignedConcept({
      apiKey,
      format,
      reactiveHook: topical.reactiveHook ?? null,
      // Wetter-Kontext nur bei echtem reaktivem Aufhänger (sonst leakt Temperatur in Produkt-Text)
      topical: topical.reactiveHook ? topical.text : null,
      avoid: avoidThemes,
      month,
    });

    // 2) Foto + Marken-Composite (parallel zur Caption)
    const pillar = lane === "product" ? "service" : "community";
    const captionPrompt = buildCaptionPrompt({
      theme: concept.theme,
      product: concept.product,
      message: concept.message,
      platforms,
      pillar,
      hook: conceptHookText(concept),
      bannedPhrases: BANNED_PHRASES,
    });
    const [rendered, captionInitial] = await Promise.all([
      createDesignedPostImage({ apiKey, concept, brandStyle: settings["brand_style_prompt"] }),
      generateCompliantCaption({ apiKey, captionPrompt, bannedPhrases: BANNED_PHRASES }),
    ]);
    let caption = captionInitial;

    // 3) Upload (JPEG — TikTok akzeptiert kein PNG)
    const filename = `${crypto.randomUUID()}.jpg`;
    const { error: upErr } = await supabase.storage
      .from("post-images")
      .upload(filename, rendered.jpeg, { contentType: "image/jpeg", upsert: false });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
    const { data: pub } = supabase.storage.from("post-images").getPublicUrl(filename);
    const imageUrl = pub.publicUrl;

    // 4) Qualitäts-TÜV auf dem FERTIGEN Composite (Overlay-Text ist gerendert,
    //    der Check greift v. a. für Foto-Realismus + Caption)
    let review = await reviewPost({ apiKey, caption, imageUrl, styleType: "hook", pillarLabel: format.name });
    if (!review.captionOk) {
      const retry = await generateCompliantCaption({ apiKey, captionPrompt, bannedPhrases: BANNED_PHRASES });
      if (retry) {
        caption = retry;
        review = await reviewPost({ apiKey, caption, imageUrl, styleType: "hook", pillarLabel: format.name });
      }
    }

    const { data: post, error: insertErr } = await supabase
      .from("posts")
      .insert({
        title: `${concept.theme}: ${concept.product}`.slice(0, 200),
        image_url: imageUrl,
        caption,
        status: "pending",
        platforms,
        scheduled_at: scheduledAt,
        week_number: week,
        year,
        quality_score: review.score,
        quality_notes: review.issues,
        quality_status: qualityStatusFrom(review),
      })
      .select("*")
      .single();
    if (insertErr) throw new Error(insertErr.message);

    await supabase.from("post_briefs").insert({
      post_id: post.id,
      theme: concept.theme,
      occasion: format.name,
      product: concept.product,
      message: concept.message,
      prompt_used: rendered.photoPrompt,
      pillar,
      style_type: "designed",
      lane,
      format_code: format.code,
      template: concept.template,
    });

    return NextResponse.json({
      id: post.id,
      image_url: imageUrl,
      caption,
      status: "pending",
      scheduled_at: scheduledAt,
      lane,
      format: { code: format.code, name: format.name, template: concept.template },
      review: {
        score: review.score,
        issues: review.issues,
        imageOk: review.imageOk,
        captionOk: review.captionOk,
      },
      brief: {
        theme: concept.theme,
        product: concept.product,
        message: concept.message,
        styleType: "designed",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

function isoWeekYear(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  return t.getUTCFullYear();
}
