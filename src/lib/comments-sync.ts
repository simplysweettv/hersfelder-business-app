import { createAdminClient } from "@/lib/supabase/admin";
import { loadSettings, getEnvOrSetting } from "@/lib/settings";
import { fetchInstagramComments, fetchFacebookComments } from "@/lib/meta";

/**
 * EINE Sync-Funktion für Kommentare — genutzt vom Vercel-Cron
 * (/api/cron/fetch-comments) UND der eingeloggten UI (/api/comments/sync).
 * So bleibt der Cron mit Secret abgesichert, ohne dass der manuelle
 * "Aktualisieren"-Button bricht.
 */
export type CommentSyncResult = {
  ok: boolean;
  fetched: number;
  instagram: "ok" | "nicht konfiguriert" | "fehler";
  facebook: "ok" | "nicht konfiguriert" | "fehler";
  errors: string[];
};

export async function syncMetaComments(): Promise<CommentSyncResult> {
  const supabase = createAdminClient();
  const settings = await loadSettings();

  const accessToken = getEnvOrSetting("META_ACCESS_TOKEN", settings, "meta_access_token");
  const igAccountId = getEnvOrSetting("INSTAGRAM_ACCOUNT_ID", settings, "instagram_account_id");
  const fbPageId = getEnvOrSetting("FACEBOOK_PAGE_ID", settings, "facebook_page_id");

  if (!accessToken) {
    return {
      ok: false,
      fetched: 0,
      instagram: "nicht konfiguriert",
      facebook: "nicht konfiguriert",
      errors: ["meta_access_token nicht konfiguriert — Facebook in den Einstellungen verbinden."],
    };
  }

  const allComments: unknown[] = [];
  const errors: string[] = [];
  let instagram: CommentSyncResult["instagram"] = "nicht konfiguriert";
  let facebook: CommentSyncResult["facebook"] = "nicht konfiguriert";

  if (igAccountId) {
    try {
      const igComments = await fetchInstagramComments(igAccountId, accessToken);
      allComments.push(...igComments);
      instagram = "ok";
    } catch (e) {
      instagram = "fehler";
      errors.push(`Instagram: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (fbPageId) {
    try {
      const fbComments = await fetchFacebookComments(fbPageId, accessToken);
      allComments.push(...fbComments);
      facebook = "ok";
    } catch (e) {
      facebook = "fehler";
      errors.push(`Facebook: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (allComments.length > 0) {
    const { error } = await supabase.from("comments").upsert(allComments, {
      onConflict: "id",
      ignoreDuplicates: false,
    });
    if (error) {
      errors.push(`Speichern fehlgeschlagen: ${error.message}`);
      return { ok: false, fetched: 0, instagram, facebook, errors };
    }
  }

  return { ok: errors.length === 0, fetched: allComments.length, instagram, facebook, errors };
}
