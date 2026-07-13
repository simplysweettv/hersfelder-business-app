import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

export async function GET() {
  const appId = process.env.FACEBOOK_APP_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://hersfelder-business-app.vercel.app";

  if (!appId) {
    return NextResponse.json({ error: "FACEBOOK_APP_ID nicht konfiguriert" }, { status: 500 });
  }

  // CSRF-Schutz: zufälliger state, in einem httpOnly-Cookie gespiegelt und im
  // Callback verglichen. Ersetzt den vorherigen konstanten state.
  const state = randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("meta_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 Minuten
  });

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: `${appUrl}/api/auth/meta/callback`,
    scope: [
      "pages_manage_posts",
      "pages_read_engagement",
      "pages_show_list",
      "instagram_business_basic",
      "instagram_content_publish",
    ].join(","),
    response_type: "code",
    state,
  });

  return NextResponse.redirect(
    `https://www.facebook.com/dialog/oauth?${params.toString()}`,
  );
}
