import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSettings } from "@/lib/settings";
import {
  buildCaptionPrompt,
  buildImagePrompt,
  generateBrief,
  generateCaption,
  generateImage,
} from "@/lib/openai";
import { addDays, startOfISOWeek, getISOWeek, getISOWeekYear, setHours, setMinutes } from "date-fns";
import type { Platform } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 300;
// Cron immer frisch ausführen — nie statisch prerendern.
export const dynamic = "force-dynamic";

// imageSize: portrait for IG/TikTok-first posts, landscape for FB/LI-first, square for mixed
const WEEKLY_TEMPLATE: Array<{
  dayOffset: number;
  hour: number;
  themeCategory: string;
  styleType: "photo" | "typography" | "product" | "hook";
  platforms: Platform[];
  imageSize: "1024x1024" | "1024x1536" | "1536x1024";
}> = [
  {
    dayOffset: 2, // Mittwoch — Lifestyle Foto, Portrait für IG/TikTok
    hour: 17,
    themeCategory: "Feiern & Zusammensein beim Schützenfest",
    styleType: "photo",
    platforms: ["instagram", "facebook", "tiktok"],
    imageSize: "1024x1536",
  },
  {
    dayOffset: 5, // Samstag — Hook-Text auf Foto oder Typografie
    hour: 12,
    themeCategory: "Tradition & Stolz auf den Verein",
    styleType: "hook",
    platforms: ["instagram", "facebook", "tiktok"],
    imageSize: "1024x1536",
  },
];

// Rotierender Stil — jede Woche wechselt der Samstags-Post
// Kein "typography" mehr: der Typ kann wie nationalistische Grafiken wirken.
const HOOK_ROTATION: Array<"photo" | "hook"> = [
  "hook", "hook", "photo", "hook", "hook", "photo", "hook", "hook", "photo", "hook", "hook", "photo",
  "hook", "hook", "photo", "hook", "hook", "photo", "hook", "hook", "photo", "hook", "hook", "photo",
  "hook", "hook", "photo", "hook", "hook", "photo", "hook", "hook", "photo", "hook", "hook", "photo",
  "hook", "hook", "photo", "hook", "hook", "photo", "hook", "hook", "photo", "hook", "hook", "photo",
  "hook", "hook", "photo", "hook",
];

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const settings = await loadSettings();
  const apiKey = process.env.OPENAI_API_KEY || settings["openai_api_key"] || undefined;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY missing." },
      { status: 400 },
    );
  }

  // Always generate for NEXT week
  const now = new Date();
  const nextMonday = addDays(startOfISOWeek(now), 7);
  const week = getISOWeek(nextMonday);
  const year = getISOWeekYear(nextMonday);

  // Fetch already-existing scheduled_at times for this week to skip completed slots
  const { data: existingPosts } = await supabase
    .from("posts")
    .select("scheduled_at")
    .eq("week_number", week)
    .eq("year", year);

  const existingTimes = new Set(
    (existingPosts ?? []).map((p: { scheduled_at: string }) =>
      new Date(p.scheduled_at).toISOString()
    )
  );

  const created: string[] = [];
  const errors: string[] = [];

  console.log(`[generate-week] Starting KW${week}/${year}, existingTimes: ${existingTimes.size}`);

  for (const slot of WEEKLY_TEMPLATE) {
    try {
      // Skip this slot if it was already generated
      const when = setMinutes(setHours(addDays(nextMonday, slot.dayOffset), slot.hour), 0);
      console.log(`[generate-week] Slot ${slot.themeCategory} → ${when.toISOString()} skip=${existingTimes.has(when.toISOString())}`);
      if (existingTimes.has(when.toISOString())) continue;

      // Samstags-Post rotiert jede Woche zwischen hook / typography / photo
      const effectiveStyleType =
        slot.styleType === "hook"
          ? HOOK_ROTATION[(week - 1) % HOOK_ROTATION.length]
          : slot.styleType;
      console.log(`[generate-week] styleType=${effectiveStyleType} size=${slot.imageSize}`);

      // Step 1: AI generates a creative brief for this slot
      const brief = await generateBrief({
        apiKey,
        themeCategory: slot.themeCategory,
        styleType: effectiveStyleType,
        weekNumber: week,
        year,
      });

      // Step 2: Build prompts using the AI-generated brief
      const imagePrompt = buildImagePrompt({
        brandStyle: settings["brand_style_prompt"],
        theme: brief.theme,
        product: brief.product,
        message: brief.message,
        styleType: effectiveStyleType,
        visualDetails: brief.visualDetails,
      });

      const captionPrompt = buildCaptionPrompt({
        theme: brief.theme,
        product: brief.product,
        message: brief.message,
        platforms: slot.platforms as string[],
      });

      // Step 3: Generate image and caption in parallel
      const [image, caption] = await Promise.all([
        generateImage({ apiKey, prompt: imagePrompt, size: slot.imageSize }),
        generateCaption({ apiKey, prompt: captionPrompt }),
      ]);

      // Step 4: Upload image to Supabase Storage
      let imageUrl: string | null = null;
      if (image.b64) {
        const buffer = Buffer.from(image.b64, "base64");
        const filename = `${crypto.randomUUID()}.png`;
        const { error: upErr } = await supabase.storage
          .from("post-images")
          .upload(filename, buffer, { contentType: "image/png" });
        if (!upErr) {
          const { data: pub } = supabase.storage
            .from("post-images")
            .getPublicUrl(filename);
          imageUrl = pub.publicUrl;
        }
      } else if (image.url) {
        imageUrl = image.url;
      }

      // Step 5: Save post to database
      const { data: post } = await supabase
        .from("posts")
        .insert({
          title: `KW${week} ${brief.theme}`,
          image_url: imageUrl,
          caption,
          status: "pending",
          platforms: slot.platforms,
          scheduled_at: when.toISOString(),
          week_number: week,
          year,
        })
        .select("id")
        .single();

      if (post) {
        created.push(post.id);
        await supabase.from("post_briefs").insert({
          post_id: post.id,
          theme: brief.theme,
          occasion: slot.themeCategory,
          product: brief.product,
          message: brief.message,
          prompt_used: imagePrompt,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[generate-week] ERROR", slot.themeCategory, msg, e);
      errors.push(`${slot.themeCategory}: ${msg}`);
    }
  }

  console.log(`[generate-week] Done: created=${created.length} errors=${errors.length}`);
  return NextResponse.json({ created: created.length, week, year, ids: created, errors });
}
