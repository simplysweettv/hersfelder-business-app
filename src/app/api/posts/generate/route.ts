import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadSettings } from "@/lib/settings";
import { buildCaptionPrompt, reviewPost } from "@/lib/openai";
import {
  buildManualFormat,
  generateDesignedConcept,
  createDesignedPostImage,
  conceptHookText,
  generateCompliantCaption,
} from "@/lib/designed-post";
import { BANNED_PHRASES, type Lane } from "@/lib/concepts";
import { qualityStatusFrom } from "@/lib/quality";
import type { GeneratorInput } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Manueller Generator — jetzt ebenfalls über die designte Zwei-Säulen-Pipeline:
 * Die freien Eingaben (Thema/Produkt/Botschaft) werden als synthetisches Format
 * an die Konzept-KI gegeben, die daraus Overlay + Foto-Szene ableitet; danach
 * Marken-Composite + floskelsichere Caption + Qualitäts-TÜV.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: GeneratorInput & { occasion?: string; scheduledAt?: string; lane?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.theme || !body.product || !body.message || !body.platforms?.length) {
    return NextResponse.json(
      { error: "theme, product, message und platforms sind Pflicht." },
      { status: 400 },
    );
  }

  const settings = await loadSettings();
  const apiKey = process.env.OPENAI_API_KEY || settings["openai_api_key"] || undefined;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Kein OPENAI_API_KEY gesetzt (env var oder Settings 'openai_api_key')." },
      { status: 400 },
    );
  }

  try {
    const lane: Lane = body.lane === "product" ? "product" : "emotional";
    const format = buildManualFormat(lane, {
      theme: body.theme,
      product: body.product,
      message: body.message,
    });

    const now = new Date();
    const concept = await generateDesignedConcept({
      apiKey,
      format,
      reactiveHook: null,
      topical: null,
      avoid: [],
      month: now.getMonth() + 1,
    });

    const pillar = lane === "product" ? "service" : "community";
    const captionPrompt = buildCaptionPrompt({
      theme: concept.theme,
      product: concept.product,
      message: concept.message,
      platforms: body.platforms,
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
      .upload(filename, rendered.jpeg, { contentType: "image/jpeg", upsert: false });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
    const imageUrl = supabase.storage.from("post-images").getPublicUrl(filename).data.publicUrl;

    const review = await reviewPost({
      apiKey,
      caption,
      imageUrl,
      styleType: "hook",
      pillarLabel: format.name,
    });

    const week = isoWeek(now);
    const year = isoWeekYear(now);

    const { data: post, error: insertErr } = await supabase
      .from("posts")
      .insert({
        title: `${concept.theme}: ${concept.product}`.slice(0, 200),
        image_url: imageUrl,
        caption,
        status: "pending",
        platforms: body.platforms,
        scheduled_at: body.scheduledAt ?? null,
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
      occasion: body.occasion ?? body.theme,
      product: concept.product,
      season: body.season ?? null,
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
      lane,
      review: { score: review.score, issues: review.issues },
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
