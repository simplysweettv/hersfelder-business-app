import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadSettings } from "@/lib/settings";
import {
  buildCaptionPrompt,
  buildImagePrompt,
  generateCaption,
  generateImage,
} from "@/lib/openai";
import type { GeneratorInput } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: GeneratorInput & { occasion?: string; scheduledAt?: string };
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
      {
        error:
          "Kein OPENAI_API_KEY gesetzt (weder als env var noch im Settings-Eintrag 'openai_api_key').",
      },
      { status: 400 },
    );
  }

  try {
    const imagePrompt = buildImagePrompt({
      brandStyle: settings["brand_style_prompt"],
      theme: body.theme,
      product: body.product,
      message: body.message,
    });
    const captionPrompt = buildCaptionPrompt({
      theme: body.theme,
      product: body.product,
      message: body.message,
    });

    const [image, caption] = await Promise.all([
      generateImage({ apiKey, prompt: imagePrompt, size: "1024x1024" }),
      generateCaption({ apiKey, prompt: captionPrompt }),
    ]);

    // Upload image to Supabase Storage
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

    const now = new Date();
    const week = isoWeek(now);
    const year = isoWeekYear(now);

    const { data: post, error: insertErr } = await supabase
      .from("posts")
      .insert({
        title: `${body.theme}: ${body.product}`.slice(0, 200),
        image_url: imageUrl,
        caption,
        status: "pending",
        platforms: body.platforms,
        scheduled_at: body.scheduledAt ?? null,
        week_number: week,
        year,
      })
      .select("*")
      .single();
    if (insertErr) throw new Error(insertErr.message);

    await supabase.from("post_briefs").insert({
      post_id: post.id,
      theme: body.theme,
      occasion: body.occasion ?? body.theme,
      product: body.product,
      season: body.season ?? null,
      message: body.message,
      prompt_used: imagePrompt,
    });

    return NextResponse.json({
      id: post.id,
      image_url: imageUrl,
      caption,
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
