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
    // Berechtigungen für den Facebook-Login-Weg (graph.facebook.com).
    //
    // ACHTUNG: `instagram_business_basic` stand hier früher und ist FALSCH —
    // das ist eine Berechtigung der "Instagram API with Instagram Login"
    // (Anmeldung über instagram.com). Beim Facebook-Login heißt sie
    // `instagram_basic`. Eine ungültige Berechtigung lässt Meta den ganzen
    // Dialog abweisen.
    scope: [
      "pages_show_list", // Seiten auflisten (Callback braucht me/accounts)
      "pages_read_engagement", // Beiträge + Kommentare der Seite lesen
      "pages_manage_engagement", // auf Facebook-Kommentare antworten
      "pages_manage_posts", // nur für den Direktweg in publishers/meta.ts
      "instagram_basic", // IG-Konto + Medien lesen
      "instagram_manage_comments", // IG-Kommentare lesen + beantworten
      "instagram_content_publish", // nur für den Direktweg in publishers/meta.ts
    ].join(","),
    response_type: "code",
    state,
  });

  return NextResponse.redirect(
    `https://www.facebook.com/dialog/oauth?${params.toString()}`,
  );
}
