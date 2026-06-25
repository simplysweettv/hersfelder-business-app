import { publishToFacebook, publishToInstagram } from "@/lib/meta-api";
import {
  type ConfigGetter,
  type Publisher,
  type PublishOutcome,
  type PublishPayload,
} from "./types";

/**
 * Meta-Direkt-Adapter (Facebook + Instagram über die Graph API).
 *
 * Kostenloser Alternativweg zu Blotato für FB/IG. Aktuell NICHT in der
 * Registry aktiv — dient als austauschbare Option: eine Zeile in registry.ts
 * genügt, um FB/IG direkt statt über Blotato laufen zu lassen.
 *
 * Wrappt die bestehenden Funktionen aus lib/meta-api.ts.
 */

function looksLikeAuthError(msg?: string): boolean {
  const m = (msg ?? "").toLowerCase();
  return (
    m.includes("access token") ||
    m.includes("session") ||
    m.includes("oauth") ||
    m.includes("permission") ||
    m.includes("expired")
  );
}

export function makeMetaPublisher(platform: "instagram" | "facebook"): Publisher {
  return {
    platform,
    name: `Meta:${platform}`,

    isConfigured(get) {
      const token = get("meta_access_token", "META_ACCESS_TOKEN");
      const id =
        platform === "instagram"
          ? get("instagram_account_id", "INSTAGRAM_ACCOUNT_ID")
          : get("facebook_page_id", "FACEBOOK_PAGE_ID");
      return Boolean(token && id);
    },

    async publish(payload: PublishPayload, get: ConfigGetter): Promise<PublishOutcome> {
      const token = get("meta_access_token", "META_ACCESS_TOKEN");
      if (!token) {
        return { ok: false, error: "Meta Access-Token fehlt.", reauth: true };
      }

      if (platform === "instagram") {
        const igId = get("instagram_account_id", "INSTAGRAM_ACCOUNT_ID");
        if (!igId) return { ok: false, error: "Instagram-Account-ID fehlt." };
        const r = await publishToInstagram({
          accessToken: token,
          igAccountId: igId,
          imageUrl: payload.imageUrl,
          caption: payload.caption,
        });
        return r.ok
          ? { ok: true, externalId: r.platform_post_id ?? "", raw: r.raw }
          : { ok: false, error: r.error ?? "Unbekannter Fehler", reauth: looksLikeAuthError(r.error), raw: r.raw };
      }

      const pageId = get("facebook_page_id", "FACEBOOK_PAGE_ID");
      if (!pageId) return { ok: false, error: "Facebook-Page-ID fehlt." };
      const r = await publishToFacebook({
        accessToken: token,
        pageId,
        imageUrl: payload.imageUrl,
        caption: payload.caption,
      });
      return r.ok
        ? { ok: true, externalId: r.platform_post_id ?? "", raw: r.raw }
        : { ok: false, error: r.error ?? "Unbekannter Fehler", reauth: looksLikeAuthError(r.error), raw: r.raw };
    },
  };
}
