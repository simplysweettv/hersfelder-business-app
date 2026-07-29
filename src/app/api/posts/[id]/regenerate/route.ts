import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSettings } from "@/lib/settings";
import { buildCaptionPrompt } from "@/lib/openai";
import {
  generateDesignedConcept,
  createDesignedPostImage,
  conceptHookText,
  generateCompliantCaption,
} from "@/lib/designed-post";
import { pickConceptFormat, BANNED_PHRASES, type Lane } from "@/lib/concepts";
import { reviewDesignedPost } from "@/lib/designed-review";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * "Neu generieren" — läuft wie alle anderen Wege über die designte
 * Zwei-Säulen-Pipeline: frisches Konzept in derselben Säule (aber bewusst
 * anderes Format als bisher), Foto ohne Text + Marken-Overlay, floskelsichere
 * Caption und die Zwei-Agenten-Freigabe auf dem fertigen Composite.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const settings = await loadSettings();
  const apiKey = process.env.OPENAI_API_KEY || settings["openai_api_key"] || undefined;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY missing" }, { status: 400 });

  const { data: post } = await admin
    .from("posts")
    .select("*, post_briefs(*)")
    .eq("id", params.id)
    .single();
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const brief = post.post_briefs?.[0];
  const platforms: string[] = post.platforms ?? ["instagram"];

  try {
    // Säule beibehalten, Format bewusst wechseln → wirklich neue Idee.
    const lane: Lane = brief?.lane === "product" ? "product" : "emotional";
    const format = pickConceptFormat({
      lane,
      avoidCodes: brief?.format_code ? [brief.format_code] : [],
      month: new Date().getMonth() + 1,
    });
    const pillar = lane === "product" ? "service" : "community";

    const concept = await generateDesignedConcept({
      apiKey,
      format,
      reactiveHook: null,
      topical: null,
      // Das bisherige Thema meiden, sonst kommt dasselbe wieder heraus.
      avoid: [brief?.theme, brief?.message].filter((x): x is string => Boolean(x)),
      month: new Date().getMonth() + 1,
    });

    const captionPrompt = buildCaptionPrompt({
      theme: concept.theme,
      product: concept.product,
      message: concept.message,
      platforms,
      pillar,
      hook: conceptHookText(concept),
      bannedPhrases: BANNED_PHRASES,
    });

    const [rendered, caption] = await Promise.all([
      createDesignedPostImage({ apiKey, concept, brandStyle: settings["brand_style_prompt"] }),
      generateCompliantCaption({ apiKey, captionPrompt, bannedPhrases: BANNED_PHRASES }),
    ]);

    // Neues Bild hochladen; bei Upload-Fehler das alte behalten.
    let imageUrl: string | null = post.image_url;
    const filename = `${crypto.randomUUID()}.jpg`;
    const { error: upErr } = await admin.storage
      .from("post-images")
      .upload(filename, rendered.jpeg, { contentType: "image/jpeg" });
    if (!upErr) {
      imageUrl = admin.storage.from("post-images").getPublicUrl(filename).data.publicUrl;
    }

    const review = await reviewDesignedPost({
      apiKey,
      jpeg: rendered.jpeg,
      concept,
      caption,
    });

    const title = `${concept.theme}`.slice(0, 200);

    await admin
      .from("posts")
      .update({
        title,
        image_url: imageUrl,
        caption,
        quality_score: review.score,
        quality_notes: review.notes,
        quality_status: review.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id);

    if (brief?.id) {
      await admin
        .from("post_briefs")
        .update({
          theme: concept.theme,
          product: concept.product,
          message: concept.message,
          prompt_used: rendered.photoPrompt,
          pillar,
          style_type: "designed",
          lane,
          format_code: format.code,
          template: concept.template,
        })
        .eq("id", brief.id);
    }

    return NextResponse.json({
      ok: true,
      title,
      lane,
      review: { score: review.score, pass: review.pass, issues: review.notes },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
