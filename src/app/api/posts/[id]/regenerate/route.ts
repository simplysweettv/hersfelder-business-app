import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSettings } from "@/lib/settings";
import {
  buildImagePrompt,
  buildCaptionPrompt,
  generateBrief,
  generateImage,
  generateCaption,
} from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const settings = await loadSettings();
  const apiKey = process.env.OPENAI_API_KEY || settings["openai_api_key"] || undefined;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY missing" }, { status: 400 });

  // Fetch post + brief
  const { data: post } = await admin
    .from("posts")
    .select("*, post_briefs(*)")
    .eq("id", params.id)
    .single();

  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const brief = post.post_briefs?.[0];
  const platforms: string[] = post.platforms ?? ["instagram"];

  // Determine styleType from existing prompt or default to photo
  const promptUsed: string = brief?.prompt_used ?? "";
  const styleType: "photo" | "typography" | "product" | "hook" =
    promptUsed.includes("Text-Kachel") || promptUsed.includes("Typografie") || promptUsed.includes("Typografie-Grafik")
      ? "typography"
      : promptUsed.includes("Hook-Post") || promptUsed.includes("Text-Overlay") || promptUsed.includes("Scroll-Stopper")
        ? "hook"
        : promptUsed.includes("Produktfoto") || promptUsed.includes("Vereins-Lifestyle")
          ? "product"
          : "photo";

  // Re-generate brief with fresh creativity
  const newBrief = await generateBrief({
    apiKey,
    themeCategory: brief?.occasion ?? "Vereinsleben & Gemeinschaft",
    styleType,
    weekNumber: post.week_number ?? 21,
    year: post.year ?? 2026,
  });

  const imagePrompt = buildImagePrompt({
    brandStyle: settings["brand_style_prompt"],
    theme: newBrief.theme,
    product: newBrief.product,
    message: newBrief.message,
    styleType,
    visualDetails: newBrief.visualDetails,
  });

  const captionPrompt = buildCaptionPrompt({
    theme: newBrief.theme,
    product: newBrief.product,
    message: newBrief.message,
    platforms,
  });

  const [image, caption] = await Promise.all([
    generateImage({ apiKey, prompt: imagePrompt }),
    generateCaption({ apiKey, prompt: captionPrompt }),
  ]);

  // Upload new image
  let imageUrl: string | null = post.image_url;
  if (image.b64) {
    const buffer = Buffer.from(image.b64, "base64");
    const filename = `${crypto.randomUUID()}.png`;
    const { error: upErr } = await admin.storage
      .from("post-images")
      .upload(filename, buffer, { contentType: "image/png" });
    if (!upErr) {
      const { data: pub } = admin.storage.from("post-images").getPublicUrl(filename);
      imageUrl = pub.publicUrl;
    }
  } else if (image.url) {
    imageUrl = image.url;
  }

  // Update post
  await admin
    .from("posts")
    .update({
      title: `KW${post.week_number} ${newBrief.theme}`,
      image_url: imageUrl,
      caption,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  // Update brief
  if (brief?.id) {
    await admin.from("post_briefs").update({
      theme: newBrief.theme,
      product: newBrief.product,
      message: newBrief.message,
      prompt_used: imagePrompt,
    }).eq("id", brief.id);
  }

  return NextResponse.json({ ok: true, title: `KW${post.week_number} ${newBrief.theme}` });
}
