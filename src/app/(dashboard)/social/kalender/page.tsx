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

  // Publications für alle gezeigten Posts in einem Rutsch laden.
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

  return (
    <div className="flex-1 p-5 bg-background space-y-4">
      <div className="flex items-center gap-3">
        <CalendarIcon className="w-5 h-5" style={{ color: "var(--brand-primary)" }} />
        <h1 className="text-xl font-semibold">Kalender</h1>
        <span className="text-sm text-muted-foreground hidden sm:inline">
          Alle eingeplanten Posts
        </span>
        <div className="ml-auto">
          <SyncStatusButton />
        </div>
      </div>

      {posts.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Noch keine Posts eingeplant.
        </Card>
      ) : (
        <div className="space-y-2">
          {posts.map((p) => (
            <Card key={p.id} className="p-3 flex items-start gap-4">
              <div
                className="w-12 h-12 rounded-md shrink-0"
                style={{
                  background: p.image_url
                    ? `center / cover no-repeat url(${p.image_url})`
                    : "linear-gradient(135deg, var(--brand-primary), var(--brand-sidebar))",
                }}
              />
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="font-medium text-sm truncate flex-1">{p.title}</div>
                  <StatusBadge status={p.status} />
                </div>
                <div className="text-xs text-muted-foreground">
                  {p.scheduled_at ? formatDateTime(p.scheduled_at) : ""}
                </div>
                <PublicationStatus
                  platforms={p.platforms}
                  publications={pubsByPost.get(p.id) ?? []}
                />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
