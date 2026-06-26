import type { Platform } from "@/types";
import {
  errMsg,
  type ConfigGetter,
  type Publisher,
  type PublishOutcome,
  type PublishPayload,
  type StatusOutcome,
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

type BlotatoSubaccount = { id: string; accountId?: string; name?: string };

// Subaccounts (= Facebook-Pages / LinkedIn-Company-Pages) pro Konto cachen.
const subaccountCache = new Map<string, BlotatoSubaccount[]>();

async function fetchSubaccounts(
  accountId: string,
  apiKey: string,
): Promise<BlotatoSubaccount[]> {
  const cacheKey = `${apiKey}:${accountId}`;
  const cached = subaccountCache.get(cacheKey);
  if (cached) return cached;
  const res = await fetch(
    `${BLOTATO_BASE}/users/me/accounts/${accountId}/subaccounts`,
    { headers: { "blotato-api-key": apiKey } },
  );
  if (!res.ok) return [];
  const json = (await res.json().catch(() => ({}))) as { items?: BlotatoSubaccount[] };
  const items = json.items ?? [];
  subaccountCache.set(cacheKey, items);
  return items;
}

/**
 * Page-ID für Facebook/LinkedIn ermitteln: erst expliziter Override, sonst
 * automatisch über die Blotato-Subaccounts des verbundenen Kontos.
 */
async function resolvePageId(
  platform: "facebook" | "linkedin",
  accountId: string,
  apiKey: string,
  get: ConfigGetter,
): Promise<string | undefined> {
  const explicit =
    platform === "facebook"
      ? get("blotato_facebook_page_id", "BLOTATO_FACEBOOK_PAGE_ID") ??
        get("facebook_page_id", "FACEBOOK_PAGE_ID")
      : get("blotato_linkedin_page_id", "BLOTATO_LINKEDIN_PAGE_ID");
  if (explicit) return explicit;

  const subs = await fetchSubaccounts(accountId, apiKey);
  return subs[0]?.id;
}

/** Plattform-spezifische Pflicht-/Optionsfelder für das target-Objekt. */
function buildTarget(
  platform: Platform,
  get: ConfigGetter,
  pageId?: string,
): Record<string, unknown> {
  switch (platform) {
    case "facebook":
      // pageId ist bei Facebook Pflicht — wird in publish() aufgelöst.
      return { targetType: "facebook", ...(pageId ? { pageId } : {}) };
    case "instagram":
      return { targetType: "instagram" };
    case "linkedin":
      // pageId optional: gesetzt → Company Page, sonst persönliches Profil.
      return { targetType: "linkedin", ...(pageId ? { pageId } : {}) };
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

      // Facebook/LinkedIn brauchen eine pageId → automatisch über Subaccounts.
      let pageId: string | undefined;
      if (platform === "facebook" || platform === "linkedin") {
        try {
          pageId = await resolvePageId(platform, accountId, apiKey, get);
        } catch (e) {
          return { ok: false, error: `Blotato (Page-ID): ${errMsg(e)}` };
        }
        if (platform === "facebook" && !pageId) {
          return {
            ok: false,
            error:
              "Keine Facebook-Page in Blotato gefunden — bitte die Facebook-Seite in Blotato verbinden.",
            reauth: true,
          };
        }
      }

      // scheduledTime MUSS auf Root-Ebene stehen (Geschwister von `post`),
      // sonst ignoriert Blotato es und postet sofort.
      const body: Record<string, unknown> = {
        post: {
          accountId,
          content: {
            text: payload.caption,
            mediaUrls: payload.imageUrl ? [payload.imageUrl] : [],
            platform: BLOTATO_PLATFORM[platform],
          },
          target: buildTarget(platform, get, pageId),
        },
        ...(payload.scheduledTime ? { scheduledTime: payload.scheduledTime } : {}),
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

    async checkStatus(externalId: string, get: ConfigGetter): Promise<StatusOutcome> {
      const apiKey = get("blotato_api_key", "BLOTATO_API_KEY");
      if (!apiKey) return { state: "in-progress" };
      if (!externalId) return { state: "in-progress" };

      try {
        const res = await fetch(`${BLOTATO_BASE}/posts/${externalId}`, {
          headers: { "blotato-api-key": apiKey },
        });
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) {
          // Unbekannt → als noch-in-Arbeit behandeln, nicht als Fehler werten.
          return { state: "in-progress", raw: json };
        }
        const status = String(json?.status ?? "in-progress");
        if (status === "published") {
          return {
            state: "published",
            publicUrl: (json?.publicUrl as string) ?? undefined,
            raw: json,
          };
        }
        if (status === "failed") {
          return {
            state: "failed",
            error: (json?.errorMessage as string) ?? "Veröffentlichung fehlgeschlagen.",
            raw: json,
          };
        }
        return { state: "in-progress", raw: json };
      } catch (e) {
        return { state: "in-progress", raw: { error: errMsg(e) } };
      }
    },
  };
}
