import type { Platform } from "@/types";

export type PublishResult = {
  platform: Platform;
  ok: boolean;
  platform_post_id?: string;
  error?: string;
  raw?: unknown;
};

export type PublishInput = {
  imageUrl: string;
  caption: string;
  platforms: Platform[];
  credentials: {
    metaAccessToken?: string;
    instagramAccountId?: string;
    facebookPageId?: string;
    tiktokAccessToken?: string;
    linkedinAccessToken?: string;
  };
};

export async function publishToInstagram(input: {
  accessToken: string;
  igAccountId: string;
  imageUrl: string;
  caption: string;
}): Promise<PublishResult> {
  try {
    const container = await fetch(
      `https://graph.facebook.com/v21.0/${input.igAccountId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: input.imageUrl,
          caption: input.caption,
          access_token: input.accessToken,
        }),
      },
    ).then((r) => r.json());
    if (container.error)
      return { platform: "instagram", ok: false, error: container.error.message };

    const publish = await fetch(
      `https://graph.facebook.com/v21.0/${input.igAccountId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: container.id,
          access_token: input.accessToken,
        }),
      },
    ).then((r) => r.json());
    if (publish.error)
      return { platform: "instagram", ok: false, error: publish.error.message };

    return { platform: "instagram", ok: true, platform_post_id: publish.id, raw: publish };
  } catch (e) {
    return {
      platform: "instagram",
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function publishToFacebook(input: {
  accessToken: string;
  pageId: string;
  imageUrl: string;
  caption: string;
}): Promise<PublishResult> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${input.pageId}/photos`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: input.imageUrl,
          caption: input.caption,
          access_token: input.accessToken,
        }),
      },
    ).then((r) => r.json());
    if (res.error)
      return { platform: "facebook", ok: false, error: res.error.message };
    return { platform: "facebook", ok: true, platform_post_id: res.post_id ?? res.id, raw: res };
  } catch (e) {
    return {
      platform: "facebook",
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function publishToTikTok(_input: {
  accessToken: string;
  imageUrl: string;
  caption: string;
}): Promise<PublishResult> {
  return {
    platform: "tiktok",
    ok: false,
    error: "TikTok publishing is not implemented yet (requires app review).",
  };
}

export async function publishToLinkedIn(_input: {
  accessToken: string;
  imageUrl: string;
  caption: string;
}): Promise<PublishResult> {
  return {
    platform: "linkedin",
    ok: false,
    error: "LinkedIn publishing is not implemented yet (requires app + org URN).",
  };
}

export async function publishAll(input: PublishInput): Promise<PublishResult[]> {
  const out: PublishResult[] = [];
  for (const p of input.platforms) {
    if (p === "instagram") {
      if (!input.credentials.metaAccessToken || !input.credentials.instagramAccountId) {
        out.push({ platform: p, ok: false, error: "Instagram credentials missing." });
        continue;
      }
      out.push(
        await publishToInstagram({
          accessToken: input.credentials.metaAccessToken,
          igAccountId: input.credentials.instagramAccountId,
          imageUrl: input.imageUrl,
          caption: input.caption,
        }),
      );
    } else if (p === "facebook") {
      if (!input.credentials.metaAccessToken || !input.credentials.facebookPageId) {
        out.push({ platform: p, ok: false, error: "Facebook credentials missing." });
        continue;
      }
      out.push(
        await publishToFacebook({
          accessToken: input.credentials.metaAccessToken,
          pageId: input.credentials.facebookPageId,
          imageUrl: input.imageUrl,
          caption: input.caption,
        }),
      );
    } else if (p === "tiktok") {
      if (!input.credentials.tiktokAccessToken) {
        out.push({ platform: p, ok: false, error: "TikTok credentials missing." });
        continue;
      }
      out.push(
        await publishToTikTok({
          accessToken: input.credentials.tiktokAccessToken,
          imageUrl: input.imageUrl,
          caption: input.caption,
        }),
      );
    } else if (p === "linkedin") {
      if (!input.credentials.linkedinAccessToken) {
        out.push({ platform: p, ok: false, error: "LinkedIn credentials missing." });
        continue;
      }
      out.push(
        await publishToLinkedIn({
          accessToken: input.credentials.linkedinAccessToken,
          imageUrl: input.imageUrl,
          caption: input.caption,
        }),
      );
    }
  }
  return out;
}
