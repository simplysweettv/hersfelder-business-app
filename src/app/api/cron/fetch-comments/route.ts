import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSettings } from "@/lib/settings";
import { fetchInstagramComments, fetchFacebookComments } from "@/lib/meta";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const settings = await loadSettings();

  const accessToken =
    process.env.META_ACCESS_TOKEN ?? settings["meta_access_token"];
  const igAccountId =
    process.env.INSTAGRAM_ACCOUNT_ID ?? settings["instagram_account_id"];
  const fbPageId =
    process.env.FACEBOOK_PAGE_ID ?? settings["facebook_page_id"];

  if (!accessToken) {
    return NextResponse.json(
      { error: "meta_access_token nicht konfiguriert" },
      { status: 400 }
    );
  }

  const allComments = [];
  const errors: string[] = [];

  if (igAccountId) {
    try {
      const igComments = await fetchInstagramComments(igAccountId, accessToken);
      allComments.push(...igComments);
    } catch (e) {
      errors.push(`Instagram: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (fbPageId) {
    try {
      const fbComments = await fetchFacebookComments(fbPageId, accessToken);
      allComments.push(...fbComments);
    } catch (e) {
      errors.push(`Facebook: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (allComments.length > 0) {
    const { error } = await supabase.from("comments").upsert(allComments, {
      onConflict: "id",
      ignoreDuplicates: false,
    });
    if (error) {
      return NextResponse.json(
        { error: "DB-Fehler beim Speichern", details: error.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    fetched: allComments.length,
    instagram: igAccountId ? "ok" : "nicht konfiguriert",
    facebook: fbPageId ? "ok" : "nicht konfiguriert",
    errors: errors.length > 0 ? errors : undefined,
  });
}
