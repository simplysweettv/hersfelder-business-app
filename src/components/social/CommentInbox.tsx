"use client";

import { useState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { MessageCircle, CornerDownRight, CheckCircle2, RefreshCw } from "lucide-react";

type Comment = {
  id: string;
  platform: "instagram" | "facebook";
  media_id: string;
  media_caption: string | null;
  media_thumbnail: string | null;
  author_name: string;
  message: string;
  comment_timestamp: string;
  replied: boolean;
  reply_text: string | null;
};

type Filter = "all" | "unanswered" | "instagram" | "facebook";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "unanswered", label: "Unbeantwortet" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
];

const PLATFORM_COLOR: Record<string, string> = {
  instagram: "bg-gradient-to-br from-purple-500 to-pink-500",
  facebook: "bg-blue-600",
};

export function CommentInbox({
  initialComments,
  configured,
}: {
  initialComments: Comment[];
  configured: boolean;
}) {
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [filter, setFilter] = useState<Filter>("all");
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [openReply, setOpenReply] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, startSync] = useTransition();

  const filtered = comments.filter((c) => {
    if (filter === "unanswered") return !c.replied;
    if (filter === "instagram") return c.platform === "instagram";
    if (filter === "facebook") return c.platform === "facebook";
    return true;
  });

  const unansweredCount = comments.filter((c) => !c.replied).length;

  async function syncComments() {
    startSync(async () => {
      setSyncError(null);
      try {
        // Authentifizierter Sync (nicht der abgesicherte Cron) — Fehler sichtbar machen.
        const sync = await fetch("/api/comments/sync", { method: "POST" });
        const syncData = await sync.json().catch(() => ({}));
        if (!sync.ok) {
          setSyncError(
            (syncData.errors && syncData.errors[0]) ??
              syncData.error ??
              "Abgleich fehlgeschlagen.",
          );
        } else if (Array.isArray(syncData.errors) && syncData.errors.length) {
          setSyncError(syncData.errors.join(" · "));
        }
        const res = await fetch("/api/comments?filter=all");
        const data = await res.json();
        if (data.comments) setComments(data.comments);
      } catch {
        setSyncError("Netzwerkfehler beim Abgleich.");
      }
    });
  }

  async function sendReply(commentId: string, _platform: string) {
    const text = replyText[commentId]?.trim();
    if (!text) return;
    setSending(commentId);
    setErrors((e) => ({ ...e, [commentId]: "" }));
    try {
      const res = await fetch(`/api/comments/${commentId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors((e) => ({ ...e, [commentId]: data.error ?? "Fehler" }));
      } else {
        setComments((prev) =>
          prev.map((c) =>
            c.id === commentId
              ? { ...c, replied: true, reply_text: text }
              : c
          )
        );
        setOpenReply(null);
        setReplyText((r) => ({ ...r, [commentId]: "" }));
      }
    } finally {
      setSending(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Konfigurationshinweis */}
      {!configured && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 space-y-1">
          <p className="font-medium">Meta-Token nicht konfiguriert</p>
          <p>
            Trage <code className="text-xs bg-amber-100 px-1 py-0.5 rounded">meta_access_token</code>,{" "}
            <code className="text-xs bg-amber-100 px-1 py-0.5 rounded">instagram_account_id</code> und{" "}
            <code className="text-xs bg-amber-100 px-1 py-0.5 rounded">facebook_page_id</code> in den Einstellungen ein.
          </p>
        </div>
      )}

      {/* Sync-Button */}
      <button
        onClick={syncComments}
        disabled={syncing}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-border text-sm font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-all disabled:opacity-50"
      >
        <RefreshCw className={cn("w-4 h-4", syncing && "animate-spin")} />
        {syncing ? "Kommentare werden geladen…" : "Aktualisieren — neue Kommentare von Instagram & Facebook holen"}
      </button>

      {syncError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {syncError}
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-1 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
              filter === f.key
                ? "text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
            style={
              filter === f.key
                ? { background: "var(--brand-primary)" }
                : undefined
            }
          >
            {f.label}
            {f.key === "unanswered" && unansweredCount > 0 && (
              <span className="ml-1.5 bg-white/20 text-white text-xs px-1.5 py-0.5 rounded-full">
                {unansweredCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Comment list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground gap-3">
          <MessageCircle className="w-10 h-10 opacity-30" />
          <p className="text-sm">Keine Kommentare gefunden.</p>
          {comments.length === 0 && (
            <button
              onClick={syncComments}
              disabled={syncing}
              className="text-sm underline underline-offset-4 hover:text-foreground"
            >
              Jetzt von Meta laden
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((comment) => {
            const isOpen = openReply === comment.id;
            return (
              <div
                key={comment.id}
                className={cn(
                  "rounded-xl border bg-card p-4 space-y-3 transition-all",
                  comment.replied && "opacity-70"
                )}
              >
                {/* Header */}
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold",
                      PLATFORM_COLOR[comment.platform]
                    )}
                  >
                    {comment.author_name[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{comment.author_name}</span>
                      <span
                        className={cn(
                          "text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded text-white",
                          PLATFORM_COLOR[comment.platform]
                        )}
                      >
                        {comment.platform === "instagram" ? "IG" : "FB"}
                      </span>
                      {comment.replied && (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          Beantwortet
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto shrink-0">
                        {formatDistanceToNow(new Date(comment.comment_timestamp), {
                          addSuffix: true,
                          locale: de,
                        })}
                      </span>
                    </div>
                    {comment.media_caption && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        Post: {comment.media_caption.slice(0, 60)}…
                      </p>
                    )}
                  </div>
                </div>

                {/* Comment text */}
                <p className="text-sm text-foreground pl-11">{comment.message}</p>

                {/* Existing reply */}
                {comment.replied && comment.reply_text && (
                  <div className="pl-11 flex items-start gap-2 text-sm text-muted-foreground">
                    <CornerDownRight className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <p className="italic">{comment.reply_text}</p>
                  </div>
                )}

                {/* Reply action */}
                {!comment.replied && (
                  <div className="pl-11">
                    {!isOpen ? (
                      <button
                        onClick={() => setOpenReply(comment.id)}
                        className="text-sm font-medium hover:underline"
                        style={{ color: "var(--brand-primary)" }}
                      >
                        Antworten
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <textarea
                          value={replyText[comment.id] ?? ""}
                          onChange={(e) =>
                            setReplyText((r) => ({
                              ...r,
                              [comment.id]: e.target.value,
                            }))
                          }
                          placeholder="Deine Antwort…"
                          rows={3}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary"
                          autoFocus
                        />
                        {errors[comment.id] && (
                          <p className="text-xs text-red-500">{errors[comment.id]}</p>
                        )}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => sendReply(comment.id, comment.platform)}
                            disabled={
                              sending === comment.id ||
                              !replyText[comment.id]?.trim()
                            }
                            className="px-3 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-opacity"
                            style={{ background: "var(--brand-primary)" }}
                          >
                            {sending === comment.id ? "Wird gesendet…" : "Senden"}
                          </button>
                          <button
                            onClick={() => setOpenReply(null)}
                            className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Abbrechen
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
