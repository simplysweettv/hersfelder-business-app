import { NextResponse, type NextRequest } from "next/server";
import { isoWeek, isoWeekYear } from "@/lib/berlin-time";
import { createClient } from "@/lib/supabase/server";
import { loadSettings } from "@/lib/settings";
import {
  buildCaptionPrompt,
  buildImagePrompt,
  generateCaption,
  generateCarouselContent,
  generateImage,
} from "@/lib/openai";
import { renderSlide, type CarouselSlide } from "@/lib/carousel";
import { CONTENT_PILLARS, type PillarKey } from "@/types";

// Nur bekannte Kanäle zulassen — ein unbekannter Wert landete sonst in der
// DB und ließ die Freigabe später mit einem TypeError abstürzen.
const VALID_PLATFORMS = ["instagram", "facebook", "tiktok", "linkedin"] as const;

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let platforms: string[] = ["instagram", "facebook"];
  let scheduledAt: string | null = null;
  let pillar: PillarKey = "craft"; // Karussells passen v.a. zu Handwerk/Stories/Service
  try {
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body.platforms) && body.platforms.length) {
      const clean = body.platforms.filter((x: string) =>
        (VALID_PLATFORMS as readonly string[]).includes(x),
      );
      if (clean.length) platforms = clean;
    }
    if (typeof body.scheduledAt === "string" && body.scheduledAt.trim()) scheduledAt = body.scheduledAt;
    if (typeof body.pillar === "string" && CONTENT_PILLARS.some((p) => p.key === body.pillar)) {
      pillar = body.pillar as PillarKey;
    }
  } catch {
    /* defaults */
  }

  const settings = await loadSettings();
  const apiKey = process.env.OPENAI_API_KEY || settings["openai_api_key"] || undefined;
  if (!apiKey) {
    return NextResponse.json({ error: "Kein OPENAI_API_KEY gesetzt." }, { status: 400 });
  }

  try {
    // 1) Inhalt von der KI
    const content = await generateCarouselContent({ apiKey, pillar });
    const pillarLabel = CONTENT_PILLARS.find((p) => p.key === pillar)?.label ?? "Hersfelder";

    // 1b) Cover-Foto (säulen-passend, OHNE Text — Text wird sauber overlay-gerendert)
    let coverBg: string | undefined;
    try {
      const imgPrompt = buildImagePrompt({
        brandStyle: settings["brand_style_prompt"],
        theme: content.title,
        product: "Karussell-Cover",
        message: content.subtitle || content.title,
        styleType: "photo",
        pillar,
      });
      const img = await generateImage({ apiKey, prompt: imgPrompt, size: "1024x1536" });
      if (img.b64) coverBg = `data:image/jpeg;base64,${img.b64}`;
    } catch {
      /* ohne Foto → Cover fällt auf Verlaufs-Design zurück */
    }

    // 2) Slides bauen: Cover (Foto + Hook) + Punkte + Outro (CTA)
    const ctaTitle =
      pillar === "service"
        ? "Rüstet euren Verein aus 💚"
        : pillar === "craft"
          ? "Qualität, die ein Vereinsleben hält"
          : pillar === "proof"
            ? "Auch euren Verein neu einkleiden?"
            : "Folgt uns für mehr";
    const slides: CarouselSlide[] = [
      { kind: "cover", title: content.title, eyebrow: pillarLabel, backgroundDataUrl: coverBg },
      ...content.points.map((p) => ({
        kind: "point" as const,
        heading: p.heading,
        body: p.body,
        eyebrow: pillarLabel,
      })),
      { kind: "outro", title: ctaTitle, handle: "schuetzen-ausstatter.de" },
    ];

    // 3) Slides rendern + hochladen (gestochen scharf, kein KI-Bild)
    const urls: string[] = [];
    for (let i = 0; i < slides.length; i++) {
      const buffer = await renderSlide(slides[i], i + 1, slides.length);
      const filename = `${crypto.randomUUID()}.png`;
      const { error: upErr } = await supabase.storage
        .from("post-images")
        .upload(filename, buffer, { contentType: "image/png", upsert: false });
      if (upErr) throw new Error(`Upload Slide ${i + 1}: ${upErr.message}`);
      urls.push(supabase.storage.from("post-images").getPublicUrl(filename).data.publicUrl);
    }

    // 4) Caption
    const captionPrompt = buildCaptionPrompt({
      theme: content.title,
      product: "Karussell-Post",
      message: content.subtitle || content.title,
      platforms,
      pillar,
    });
    const caption = await generateCaption({ apiKey, prompt: captionPrompt });

    // 5) Speichern (image_url = Cover, image_urls = alle Slides)
    const ref = scheduledAt ? new Date(scheduledAt) : new Date();
    const week = isoWeek(ref);
    const year = isoWeekYear(ref);

    const { data: post, error: insertErr } = await supabase
      .from("posts")
      .insert({
        title: content.title.slice(0, 200),
        image_url: urls[0],
        image_urls: urls,
        caption,
        status: "pending",
        platforms,
        scheduled_at: scheduledAt,
        week_number: week,
        year,
        quality_score: 10, // selbst gerendert → Text immer perfekt lesbar
        quality_notes: [],
        quality_status: "passed",
      })
      .select("id")
      .single();
    if (insertErr) throw new Error(insertErr.message);

    const { error: briefErr } = await supabase.from("post_briefs").insert({
      post_id: post.id,
      theme: content.title,
      occasion: "Karussell",
      product: "Karussell-Post",
      message: content.subtitle || content.title,
      pillar,
    });
    // Nicht den fertigen Post verwerfen, aber den Fehlschlag sichtbar machen —
    // ohne Briefing fehlt die Grundlage für Rotation und Lern-Auswertung.
    if (briefErr) {
      console.error("post_briefs insert fehlgeschlagen:", briefErr.message);
    }

    return NextResponse.json({
      id: post.id,
      image_url: urls[0],
      image_urls: urls,
      caption,
      pillar,
      slides: slides.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

