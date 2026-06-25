import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadSettings } from "@/lib/settings";
import {
  buildCaptionPrompt,
  buildImagePrompt,
  generateBrief,
  generateCaption,
  generateImage,
} from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const THEME_CATEGORIES = [
  "Schützenfest",
  "Vereinsleben",
  "Tradition & Gemeinschaft",
  "Jungschützen",
  "Generationen im Verein",
  "Saisonstart",
  "Zusammenhalt",
  "Festzelt-Stimmung",
];

const STYLE_TYPES = ["photo", "photo", "hook", "typography"] as const;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let platforms: string[] = ["instagram", "facebook"];
  try {
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body.platforms) && body.platforms.length > 0) {
      platforms = body.platforms;
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
    const themeCategory = THEME_CATEGORIES[Math.floor(Math.random() * THEME_CATEGORIES.length)];
    const styleType = STYLE_TYPES[Math.floor(Math.random() * STYLE_TYPES.length)];

    const now = new Date();
    const week = isoWeek(now);
    const year = isoWeekYear(now);

    const brief = await generateBrief({
      apiKey,
      themeCategory,
      styleType,
      weekNumber: week,
      year,
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
      platforms,
    });

    const imageSize = styleType === "hook" ? "1024x1536" : "1024x1024";
    const [image, caption] = await Promise.all([
      generateImage({ apiKey, prompt: imagePrompt, size: imageSize }),
      generateCaption({ apiKey, prompt: captionPrompt }),
    ]);

    let imageUrl: string | null = null;
    if (image.b64) {
      const buffer = Buffer.from(image.b64, "base64");
      const filename = `${crypto.randomUUID()}.png`;
      const { error: upErr } = await supabase.storage
        .from("post-images")
        .upload(filename, buffer, { contentType: "image/png", upsert: false });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
      const { data: pub } = supabase.storage
        .from("post-images")
        .getPublicUrl(filename);
      imageUrl = pub.publicUrl;
    } else if (image.url) {
      imageUrl = image.url;
    }

    const { data: post, error: insertErr } = await supabase
      .from("posts")
      .insert({
        title: `${brief.theme}: ${brief.product}`.slice(0, 200),
        image_url: imageUrl,
        caption,
        status: "pending",
        platforms,
        scheduled_at: null,
        week_number: week,
        year,
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
    });

    return NextResponse.json({
      id: post.id,
      image_url: imageUrl,
      caption,
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
