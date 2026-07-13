import type { NextRequest } from "next/server";

/**
 * Cron-Authentifizierung — fail-closed in Produktion.
 *
 * Vercel sendet bei Cron-Aufrufen automatisch `Authorization: Bearer $CRON_SECRET`,
 * sobald die Umgebungsvariable existiert (sie ist in Production gesetzt).
 * Ohne konfiguriertes Secret wird der Zugriff in Produktion ABGELEHNT —
 * niemals stillschweigend erlaubt. Lokal (dev) bleibt der Aufruf offen.
 */
export function cronAuthorized(req: NextRequest | Request): { ok: boolean; reason?: string } {
  const secret = process.env.CRON_SECRET;
  const isProd =
    process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";

  if (!secret) {
    return isProd
      ? { ok: false, reason: "CRON_SECRET ist in Produktion nicht konfiguriert." }
      : { ok: true };
  }

  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`
    ? { ok: true }
    : { ok: false, reason: "Ungültiges oder fehlendes Cron-Secret." };
}
