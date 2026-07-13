import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Nur diese Schlüssel dürfen über diese Route geschrieben werden — niemals
// sensible Keys (openai_api_key, meta_access_token o.ä.).
const ALLOWED_KEYS = new Set([
  "blotato_monthly_eur",
  "usd_eur_rate",
  "posting_plan",
  "brand_style_prompt",
]);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const key = String(body.key ?? "");
  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: "Unbekannter Schlüssel" }, { status: 400 });
  }

  // Zahlenwerte mit Komma → Punkt normalisieren (nur für numerische Keys —
  // JSON/Text-Keys wie posting_plan dürfen nicht angefasst werden).
  const NUMERIC_KEYS = new Set(["blotato_monthly_eur", "usd_eur_rate"]);
  const rawValue = body.value == null ? "" : String(body.value).trim();
  const value = NUMERIC_KEYS.has(key) ? rawValue.replace(",", ".") : rawValue;

  const admin = createAdminClient();
  const { error } = await admin
    .from("settings")
    .upsert({ key, value }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, key, value });
}
