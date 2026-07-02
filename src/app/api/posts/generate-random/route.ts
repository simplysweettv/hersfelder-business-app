import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
import { getTopicalContext } from "@/lib/topical";
import { CONTENT_PILLARS, type PillarKey } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let platforms: string[] = ["instagram", "facebook"];
  let scheduledAt: string | null = null;
  let pillarParam: PillarKey | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body.platforms) && body.platforms.length > 0) {
      platforms = body.platforms;
    }
    if (typeof body.scheduledAt === "string" && body.scheduledAt.trim()) {
      scheduledAt = body.scheduledAt;
    }
    if (
      typeof body.pillar === "string" &&
      CONTENT_PILLARS.some((p) => p.key === body.pillar)
    ) {
      pillarParam = body.pillar as PillarKey;
    }
  } catch {
    // use defaults
  }

  const settings = await loadSettings();
  const apiKey = process.env.OPENAI_API_KEY || settings["openai_api_key"] || undefined;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Kein OPENAI_API_KEY gesetzt." },
      { status: 400 },
    );
  }

  try {
    // Content-Säule: explizit gewählt oder gewichtet automatisch.
    const pillar = pillarParam ?? pickPillar();

    // Letzte Stile laden — Text-im-Bild-Garantie auch im manuellen Generator.
    const { data: recentBriefs } = await supabase
      .from("post_briefs")
      .select("style_type")
      .order("created_at", { ascending: false })
      .limit(4);
    const recentStyles = (recentBriefs ?? [])
      .map((b) => b.style_type)
      .filter((x): x is string => Boolean(x));

    const { styleType, themeCategory } = pillarPick(pillar, recentStyles);

    // Woche/Jahr aus dem geplanten Datum berechnen (für Kalender + Wochenplan),
    // sonst aus "jetzt".
    const refDate = scheduledAt ? new Date(scheduledAt) : new Date();
    const week = isoWeek(refDate);
    const year = isoWeekYear(refDate);

    const topical = await getTopicalContext();

    const brief = await generateBrief({
      apiKey,
      themeCategory,
      styleType,
      weekNumber: week,
      year,
      month: refDate.getMonth() + 1,
      pillar,
      topical: topical.text,
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
      platforms,
      pillar,
    });

    const imageSize = styleType === "hook" ? "1024x1536" : "1024x1024";
    const [image, captionInitial] = await Promise.all([
      generateImage({ apiKey, prompt: imagePrompt, size: imageSize }),
      generateCaption({ apiKey, prompt: captionPrompt }),
    ]);
    let caption = captionInitial;

    let imageUrl: string | null = null;
    if (image.b64) {
      const buffer = Buffer.from(image.b64, "base64");
      const filename = `${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("post-images")
        .upload(filename, buffer, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
      const { data: pub } = supabase.storage
        .from("post-images")
        .getPublicUrl(filename);
      imageUrl = pub.publicUrl;
    } else if (image.url) {
      imageUrl = image.url;
    }

    // Qualitäts-TÜV: zweite KI prüft Bild + Text.
    const pillarLabel = CONTENT_PILLARS.find((p) => p.key === pillar)?.label;
    let review = await reviewPost({ apiKey, caption, imageUrl, styleType, pillarLabel });

    // Caption durchgefallen → einmal neu texten (günstig, kein Bild-Neugen).
    if (!review.captionOk) {
      const retry = await generateCaption({ apiKey, prompt: captionPrompt });
      if (retry) {
        caption = retry;
        review = await reviewPost({ apiKey, caption, imageUrl, styleType, pillarLabel });
      }
    }

    // Immer "pending": der Post landet zuerst in den Freigaben, damit Andreas
    // ihn reviewen kann. Nach der Freigabe macht die approve-Route daraus
    // "scheduled" (weil scheduled_at gesetzt ist) und der Cron postet zum Termin.
    const { data: post, error: insertErr } = await supabase
      .from("posts")
      .insert({
        title: `${brief.theme}: ${brief.product}`.slice(0, 200),
        image_url: imageUrl,
        caption,
        status: "pending",
        platforms,
        scheduled_at: scheduledAt,
        week_number: week,
        year,
        quality_score: review.score,
        quality_notes: review.issues,
      })
      .select("*")
      .single();
    if (insertErr) throw new Error(insertErr.message);

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

    return NextResponse.json({
      id: post.id,
      image_url: imageUrl,
      caption,
      status: "pending",
      scheduled_at: scheduledAt,
      pillar,
      review: {
        score: review.score,
        issues: review.issues,
        imageOk: review.imageOk,
        captionOk: review.captionOk,
      },
      brief: {
        theme: brief.theme,
        product: brief.product,
        message: brief.message,
        styleType,
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
