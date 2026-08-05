import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { listMediaAssets, MEDIA_BUCKET, type MediaLane, type MediaUsage } from "@/lib/media-library";

export const runtime = "nodejs";
// Mehrere Handyfotos in einem Rutsch: Umrechnen dauert, 60 s wären knapp.
export const maxDuration = 120;

const LANES: MediaLane[] = ["emotional", "product", "both"];
const USAGES: MediaUsage[] = ["photo", "reference", "both"];

/** Die Bibliothek, neueste zuerst. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json({ assets: await listMediaAssets(supabase) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/**
 * Bilder hochladen (multipart/form-data, Feld `files`).
 *
 * Jedes Bild wird auf JPEG normalisiert: einheitlich für alle Plattformen,
 * die EXIF-Drehung wird fest eingerechnet (sonst liegen Handyfotos später im
 * Post auf der Seite) und die Kantenlänge auf 2048 px begrenzt — größer bringt
 * weder der Poster-Engine (1024 px breit) noch der KI-Referenz etwas.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Ungültiger Upload." }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "Keine Datei erhalten." }, { status: 400 });

  const laneRaw = String(form.get("lane") ?? "both") as MediaLane;
  const usageRaw = String(form.get("usage") ?? "both") as MediaUsage;
  const lane: MediaLane = LANES.includes(laneRaw) ? laneRaw : "both";
  const usage: MediaUsage = USAGES.includes(usageRaw) ? usageRaw : "both";
  const description = String(form.get("description") ?? "").trim() || null;

  const created: unknown[] = [];
  const errors: string[] = [];

  for (const file of files) {
    try {
      if (file.size > 20 * 1024 * 1024) {
        throw new Error("größer als 20 MB");
      }
      const input = Buffer.from(await file.arrayBuffer());
      let jpeg: Buffer;
      let width: number | null = null;
      let height: number | null = null;
      try {
        jpeg = await sharp(input)
          .rotate()
          .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 88 })
          .toBuffer();
        const meta = await sharp(jpeg).metadata();
        width = meta.width ?? null;
        height = meta.height ?? null;
      } catch {
        // HEIC vom iPhone kann sharp ohne libheif nicht lesen — dann hilft nur
        // ein klarer Hinweis statt einer kryptischen Fehlermeldung.
        throw new Error("Format nicht lesbar (bitte als JPEG oder PNG hochladen)");
      }

      const storagePath = `${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(storagePath, jpeg, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw new Error(upErr.message);

      const publicUrl = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath).data.publicUrl;

      const { data, error } = await supabase
        .from("media_assets")
        .insert({
          storage_path: storagePath,
          public_url: publicUrl,
          title: file.name.replace(/\.[^.]+$/, "").slice(0, 120) || null,
          description,
          lane,
          usage,
          mime: "image/jpeg",
          bytes: jpeg.byteLength,
          width,
          height,
          uploaded_by: user.id,
        })
        .select("*")
        .single();
      if (error) {
        // Verwaiste Datei im Bucket vermeiden.
        await supabase.storage.from(MEDIA_BUCKET).remove([storagePath]);
        throw new Error(error.message);
      }
      created.push(data);
    } catch (e) {
      errors.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (!created.length) {
    return NextResponse.json({ error: errors.join(" · ") || "Upload fehlgeschlagen." }, { status: 400 });
  }
  return NextResponse.json({ created, errors });
}
