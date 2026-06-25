import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://hersfelder-business-app.vercel.app";
  const appId = process.env.FACEBOOK_APP_ID!;
  const appSecret = process.env.FACEBOOK_APP_SECRET!;

  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    console.error("[meta/callback] OAuth error:", error, searchParams.get("error_description"));
    return NextResponse.redirect(`${appUrl}/einstellungen?meta=error`);
  }
  if (!code) {
    return NextResponse.redirect(`${appUrl}/einstellungen?meta=error`);
  }

  try {
    // 1. Code → kurzlebiger User-Token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?` +
        `client_id=${appId}` +
        `&redirect_uri=${encodeURIComponent(`${appUrl}/api/auth/meta/callback`)}` +
        `&client_secret=${appSecret}` +
        `&code=${code}`
    );
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error("[meta/callback] Token exchange failed:", tokenData);
      return NextResponse.redirect(`${appUrl}/einstellungen?meta=error`);
    }
    const shortToken = tokenData.access_token;

    // 2. Kurzlebig → langlebiger User-Token (60 Tage)
    const longRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?` +
        `grant_type=fb_exchange_token` +
        `&client_id=${appId}` +
        `&client_secret=${appSecret}` +
        `&fb_exchange_token=${shortToken}`
    );
    const longData = await longRes.json();
    const longToken = longData.access_token ?? shortToken;

    // 3. Pages des Users abrufen → Page Access Token (permanent)
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${longToken}`
    );
    const pagesData = await pagesRes.json();
    const pages = pagesData.data ?? [];

    if (pages.length === 0) {
      console.error("[meta/callback] Keine Pages gefunden:", pagesData);
      return NextResponse.redirect(`${appUrl}/einstellungen?meta=no_pages`);
    }

    // Nimm die erste Seite (Hersfelder)
    const page = pages[0];
    const pageToken: string = page.access_token;
    const pageId: string = page.id;

    // 4. Instagram Business Account ID
    const igRes = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}?fields=instagram_business_account&access_token=${pageToken}`
    );
    const igData = await igRes.json();
    const instagramId: string = igData.instagram_business_account?.id ?? "";

    // 5. Alles in Supabase settings speichern
    const supabase = createAdminClient();
    await Promise.all([
      supabase.from("settings").upsert({ key: "meta_access_token", value: pageToken }, { onConflict: "key" }),
      supabase.from("settings").upsert({ key: "facebook_page_id", value: pageId }, { onConflict: "key" }),
      supabase.from("settings").upsert({ key: "instagram_account_id", value: instagramId }, { onConflict: "key" }),
      supabase.from("settings").upsert({ key: "facebook_page_name", value: page.name ?? "" }, { onConflict: "key" }),
    ]);

    console.log(`[meta/callback] ✅ Verbunden: Page "${page.name}" (${pageId}), IG: ${instagramId}`);
    return NextResponse.redirect(`${appUrl}/einstellungen?meta=connected`);
  } catch (err) {
    console.error("[meta/callback] Fehler:", err);
    return NextResponse.redirect(`${appUrl}/einstellungen?meta=error`);
  }
}
