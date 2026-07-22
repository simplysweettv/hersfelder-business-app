import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSettings } from "@/lib/settings";
import { buildCaptionPrompt, reviewPost } from "@/lib/openai";
import {
  generateDesignedConcept,
  createDesignedPostImage,
  conceptHookText,
  generateCompliantCaption,
} from "@/lib/designed-post";
import { conceptByCode, pickConceptFormat, BANNED_PHRASES, type Lane } from "@/lib/concepts";
import { getTopicalContext } from "@/lib/topical";
import { qualityStatusFrom } from "@/lib/quality";

/**
 * Dev-only: erzeugt einen kompletten designten Post über die ECHTE Pipeline
 * (Konzept → gpt-image-1 → Overlay → Upload → Caption → TÜV → DB) — zum
 * lokalen Verifizieren ohne Login. In Produktion: 404.
 *
 *   GET /api/dev/generate-designed?lane=emotional|product[&format=E1|P2|…]
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  }

  const laneParam = req.nextUrl.searchParams.get("lane");
  const lane: Lane = laneParam === "product" ? "product" : "emotional";
  const formatParam = req.nextUrl.searchParams.get("format");

  const supabase = createAdminClient();
  const settings = await loadSettings();
  const apiKey = process.env.OPENAI_API_KEY || settings["openai_api_key"] || undefined;
  if (!apiKey) return NextResponse.json({ error: "Kein OPENAI_API_KEY." }, { status: 400 });

  try {
    const { data: recentBriefs } = await supabase
      .from("post_briefs")
      .select("format_code, theme")
      .order("created_at", { ascending: false })
      .limit(8);
    const recentFormats = (recentBriefs ?? [])
      .map((b) => b.format_code)
      .filter((x): x is string => Boolean(x))
      .slice(0, 4);
    const avoid = (recentBriefs ?? [])
      .map((b) => b.theme)
      .filter((x): x is string => Boolean(x));

    const now = new Date();
    const month = now.getMonth() + 1;
    const format =
      (formatParam ? conceptByCode(formatParam) : undefined) ??
      pickConceptFormat({ lane, avoidCodes: recentFormats, month });

    const topical = await getTopicalContext();
    const concept = await generateDesignedConcept({
      apiKey,
      format,
      reactiveHook: topical.reactiveHook ?? null,
      topical: topical.reactiveHook ? topical.text : null,
      avoid,
      month,
    });

    const pillar = lane === "product" ? "service" : "community";
    const captionPrompt = buildCaptionPrompt({
      theme: concept.theme,
      product: concept.product,
      message: concept.message,
      platforms: ["instagram", "facebook"],
      pillar,
      hook: conceptHookText(concept),
      bannedPhrases: BANNED_PHRASES,
    });
    const [rendered, caption] = await Promise.all([
      createDesignedPostImage({ apiKey, concept, brandStyle: settings["brand_style_prompt"] }),
      generateCompliantCaption({ apiKey, captionPrompt, bannedPhrases: BANNED_PHRASES }),
    ]);

    const filename = `${crypto.randomUUID()}.jpg`;
    const { error: upErr } = await supabase.storage
      .from("post-images")
      .upload(filename, rendered.jpeg, { contentType: "image/jpeg" });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
    const imageUrl = supabase.storage.from("post-images").getPublicUrl(filename).data.publicUrl;

    const review = await reviewPost({
      apiKey,
      caption,
      imageUrl,
      styleType: "hook",
      pillarLabel: format.name,
    });

    const { data: post, error: insertErr } = await supabase
      .from("posts")
      .insert({
        title: `${concept.theme}: ${concept.product}`.slice(0, 200),
        image_url: imageUrl,
        caption,
        status: "pending",
        platforms: ["instagram", "facebook"],
        scheduled_at: null,
        week_number: null,
        year: now.getFullYear(),
        quality_score: review.score,
        quality_notes: review.issues,
        quality_status: qualityStatusFrom(review),
      })
      .select("id")
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
      lane,
      format: { code: format.code, name: format.name, template: concept.template },
      image_url: imageUrl,
      overlay: concept.overlay,
      caption: caption.slice(0, 400),
      review: { score: review.score, imageOk: review.imageOk, captionOk: review.captionOk, issues: review.issues },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
