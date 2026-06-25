"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PlatformPills } from "./PlatformDots";
import { Pencil, Check, Sparkles, ChevronDown, ChevronUp, RefreshCw, Save, X, Trash2 } from "lucide-react";
import type { Post } from "@/types";
import { formatDateTime } from "@/lib/date-utils";
// Zentrale Caption-Logik — eine Quelle der Wahrheit (auch der Cron nutzt diese).
import { splitCaption, buildCaption } from "@/lib/caption";

type PlatformKey = "instagram" | "facebook" | "tiktok" | "linkedin";

const PLATFORM_LABELS: Record<PlatformKey, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
};

export function ApprovalCard({ post }: { post: Post }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [captions, setCaptions] = useState<Partial<Record<PlatformKey, string>>>(
    () => splitCaption(post.caption ?? "")
  );

  const captionEntries = Object.entries(captions) as [PlatformKey, string][];

  function approve() {
    start(async () => {
      const res = await fetch(`/api/posts/${post.id}/approve`, { method: "POST" });
      if (!res.ok) { toast.error("Freigabe fehlgeschlagen"); return; }
      toast.success("Post freigegeben ✓");
      router.refresh();
    });
  }

  async function saveCaption() {
    const newCaption = buildCaption(captions);
    const res = await fetch(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caption: newCaption }),
    });
    if (!res.ok) { toast.error("Speichern fehlgeschlagen"); return; }
    toast.success("Text gespeichert ✓");
    setEditing(false);
  }

  async function deletePost() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Löschen fehlgeschlagen"); return; }
      toast.success("Post gelöscht");
      router.refresh();
    } catch {
      toast.error("Fehler beim Löschen");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function regenerate() {
    setRegenerating(true);
    setExpanded(true);
    try {
      const res = await fetch(`/api/posts/${post.id}/regenerate`, { method: "POST" });
      if (!res.ok) { toast.error("Regenerierung fehlgeschlagen"); return; }
      const data = await res.json();
      toast.success(`Neu generiert: ${data.title ?? "fertig"} ✓`);
      router.refresh();
    } catch {
      toast.error("Fehler beim Regenerieren");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      {/* Header row */}
      <div className="p-3 flex items-start gap-3">
        <div
          className="w-[52px] h-[52px] rounded-md shrink-0 flex items-center justify-center cursor-pointer mt-0.5"
          onClick={() => setExpanded((v) => !v)}
          style={{
            background: post.image_url
              ? `center / cover no-repeat url(${post.image_url})`
              : "linear-gradient(135deg, var(--brand-primary), var(--brand-sidebar))",
          }}
        >
          {!post.image_url && <Sparkles className="w-4 h-4 text-white/70" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{post.title || "Ohne Titel"}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {post.scheduled_at
              ? `geplant für ${formatDateTime(post.scheduled_at)}`
              : "noch nicht eingeplant"}
          </div>
          <div className="mt-1.5">
            <PlatformPills platforms={post.platforms} />
          </div>
          {/* Buttons auf Mobile: kompakt unter dem Titel */}
          <div className="mt-2 flex items-center gap-1.5 flex-wrap md:hidden">
            <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}
              className="text-muted-foreground h-7 px-2 text-xs gap-1">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {expanded ? "Einklappen" : "Vorschau"}
            </Button>
            <Button variant="outline" size="sm" disabled={pending || regenerating || deleting}
              onClick={() => { setExpanded(true); setEditing((v) => !v); }}
              className="h-7 px-2 text-xs gap-1">
              <Pencil className="w-3 h-3" />
              {editing ? "Abbrechen" : "Bearbeiten"}
            </Button>
            <Button variant="outline" size="sm" disabled={pending || regenerating || deleting}
              onClick={regenerate} className="h-7 px-2 text-xs gap-1">
              <RefreshCw className={`w-3 h-3 ${regenerating ? "animate-spin" : ""}`} />
              {regenerating ? "…" : "Neu"}
            </Button>
            {confirmDelete ? (
              <>
                <Button size="sm" disabled={deleting} onClick={deletePost}
                  className="h-7 px-2 text-xs gap-1 bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  <Trash2 className="w-3 h-3" />
                  {deleting ? "…" : "Ja, löschen"}
                </Button>
                <Button variant="outline" size="sm" disabled={deleting}
                  onClick={() => setConfirmDelete(false)} className="h-7 px-2 text-xs">
                  Nein
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" disabled={pending || regenerating || deleting}
                onClick={() => setConfirmDelete(true)}
                className="h-7 px-2 text-xs gap-1 text-destructive hover:text-destructive hover:border-destructive">
                <Trash2 className="w-3 h-3" />
                Löschen
              </Button>
            )}
            <Button size="sm" disabled={pending || regenerating || deleting} onClick={approve}
              className="h-7 px-2 text-xs gap-1"
              style={{ background: "var(--brand-primary)", color: "white" }}>
              <Check className="w-3 h-3" />
              Freigeben
            </Button>
          </div>
        </div>
        {/* Buttons auf Desktop: rechts neben dem Titel */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}
            className="text-muted-foreground">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {expanded ? "Einklappen" : "Vorschau"}
          </Button>
          <Button variant="outline" size="sm" disabled={pending || regenerating || deleting}
            onClick={() => { setExpanded(true); setEditing((v) => !v); }}>
            <Pencil className="w-3.5 h-3.5" />
            {editing ? "Abbrechen" : "Bearbeiten"}
          </Button>
          <Button variant="outline" size="sm" disabled={pending || regenerating || deleting}
            onClick={regenerate} title="Neuen Post generieren">
            <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? "animate-spin" : ""}`} />
            {regenerating ? "Lädt…" : "Neu"}
          </Button>
          {confirmDelete ? (
            <>
              <Button size="sm" disabled={deleting} onClick={deletePost}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                <Trash2 className="w-3.5 h-3.5" />
                {deleting ? "Lädt…" : "Ja, löschen"}
              </Button>
              <Button variant="outline" size="sm" disabled={deleting}
                onClick={() => setConfirmDelete(false)}>
                Nein
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" disabled={pending || regenerating || deleting}
              onClick={() => setConfirmDelete(true)}
              className="text-destructive hover:text-destructive hover:border-destructive">
              <Trash2 className="w-3.5 h-3.5" />
              Löschen
            </Button>
          )}
          <Button size="sm" disabled={pending || regenerating || deleting} onClick={approve}
            style={{ background: "var(--brand-primary)", color: "white" }}>
            <Check className="w-3.5 h-3.5" />
            Freigeben
          </Button>
        </div>
      </div>

      {/* Expanded preview */}
      {expanded && (
        <div className="border-t border-border">
          <div className="flex flex-col md:flex-row">
            {/* Image */}
            {post.image_url && (
              <div className="md:w-72 shrink-0">
                <img
                  src={post.image_url}
                  alt={post.title ?? "Post Bild"}
                  className="w-full object-cover max-h-72 md:max-h-none md:h-full"
                />
              </div>
            )}

            {/* Captions */}
            <div className="flex-1 p-4 space-y-4 bg-muted/30 overflow-y-auto max-h-96">
              {captionEntries.length === 0 && (
                <p className="text-sm text-muted-foreground">Keine Caption vorhanden.</p>
              )}
              {captionEntries.map(([platform, text], i) => (
                <div key={platform} className={i > 0 ? "pt-3 border-t border-border" : ""}>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    {PLATFORM_LABELS[platform]}
                  </div>
                  {editing ? (
                    <textarea
                      className="w-full text-sm leading-relaxed p-2 rounded border border-border bg-background resize-y min-h-[80px] focus:outline-none focus:ring-1 focus:ring-ring"
                      value={text}
                      onChange={(e) =>
                        setCaptions((prev) => ({ ...prev, [platform]: e.target.value }))
                      }
                    />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{text}</p>
                  )}
                </div>
              ))}

              {editing && (
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={saveCaption} style={{ background: "var(--brand-primary)", color: "white" }}>
                    <Save className="w-3.5 h-3.5" />
                    Speichern
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditing(false); setCaptions(splitCaption(post.caption ?? "")); }}>
                    <X className="w-3.5 h-3.5" />
                    Abbrechen
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
