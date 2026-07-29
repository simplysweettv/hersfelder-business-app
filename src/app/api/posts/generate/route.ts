import { NextResponse, type NextRequest } from "next/server";
import { isoWeek, isoWeekYear } from "@/lib/berlin-time";
import { createClient } from "@/lib/supabase/server";
import { loadSettings } from "@/lib/settings";
import { buildCaptionPrompt } from "@/lib/openai";
import {
  buildManualFormat,
  generateDesignedConcept,
  createDesignedPostImage,
  conceptHookText,
  generateCompliantCaption,
} from "@/lib/designed-post";
import { BANNED_PHRASES, type Lane } from "@/lib/concepts";
import { reviewDesignedPost } from "@/lib/designed-review";
import type { GeneratorInput } from "@/types";

// Nur bekannte Kanäle zulassen — ein unbekannter Wert landete sonst in der
// DB und ließ die Freigabe später mit einem TypeError abstürzen.
const VALID_PLATFORMS = ["instagram", "facebook", "tiktok", "linkedin"] as const;

export const runtime = "nodejs";
// Bildgenerierung + Zwei-Agenten-Freigabe brauchen deutlich mehr als eine
// Minute — bei 60s lief die Route in einen 504 (Vercel erlaubt bis 300s).
export const maxDuration = 300;

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

  body.platforms = (body.platforms ?? []).filter((x) =>
    (VALID_PLATFORMS as readonly string[]).includes(x),
  );
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

    // Zwei-Agenten-Freigabe auf dem FERTIGEN Composite.
    const review = await reviewDesignedPost({
      apiKey,
      jpeg: rendered.jpeg,
      concept,
      caption,
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
        quality_notes: review.notes,
        quality_status: review.status,
      })
      .select("*")
      .single();
    if (insertErr) throw new Error(insertErr.message);

    const { error: briefErr } = await supabase.from("post_briefs").insert({
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
      lane,
      review: { score: review.score, issues: review.notes, pass: review.pass },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}


