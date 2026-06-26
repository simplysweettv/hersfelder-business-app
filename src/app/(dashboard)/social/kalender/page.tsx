import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/date-utils";
import { StatusBadge } from "@/components/social/StatusBadge";
import { SyncStatusButton } from "@/components/social/SyncStatusButton";
import {
  PublicationStatus,
  type PublicationRow,
} from "@/components/social/PublicationStatus";
import type { Post } from "@/types";
import { Calendar as CalendarIcon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function KalenderPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("posts")
    .select("*")
    .not("scheduled_at", "is", null)
    .order("scheduled_at", { ascending: true });

  const posts = (data ?? []) as Post[];

  // Publications laden (für echten Live-Status pro Plattform).
  const ids = posts.map((p) => p.id);
  const pubsByPost = new Map<string, PublicationRow[]>();
  if (ids.length) {
    const { data: pubs } = await supabase
      .from("post_publications")
      .select("post_id, platform, status, public_url, external_id, error")
      .in("post_id", ids);
    for (const row of pubs ?? []) {
      const list = pubsByPost.get(row.post_id) ?? [];
      list.push(row as PublicationRow);
      pubsByPost.set(row.post_id, list);
    }
  }

  const now = Date.now();
  const upcoming = posts.filter(
    (p) => p.scheduled_at && new Date(p.scheduled_at).getTime() >= now && p.status !== "published",
  );
  const past = posts
    .filter(
      (p) => !(p.scheduled_at && new Date(p.scheduled_at).getTime() >= now) || p.status === "published",
    )
    .reverse(); // neueste zuerst

  return (
    <div className="flex-1 p-3 md:p-5 bg-background space-y-5 pb-24 md:pb-6">
      <div className="flex items-center gap-3">
        <CalendarIcon className="w-5 h-5" style={{ color: "var(--brand-primary)" }} />
        <h1 className="text-xl font-semibold">Kalender</h1>
        <div className="ml-auto">
          <SyncStatusButton />
        </div>
      </div>

      {posts.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Noch keine Posts eingeplant — die Maschine füllt morgen früh nach.
        </Card>
      ) : (
        <>
          <Section title="Anstehend" count={upcoming.length}>
            {upcoming.map((p) => (
              <PostRow key={p.id} post={p} pubs={pubsByPost.get(p.id) ?? []} />
            ))}
            {upcoming.length === 0 && (
              <p className="text-sm text-muted-foreground px-1">Nichts geplant.</p>
            )}
          </Section>

          {past.length > 0 && (
            <Section title="Veröffentlicht & vergangen" count={past.length}>
              {past.map((p) => (
                <PostRow key={p.id} post={p} pubs={pubsByPost.get(p.id) ?? []} />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        <span className="text-xs text-muted-foreground">({count})</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function PostRow({ post, pubs }: { post: Post; pubs: PublicationRow[] }) {
  return (
    <Card className="p-3 flex items-start gap-4">
      <div
        className="w-12 h-12 rounded-md shrink-0"
        style={{
          background: post.image_url
            ? `center / cover no-repeat url(${post.image_url})`
            : "linear-gradient(135deg, var(--brand-primary), var(--brand-sidebar))",
        }}
      />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="font-medium text-sm truncate flex-1">{post.title}</div>
          {post.quality_score != null && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              TÜV {post.quality_score}
            </span>
          )}
          <StatusBadge status={post.status} />
        </div>
        <div className="text-xs text-muted-foreground">
          {post.scheduled_at ? formatDateTime(post.scheduled_at) : ""}
        </div>
        <PublicationStatus platforms={post.platforms} publications={pubs} />
      </div>
    </Card>
  );
}
