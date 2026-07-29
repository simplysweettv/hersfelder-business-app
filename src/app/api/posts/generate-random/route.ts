import { NextResponse, type NextRequest } from "next/server";
import { isoWeek, isoWeekYear } from "@/lib/berlin-time";
import { createClient } from "@/lib/supabase/server";
import { loadSettings } from "@/lib/settings";
import { buildCaptionPrompt } from "@/lib/openai";
import {
  generateDesignedConcept,
  createDesignedPostImage,
  conceptHookText,
  generateCompliantCaption,
} from "@/lib/designed-post";
import { conceptByCode, pickConceptFormat, pickLane, BANNED_PHRASES, type Lane } from "@/lib/concepts";
import { computeContentPerformance } from "@/lib/learning";
import { getTopicalContext } from "@/lib/topical";
import { reviewDesignedPost } from "@/lib/designed-review";

// Nur bekannte Kanäle zulassen — ein unbekannter Wert landete sonst in der
// DB und ließ die Freigabe später mit einem TypeError abstürzen.
const VALID_PLATFORMS = ["instagram", "facebook", "tiktok", "linkedin"] as const;

export const runtime = "nodejs";
// Bildgenerierung + Zwei-Agenten-Freigabe brauchen deutlich mehr als eine
// Minute — bei 60s lief die Route in einen 504 (Vercel erlaubt bis 300s).
export const maxDuration = 300;

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
      const clean = body.platforms.filter((x: string) =>
        (VALID_PLATFORMS as readonly string[]).includes(x),
      );
      if (clean.length) platforms = clean;
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
      .select("format_code, lane, theme, template")
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
    // Zuletzt genutzte Plakat-Layouts meiden → Abwechslung im Feed.
    const recentLayouts = (recentBriefs ?? [])
      .map((b) => b.template)
      .filter((x): x is string => Boolean(x))
      .slice(0, 3);

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
      avoidLayouts: recentLayouts,
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
    let review = await reviewDesignedPost({ apiKey, jpeg: rendered.jpeg, concept, caption });
    // Textproblem → Caption neu ziehen und noch einmal prüfen.
    if (!review.pass && (review.failArea === "text" || review.failArea === "both")) {
      const retry = await generateCompliantCaption({ apiKey, captionPrompt, bannedPhrases: BANNED_PHRASES });
      if (retry) {
        caption = retry;
        review = await reviewDesignedPost({ apiKey, jpeg: rendered.jpeg, concept, caption });
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
        quality_notes: review.notes,
        quality_status: review.status,
      })
      .select("*")
      .single();
    if (insertErr) throw new Error(insertErr.message);

    const { error: briefErr } = await supabase.from("post_briefs").insert({
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
      template: concept.posterCode,
    });
    // Nicht den fertigen Post verwerfen, aber den Fehlschlag sichtbar machen —
    // ohne Briefing fehlt die Grundlage für Rotation und Lern-Auswertung.
    if (briefErr) {
      console.error("post_briefs insert fehlgeschlagen:", briefErr.message);
    }

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
        issues: review.notes,
        pass: review.pass,
        failArea: review.failArea,
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


