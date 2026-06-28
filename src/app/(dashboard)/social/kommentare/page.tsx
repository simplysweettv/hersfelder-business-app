import { createClient } from "@/lib/supabase/server";
import { loadSettings } from "@/lib/settings";
import { CommentInbox } from "@/components/social/CommentInbox";
import { MessageCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function KommentarePage() {
  const supabase = await createClient();
  const settings = await loadSettings();

  const accessToken =
    process.env.META_ACCESS_TOKEN ?? settings["meta_access_token"];

  const { data: comments } = await supabase
    .from("comments")
    .select("*")
    .eq("hidden", false)
    .order("comment_timestamp", { ascending: false })
    .limit(100);

  return (
    <main className="flex-1 p-4 md:p-6 max-w-2xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0"
          style={{ background: "var(--brand-primary)" }}
        >
          <MessageCircle className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Kommentare</h1>
          <p className="text-sm text-muted-foreground">
            Instagram &amp; Facebook — direkt beantworten
          </p>
        </div>
      </div>

      <CommentInbox
        initialComments={comments ?? []}
        configured={!!accessToken}
      />
    </main>
  );
}
