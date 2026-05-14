import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadSettings } from "@/lib/settings";
import {
  buildCaptionPrompt,
  buildImagePrompt,
  generateCaption,
  generateImage,
} from "@/lib/openai";
import { addDays, startOfISOWeek, getISOWeek, getISOWeekYear, setHours, setMinutes } from "date-fns";
import type { Platform } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const WEEKLY_PLAN: Array<{
  dayOffset: number; // 0 = Mon
  hour: number;
  theme: string;
  product: string;
  message: string;
  platforms: Platform[];
}> = [
  {
    dayOffset: 0,
    hour: 11,
    theme: "Vereinsleben",
    product: "Schützenverein im Alltag",
    message: "Stark gemeinsam — Hersfelder steht hinter eurem Verein.",
    platforms: ["instagram", "facebook"],
  },
  {
    dayOffset: 2,
    hour: 17,
    theme: "Produktvorstellung",
    product: "Schützenrock Klassik",
    message: "Tradition trifft Qualität — der Klassiker aus Hersfeld.",
    platforms: ["instagram", "facebook", "tiktok"],
  },
  {
    dayOffset: 3,
    hour: 18,
    theme: "Schützenfest",
    product: "Festtagsbekleidung 2026",
    message: "Bereit für die Saison? Wir statten dich aus.",
    platforms: ["instagram", "facebook", "tiktok", "linkedin"],
  },
  {
    dayOffset: 4,
    hour: 16,
    theme: "Tradition & Werte",
    product: "Hersfelder Handwerk",
    message: "Handgefertigt in Deutschland seit Jahrzehnten.",
    platforms: ["instagram", "linkedin"],
  },
  {
    dayOffset: 5,
    hour: 12,
    theme: "Gewinnspiel/Aktion",
    product: "Wochenend-Special",
    message: "Mitmachen lohnt sich — Aktion nur dieses Wochenende.",
    platforms: ["instagram", "facebook"],
  },
  {
    dayOffset: 6,
    hour: 11,
    theme: "Jungschützen",
    product: "Nachwuchsförderung",
    message: "Die nächste Generation in Hersfelder Grün.",
    platforms: ["instagram", "tiktok"],
  },
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

  const supabase = await createClient();
  const settings = await loadSettings();
  const apiKey = process.env.OPENAI_API_KEY || settings["openai_api_key"] || undefined;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY missing." },
      { status: 400 },
    );
  }

  const now = new Date();
  const monday = startOfISOWeek(now);
  const week = getISOWeek(now);
  const year = getISOWeekYear(now);

  const { count: existing } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("week_number", week)
    .eq("year", year);

  if ((existing ?? 0) > 0) {
    return NextResponse.json({
      skipped: true,
      reason: `Week ${week}/${year} already has ${existing} posts.`,
    });
  }

  const created: string[] = [];
  for (const plan of WEEKLY_PLAN) {
    try {
      const when = setMinutes(setHours(addDays(monday, plan.dayOffset), plan.hour), 0);
      const imagePrompt = buildImagePrompt({
        brandStyle: settings["brand_style_prompt"],
        theme: plan.theme,
        product: plan.product,
        message: plan.message,
      });
      const captionPrompt = buildCaptionPrompt({
        theme: plan.theme,
        product: plan.product,
        message: plan.message,
      });

      const [image, caption] = await Promise.all([
        generateImage({ apiKey, prompt: imagePrompt }),
        generateCaption({ apiKey, prompt: captionPrompt }),
      ]);

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

      const { data: post } = await supabase
        .from("posts")
        .insert({
          title: `${plan.theme}: ${plan.product}`,
          image_url: imageUrl,
          caption,
          status: "pending",
          platforms: plan.platforms,
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
          theme: plan.theme,
          occasion: plan.theme,
          product: plan.product,
          message: plan.message,
          prompt_used: imagePrompt,
        });
      }
    } catch (e) {
      console.error("week-plan error", plan.theme, e);
    }
  }

  return NextResponse.json({ created: created.length, week, year, ids: created });
}
