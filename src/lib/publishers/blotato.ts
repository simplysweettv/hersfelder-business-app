import type { Platform } from "@/types";
import {
  errMsg,
  type ConfigGetter,
  type Publisher,
  type PublishOutcome,
  type PublishPayload,
} from "./types";

/**
 * Blotato-Adapter — EIN Aggregator für alle 4 Kanäle.
 *
 * Blotato hält die Plattform-Verbindungen am Leben (OAuth, Token-Refresh,
 * App-Reviews) — wir schicken nur pro Kanal einen Befehl mit eigenem Text.
 *
 *   POST https://backend.blotato.com/v2/posts
 *   Header: blotato-api-key: <KEY>
 *   Body:   { post: { accountId, content: {text, mediaUrls, platform}, target: {...} } }
 *
 * Doku: https://help.blotato.com/api/publish-post
 */

const BLOTATO_BASE = "https://backend.blotato.com/v2";

// Unsere Platform-Keys sind identisch mit Blotatos targetType/platform-Werten.
const BLOTATO_PLATFORM: Record<Platform, string> = {
  instagram: "instagram",
  facebook: "facebook",
  tiktok: "tiktok",
  linkedin: "linkedin",
};

type BlotatoAccount = {
  id: string;
  platform: string;
  fullname?: string;
  username?: string;
};

// Konten ändern sich selten → pro Prozess-Lauf einmal abrufen und cachen.
let accountCache: { key: string; items: BlotatoAccount[] } | null = null;

async function fetchAccounts(apiKey: string): Promise<BlotatoAccount[]> {
  if (accountCache && accountCache.key === apiKey) return accountCache.items;
  const res = await fetch(`${BLOTATO_BASE}/users/me/accounts`, {
    headers: { "blotato-api-key": apiKey },
  });
  if (!res.ok) {
    throw new Error(`Konten-Abruf fehlgeschlagen (HTTP ${res.status})`);
  }
  const json = (await res.json().catch(() => ({}))) as { items?: BlotatoAccount[] };
  const items = json.items ?? [];
  accountCache = { key: apiKey, items };
  return items;
}

async function resolveAccountId(
  platform: Platform,
  apiKey: string,
  get: ConfigGetter,
): Promise<string | undefined> {
  // Expliziter Override (settings/env) gewinnt — sonst dynamisch per Plattform.
  const explicit = get(
    `blotato_${platform}_account_id`,
    `BLOTATO_${platform.toUpperCase()}_ACCOUNT_ID`,
  );
  if (explicit) return explicit;

  const items = await fetchAccounts(apiKey);
  const match = items.find((a) => a.platform === BLOTATO_PLATFORM[platform]);
  return match?.id;
}

/** Plattform-spezifische Pflicht-/Optionsfelder für das target-Objekt. */
function buildTarget(platform: Platform, get: ConfigGetter): Record<string, unknown> {
  switch (platform) {
    case "facebook": {
      // pageId ist bei Facebook Pflicht — wir nutzen die bereits bekannte Page-ID.
      const pageId =
        get("blotato_facebook_page_id", "BLOTATO_FACEBOOK_PAGE_ID") ??
        get("facebook_page_id", "FACEBOOK_PAGE_ID");
      return { targetType: "facebook", ...(pageId ? { pageId } : {}) };
    }
    case "instagram":
      return { targetType: "instagram" };
    case "linkedin": {
      // pageId optional: gesetzt → Company Page, sonst persönliches Profil.
      const pageId = get("blotato_linkedin_page_id", "BLOTATO_LINKEDIN_PAGE_ID");
      return { targetType: "linkedin", ...(pageId ? { pageId } : {}) };
    }
    case "tiktok":
      // TikTok verlangt diese Felder zwingend. Bilder von gpt-image-1 →
      // isAiGenerated: true (TikTok-Pflicht zur KI-Kennzeichnung).
      return {
        targetType: "tiktok",
        privacyLevel:
          get("blotato_tiktok_privacy_level") ?? "PUBLIC_TO_EVERYONE",
        disabledComments: false,
        disabledDuet: false,
        disabledStitch: false,
        isBrandedContent: false,
        isYourBrand: false,
        isAiGenerated: true,
      };
  }
}

export function makeBlotatoPublisher(platform: Platform): Publisher {
  return {
    platform,
    name: `Blotato:${platform}`,

    isConfigured(get) {
      return Boolean(get("blotato_api_key", "BLOTATO_API_KEY"));
    },

    async publish(payload: PublishPayload, get: ConfigGetter): Promise<PublishOutcome> {
      const apiKey = get("blotato_api_key", "BLOTATO_API_KEY");
      if (!apiKey) {
        return { ok: false, error: "Blotato API-Key fehlt (BLOTATO_API_KEY).", reauth: true };
      }

      let accountId: string | undefined;
      try {
        accountId = await resolveAccountId(platform, apiKey, get);
      } catch (e) {
        return { ok: false, error: `Blotato: ${errMsg(e)}` };
      }
      if (!accountId) {
        return {
          ok: false,
          error: `Kein verbundenes ${platform}-Konto in Blotato gefunden — bitte in Blotato verbinden.`,
          reauth: true,
        };
      }

      const body = {
        post: {
          accountId,
          content: {
            text: payload.caption,
            mediaUrls: payload.imageUrl ? [payload.imageUrl] : [],
            platform: BLOTATO_PLATFORM[platform],
          },
          target: buildTarget(platform, get),
        },
      };

      try {
        const res = await fetch(`${BLOTATO_BASE}/posts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "blotato-api-key": apiKey,
          },
          body: JSON.stringify(body),
        });
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

        if (!res.ok) {
          const msg =
            (json?.error as { message?: string })?.message ??
            (json?.message as string) ??
            `HTTP ${res.status}`;
          const reauth =
            res.status === 401 ||
            res.status === 403 ||
            /connect|reconnect|token|auth|expired/i.test(String(msg));
          return { ok: false, error: String(msg), reauth, raw: json };
        }

        // Blotato antwortet bei Erfolg (201) mit { postSubmissionId }.
        // Die übrigen Felder sind Fallbacks, falls sich das Schema ändert.
        const externalId =
          (json?.postSubmissionId as string) ??
          (json?.id as string) ??
          (json?.submissionId as string) ??
          (json?.postId as string) ??
          ((json?.data as { id?: string })?.id ?? "");
        return { ok: true, externalId: String(externalId), raw: json };
      } catch (e) {
        return { ok: false, error: errMsg(e) };
      }
    },
  };
}
