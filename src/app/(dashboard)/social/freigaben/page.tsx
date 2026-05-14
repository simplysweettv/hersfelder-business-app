import { createClient } from "@/lib/supabase/server";
import { ApprovalCard } from "@/components/social/ApprovalCard";
import { Card } from "@/components/ui/card";
import { Inbox } from "lucide-react";
import type { Post } from "@/types";
import { ApproveAllButton } from "./approve-all-button";

export const dynamic = "force-dynamic";

export default async function FreigabenPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("posts")
    .select("*")
    .eq("status", "pending")
    .order("scheduled_at", { ascending: true });

  const posts = (data ?? []) as Post[];

  return (
    <div className="flex-1 p-3 md:p-5 bg-background space-y-3 md:space-y-4">
      <Card className="p-3 md:p-4 flex items-center gap-3 md:gap-4">
        <div
          className="w-10 h-10 md:w-11 md:h-11 rounded-lg flex items-center justify-center text-white shrink-0"
          style={{ background: "var(--brand-primary)" }}
        >
          <Inbox className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">
            {posts.length === 0
              ? "Keine Posts warten auf Freigabe"
              : `${posts.length} Post${posts.length === 1 ? "" : "s"} warte${posts.length === 1 ? "t" : "n"} auf Freigabe`}
          </div>
          <div className="text-xs text-muted-foreground hidden sm:block">
            Prüfe Bild und Caption, dann gib die Posts frei. Sie werden zum
            geplanten Zeitpunkt automatisch veröffentlicht.
          </div>
        </div>
        <ApproveAllButton disabled={posts.length === 0} count={posts.length} />
      </Card>

      <div className="space-y-2">
        {posts.length === 0 && (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            Sobald die KI neue Posts generiert hat, erscheinen sie hier.
            <div className="mt-3">
              <a
                href="/social/generator"
                className="inline-flex items-center justify-center rounded-md border border-border bg-white px-3 py-1.5 text-sm hover:bg-muted transition-colors"
              >
                Jetzt einen Post generieren
              </a>
            </div>
          </Card>
        )}
        {posts.map((p) => (
          <ApprovalCard key={p.id} post={p} />
        ))}
      </div>
    </div>
  );
}
