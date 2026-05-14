import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadSettings } from "@/lib/settings";
import { publishAll } from "@/lib/meta-api";
import type { Post } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev / unsecured
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const settings = await loadSettings();

  const credentials = {
    metaAccessToken:
      process.env.META_ACCESS_TOKEN || settings["meta_access_token"] || undefined,
    instagramAccountId:
      process.env.INSTAGRAM_ACCOUNT_ID || settings["instagram_account_id"] || undefined,
    facebookPageId:
      process.env.FACEBOOK_PAGE_ID || settings["facebook_page_id"] || undefined,
    tiktokAccessToken:
      process.env.TIKTOK_ACCESS_TOKEN || settings["tiktok_access_token"] || undefined,
    linkedinAccessToken:
      process.env.LINKEDIN_ACCESS_TOKEN || settings["linkedin_access_token"] || undefined,
  };

  const nowIso = new Date().toISOString();
  const { data: due } = await supabase
    .from("posts")
    .select("*")
    .in("status", ["scheduled", "approved"])
    .not("scheduled_at", "is", null)
    .lte("scheduled_at", nowIso)
    .limit(10);

  const results: unknown[] = [];

  for (const p of (due ?? []) as Post[]) {
    if (!p.image_url || !p.caption) {
      results.push({ id: p.id, skipped: "missing image_url or caption" });
      continue;
    }
    const res = await publishAll({
      imageUrl: p.image_url,
      caption: p.caption,
      platforms: p.platforms,
      credentials,
    });

    for (const r of res) {
      await supabase.from("publish_log").insert({
        post_id: p.id,
        platform: r.platform,
        status: r.ok ? "success" : "failed",
        platform_post_id: r.platform_post_id ?? null,
        error_message: r.error ?? null,
        response: (r.raw as Record<string, unknown>) ?? null,
      });
    }

    const allOk = res.every((r) => r.ok);
    await supabase
      .from("posts")
      .update({
        status: allOk ? "published" : "failed",
        published_at: allOk ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", p.id);

    results.push({ id: p.id, results: res });
  }

  return NextResponse.json({ processed: results.length, results });
}
