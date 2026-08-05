import { NextResponse, type NextRequest } from "next/server";
import { isoWeek, isoWeekYear } from "@/lib/berlin-time";
import { createClient } from "@/lib/supabase/server";
import { loadSettings } from "@/lib/settings";
import { buildCaptionPrompt } from "@/lib/openai";
import {
  buildManualFormat,
  conceptHookText,
  generateCompliantCaption,
  generateDesignedConcept,
} from "@/lib/designed-post";
import {
  CAROUSEL_COVER_LAYOUTS,
  MAX_POINTS,
  MIN_POINTS,
  SWIPE_HINT,
  carouselTextOf,
  createCarouselImages,
  generateCarouselStory,
} from "@/lib/carousel-post";
import { BANNED_PHRASES, conceptByCode, pickConceptFormat, pickLane, type Lane } from "@/lib/concepts";
import { computeContentPerformance } from "@/lib/learning";
import { reviewDesignedPost } from "@/lib/designed-review";

// Nur bekannte Kanäle zulassen — ein unbekannter Wert landete sonst in der
// DB und ließ die Freigabe später mit einem TypeError abstürzen.
const VALID_PLATFORMS = ["instagram", "facebook", "tiktok", "linkedin"] as const;

export const runtime = "nodejs";
// Foto + Cover-Render + bis zu 6 Slide-Renders + zwei Vision-Checks — das
// braucht deutlich mehr als eine Minute (bei 60 s gab es HTTP 504).
export const maxDuration = 300;

/**
 * Karussell-Post (Wiedereinführung Juli 2026).
 *
 * Ablauf: Konzept-Format wählen (Rotation) → Cover-Konzept über die designte
 * Pipeline (Statement-Layout + Foto + Wisch-Hinweis) → Story-KI faltet dieselbe
 * Aussage in Inhalts-Slides auf → alles rendern → Caption → Qualitäts-TÜV auf
 * dem COVER (die Slide, die im Feed über Erfolg oder Misserfolg entscheidet).
 *
 * `image_url` = Cover, `image_urls` = alle Slides in Reihenfolge. Genau so
 * erwarten es Freigaben-UI und Publishing-Pipeline (`mediaUrls` in Blotato).
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
  let points = 4;
  let manual: { theme: string; product: string; message: string } | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body.platforms) && body.platforms.length > 0) {
      const clean = body.platforms.filter((x: string) =>
        (VALID_PLATFORMS as readonly string[]).includes(x),
      );
      if (clean.length) platforms = clean;
    }
    if (typeof body.scheduledAt === "string" && body.scheduledAt.trim()) scheduledAt = body.scheduledAt;
    if (body.lane === "emotional" || body.lane === "product") laneParam = body.lane;
    if (typeof body.formatCode === "string" && body.formatCode.trim()) formatCodeParam = body.formatCode.trim();
    if (Number.isFinite(body.points)) {
      points = Math.min(MAX_POINTS, Math.max(MIN_POINTS, Math.round(Number(body.points))));
    }
    if (body.theme && body.product && body.message) {
      manual = {
        theme: String(body.theme),
        product: String(body.product),
        message: String(body.message),
      };
    }
  } catch {
    // Defaults
  }

  const settings = await loadSettings();
  const apiKey = process.env.OPENAI_API_KEY || settings["openai_api_key"] || undefined;
  if (!apiKey) {
    return NextResponse.json({ error: "Kein OPENAI_API_KEY gesetzt." }, { status: 400 });
  }

  try {
    // Rotation: zuletzt genutzte Formate/Themen meiden, Lane-Wechsel erzwingen.
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
    const recentLayouts = (recentBriefs ?? [])
      .map((b) => b.template)
      .filter((x): x is string => Boolean(x))
      .slice(0, 3);

    const refDate = scheduledAt ? new Date(scheduledAt) : new Date();
    const month = refDate.getMonth() + 1;
    const week = isoWeek(refDate);
    const year = isoWeekYear(refDate);

    const perf = await computeContentPerformance();
    const lane: Lane = laneParam ?? pickLane({ previousLane: prevLane, laneMult: perf.laneMult });
    const format = manual
      ? buildManualFormat(lane, manual)
      : ((formatCodeParam ? conceptByCode(formatCodeParam) : undefined) ??
        pickConceptFormat({ lane, avoidCodes: recentFormats, month, formatMult: perf.formatMult }));

    // 1) Cover-Konzept. Nur Statement-Layouts: Slide 1 muss für sich allein
    //    ziehen — Benefit-Leiste und CTA gehören ans Ende des Karussells.
    const concept = await generateDesignedConcept({
      apiKey,
      format,
      reactiveHook: null,
      topical: null,
      avoid: manual ? [] : avoidThemes,
      avoidLayouts: recentLayouts,
      allowedLayouts: CAROUSEL_COVER_LAYOUTS,
      month,
    });
    concept.poster.swipeHint = SWIPE_HINT;

    // 2) Story-Slides + Caption parallel (beide hängen nur am Cover-Konzept).
    const pillar = lane === "product" ? "service" : "community";
    const captionPrompt = `${buildCaptionPrompt({
      theme: concept.theme,
      product: concept.product,
      message: concept.message,
      platforms,
      pillar,
      hook: conceptHookText(concept),
      bannedPhrases: BANNED_PHRASES,
    })}

FORMAT-HINWEIS: Dieser Post ist ein KARUSSELL aus mehreren Bildern. Lade einmal beiläufig zum Weiterwischen ein (z. B. „Wischt euch durch" / „Auf den nächsten Bildern …") — nur EINMAL, unaufdringlich, und wiederhole NICHT die Inhalte der einzelnen Slides.`;

    const [slides, captionInitial] = await Promise.all([
      generateCarouselStory({ apiKey, concept, format, points }),
      generateCompliantCaption({ apiKey, captionPrompt, bannedPhrases: BANNED_PHRASES }),
    ]);
    let caption = captionInitial;

    // 3) Rendern: Cover über die Poster-Engine, Slides über die Karussell-Engine.
    const images = await createCarouselImages({
      apiKey,
      concept,
      slides,
      brandStyle: settings["brand_style_prompt"],
    });

    // 4) Upload — Reihenfolge ist bedeutungstragend (Cover zuerst).
    const urls: string[] = [];
    const all = [images.cover, ...images.slides];
    for (let i = 0; i < all.length; i++) {
      const filename = `${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("post-images")
        .upload(filename, all[i], { contentType: "image/jpeg", upsert: false });
      if (upErr) throw new Error(`Upload Slide ${i + 1}: ${upErr.message}`);
      urls.push(supabase.storage.from("post-images").getPublicUrl(filename).data.publicUrl);
    }

    // 5) Qualitäts-TÜV auf dem Cover. Die Folge-Slides sind pixelgenau gerendert
    //    (kein KI-Bild), ihr Risiko liegt im Text — den prüft der QA-Agent über
    //    den mitgelieferten Slide-Text mit.
    let review = await reviewDesignedPost({
      apiKey,
      jpeg: images.cover,
      concept,
      caption: `${caption}\n\n--- WEITERE KARUSSELL-SLIDES (Text) ---\n${carouselTextOf(slides)}`,
    });
    if (!review.pass && (review.failArea === "text" || review.failArea === "both")) {
      const retry = await generateCompliantCaption({ apiKey, captionPrompt, bannedPhrases: BANNED_PHRASES });
      if (retry) {
        caption = retry;
        review = await reviewDesignedPost({
          apiKey,
          jpeg: images.cover,
          concept,
          caption: `${caption}\n\n--- WEITERE KARUSSELL-SLIDES (Text) ---\n${carouselTextOf(slides)}`,
        });
      }
    }

    const { data: post, error: insertErr } = await supabase
      .from("posts")
      .insert({
        title: `${concept.theme}: ${concept.product}`.slice(0, 200),
        image_url: urls[0],
        image_urls: urls,
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
      .select("id")
      .single();
    if (insertErr) throw new Error(insertErr.message);

    const { error: briefErr } = await supabase.from("post_briefs").insert({
      post_id: post.id,
      theme: concept.theme,
      occasion: format.name,
      product: concept.product,
      message: concept.message,
      prompt_used: images.photoPrompt,
      pillar,
      style_type: "carousel",
      lane,
      format_code: format.code,
      template: concept.posterCode,
    });
    // Nicht den fertigen Post verwerfen, aber den Fehlschlag sichtbar machen —
    // ohne Briefing fehlt die Grundlage für Rotation und Lern-Auswertung.
    if (briefErr) console.error("post_briefs insert fehlgeschlagen:", briefErr.message);

    return NextResponse.json({
      id: post.id,
      image_url: urls[0],
      image_urls: urls,
      slides: urls.length,
      caption,
      lane,
      format: { code: format.code, name: format.name, layout: concept.posterCode },
      review: { score: review.score, issues: review.notes, pass: review.pass },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
