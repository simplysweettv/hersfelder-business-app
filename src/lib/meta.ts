const META_API = "https://graph.facebook.com/v21.0";

export interface MetaRawComment {
  id: string;
  text?: string;       // Instagram
  message?: string;    // Facebook
  username?: string;   // Instagram
  from?: { name: string; id: string }; // Facebook
  timestamp?: string;  // Instagram
  created_time?: string; // Facebook
}

export interface MetaMedia {
  id: string;
  caption?: string;
  message?: string;
  media_url?: string;
  thumbnail_url?: string;
  full_picture?: string;
  timestamp?: string;
  created_time?: string;
}

export interface FetchedComment {
  id: string;
  platform: "instagram" | "facebook";
  media_id: string;
  media_caption: string | null;
  media_thumbnail: string | null;
  author_name: string;
  author_id: string | null;
  message: string;
  comment_timestamp: string;
}

export async function fetchInstagramComments(
  igAccountId: string,
  accessToken: string
): Promise<FetchedComment[]> {
  const mediaRes = await fetch(
    `${META_API}/${igAccountId}/media?fields=id,caption,media_url,thumbnail_url,timestamp,comments_count&limit=20&access_token=${accessToken}`
  );
  if (!mediaRes.ok) return [];
  const mediaData = await mediaRes.json();
  if (!mediaData.data) return [];

  const results: FetchedComment[] = [];

  for (const media of mediaData.data as MetaMedia[]) {
    if (!media.id) continue;
    const commentsRes = await fetch(
      `${META_API}/${media.id}/comments?fields=id,text,username,timestamp&limit=50&access_token=${accessToken}`
    );
    if (!commentsRes.ok) continue;
    const commentsData = await commentsRes.json();
    const comments: MetaRawComment[] = commentsData.data ?? [];

    for (const c of comments) {
      results.push({
        id: c.id,
        platform: "instagram",
        media_id: media.id,
        media_caption: media.caption ?? null,
        media_thumbnail: media.thumbnail_url ?? media.media_url ?? null,
        author_name: c.username ?? "Unbekannt",
        author_id: null,
        message: c.text ?? "",
        comment_timestamp: c.timestamp ?? new Date().toISOString(),
      });
    }
  }

  return results;
}

export async function fetchFacebookComments(
  pageId: string,
  accessToken: string
): Promise<FetchedComment[]> {
  const postsRes = await fetch(
    `${META_API}/${pageId}/posts?fields=id,message,full_picture,created_time&limit=20&access_token=${accessToken}`
  );
  if (!postsRes.ok) return [];
  const postsData = await postsRes.json();
  if (!postsData.data) return [];

  const results: FetchedComment[] = [];

  for (const post of postsData.data as MetaMedia[]) {
    if (!post.id) continue;
    const commentsRes = await fetch(
      `${META_API}/${post.id}/comments?fields=id,message,from,created_time&limit=50&access_token=${accessToken}`
    );
    if (!commentsRes.ok) continue;
    const commentsData = await commentsRes.json();
    const comments: MetaRawComment[] = commentsData.data ?? [];

    for (const c of comments) {
      results.push({
        id: c.id,
        platform: "facebook",
        media_id: post.id,
        media_caption: post.message ?? null,
        media_thumbnail: post.full_picture ?? null,
        author_name: c.from?.name ?? "Unbekannt",
        author_id: c.from?.id ?? null,
        message: c.message ?? "",
        comment_timestamp: c.created_time ?? new Date().toISOString(),
      });
    }
  }

  return results;
}

export async function replyToInstagramComment(
  commentId: string,
  message: string,
  accessToken: string
): Promise<{ id?: string; error?: string }> {
  const res = await fetch(`${META_API}/${commentId}/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, access_token: accessToken }),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error?.message ?? "Unbekannter Fehler" };
  return { id: data.id };
}

export async function replyToFacebookComment(
  commentId: string,
  message: string,
  accessToken: string
): Promise<{ id?: string; error?: string }> {
  const res = await fetch(`${META_API}/${commentId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, access_token: accessToken }),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error?.message ?? "Unbekannter Fehler" };
  return { id: data.id };
}
