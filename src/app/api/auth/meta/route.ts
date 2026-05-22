import { NextResponse } from "next/server";

export async function GET() {
  const appId = process.env.FACEBOOK_APP_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://hersfelder-business-app.vercel.app";

  if (!appId) {
    return NextResponse.json({ error: "FACEBOOK_APP_ID nicht konfiguriert" }, { status: 500 });
  }

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: `${appUrl}/api/auth/meta/callback`,
    scope: [
      "pages_manage_posts",
      "instagram_basic",
      "instagram_content_publish",
      "pages_read_engagement",
      "pages_show_list",
    ].join(","),
    response_type: "code",
    state: "hersfelder_meta_connect",
  });

  return NextResponse.redirect(
    `https://www.facebook.com/dialog/oauth?${params.toString()}`
  );
}
