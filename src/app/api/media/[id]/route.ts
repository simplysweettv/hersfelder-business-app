import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MEDIA_BUCKET, type MediaLane, type MediaUsage } from "@/lib/media-library";

export const runtime = "nodejs";

const LANES: MediaLane[] = ["emotional", "product", "both"];
const USAGES: MediaUsage[] = ["photo", "reference", "both"];

/** Beschreibung, Verwendung, Säule oder Aktiv-Status ändern. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.title === "string") update.title = body.title.trim().slice(0, 120) || null;
  if (typeof body.description === "string") {
    update.description = body.description.trim().slice(0, 500) || null;
  }
  if (typeof body.lane === "string" && LANES.includes(body.lane as MediaLane)) {
    update.lane = body.lane;
  }
  if (typeof body.usage === "string" && USAGES.includes(body.usage as MediaUsage)) {
    update.usage = body.usage;
  }
  if (typeof body.active === "boolean") update.active = body.active;

  if (Object.keys(update).length === 1) {
    return NextResponse.json({ error: "Nichts zu ändern" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("media_assets")
    .update(update)
    .eq("id", params.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ asset: data });
}

/** Bild endgültig löschen — Datenbankeintrag und Datei im Storage. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: asset } = await supabase
    .from("media_assets")
    .select("storage_path")
    .eq("id", params.id)
    .maybeSingle();

  const { error } = await supabase.from("media_assets").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (asset?.storage_path) {
    await supabase.storage.from(MEDIA_BUCKET).remove([asset.storage_path as string]);
  }
  return NextResponse.json({ ok: true });
}
