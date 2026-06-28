import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSettings } from "@/lib/settings";
import { replyToInstagramComment, replyToFacebookComment } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const { id } = await params;
  const { message } = await req.json();
  if (!message?.trim()) {
    return NextResponse.json({ error: "Nachricht fehlt" }, { status: 400 });
  }

  const { data: comment, error: fetchError } = await supabase
    .from("comments")
    .select("id, platform, replied")
    .eq("id", id)
    .single();

  if (fetchError || !comment) {
    return NextResponse.json(
      { error: "Kommentar nicht gefunden" },
      { status: 404 }
    );
  }
  if (comment.replied) {
    return NextResponse.json(
      { error: "Bereits beantwortet" },
      { status: 409 }
    );
  }

  const settings = await loadSettings();
  const accessToken =
    process.env.META_ACCESS_TOKEN ?? settings["meta_access_token"];

  if (!accessToken) {
    return NextResponse.json(
      { error: "meta_access_token nicht konfiguriert" },
      { status: 400 }
    );
  }

  const replyFn =
    comment.platform === "instagram"
      ? replyToInstagramComment
      : replyToFacebookComment;

  const result = await replyFn(id, message.trim(), accessToken);

  if (result.error) {
    return NextResponse.json(
      { error: `Meta API Fehler: ${result.error}` },
      { status: 502 }
    );
  }

  const admin = createAdminClient();
  await admin
    .from("comments")
    .update({
      replied: true,
      reply_text: message.trim(),
      replied_at: new Date().toISOString(),
    })
    .eq("id", id);

  return NextResponse.json({ success: true, reply_id: result.id });
}
