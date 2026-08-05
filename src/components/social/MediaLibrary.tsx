"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImagePlus, Loader2, Trash2, Upload, Eye, EyeOff } from "lucide-react";
import type { MediaAsset, MediaLane, MediaUsage } from "@/lib/media-library";
import { cn } from "@/lib/utils";

const USAGE_LABEL: Record<MediaUsage, string> = {
  both: "Im Post & als Referenz",
  photo: "Nur direkt im Post",
  reference: "Nur als Stil-Referenz",
};

const LANE_LABEL: Record<MediaLane, string> = {
  both: "Beide Säulen",
  emotional: "Emotional (Vereinsleben)",
  product: "Produkt (Kleidung)",
};

function fmtBytes(b: number | null) {
  if (!b) return "";
  return b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
}

export function MediaLibrary({ initialAssets }: { initialAssets: MediaAsset[] }) {
  const [assets, setAssets] = useState<MediaAsset[]>(initialAssets);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [usage, setUsage] = useState<MediaUsage>("both");
  const [lane, setLane] = useState<MediaLane>("both");
  const [description, setDescription] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (!list.length) {
        toast.error("Bitte Bilddateien auswählen (JPG oder PNG).");
        return;
      }
      setUploading(true);
      const t = toast.loading(`${list.length} Bild(er) werden hochgeladen …`);
      try {
        const form = new FormData();
        list.forEach((f) => form.append("files", f));
        form.append("usage", usage);
        form.append("lane", lane);
        form.append("description", description);

        const res = await fetch("/api/media", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload fehlgeschlagen");

        setAssets((prev) => [...(data.created as MediaAsset[]), ...prev]);
        setDescription("");
        toast.success(`${data.created.length} Bild(er) in der Bibliothek ✓`, {
          id: t,
          description: data.errors?.length
            ? `Nicht übernommen: ${data.errors.join(" · ")}`
            : "Werden ab sofort für neue Posts verwendet.",
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload fehlgeschlagen", { id: t });
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [usage, lane, description],
  );

  async function patch(id: string, patchBody: Partial<MediaAsset>) {
    // Optimistisch: das Formular soll sich nicht ruckelig anfühlen.
    setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, ...patchBody } : a)));
    const res = await fetch(`/api/media/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patchBody),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Änderung konnte nicht gespeichert werden");
    }
  }

  async function remove(asset: MediaAsset) {
    if (!confirm(`„${asset.title ?? "Bild"}" endgültig aus der Bibliothek löschen?`)) return;
    const res = await fetch(`/api/media/${asset.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Löschen fehlgeschlagen");
      return;
    }
    setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    toast.success("Bild gelöscht");
  }

  const activeCount = assets.filter((a) => a.active).length;

  return (
    <div className="space-y-6">
      {/* ── Upload ──────────────────────────────────────── */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) void upload(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-xl border-2 border-dashed p-5 space-y-4 transition-colors",
          dragging ? "border-foreground bg-muted" : "border-border",
        )}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <ImagePlus className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="space-y-0.5">
            <p className="font-medium">Echte Schützenbilder hochladen</p>
            <p className="text-sm text-muted-foreground">
              Zieh Fotos hierher oder wähle sie aus. Sie werden gespeichert und
              für neue Posts verwendet — entweder direkt als Foto im Post oder
              als Vorlage, an der sich die KI beim Erzeugen orientiert.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Verwendung</Label>
            <Select value={usage} onValueChange={(v) => v && setUsage(v as MediaUsage)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(USAGE_LABEL) as MediaUsage[]).map((u) => (
                  <SelectItem key={u} value={u}>
                    {USAGE_LABEL[u]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Passt zu</Label>
            <Select value={lane} onValueChange={(v) => v && setLane(v as MediaLane)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LANE_LABEL) as MediaLane[]).map((l) => (
                  <SelectItem key={l} value={l}>
                    {LANE_LABEL[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="media-desc">Was ist auf den Bildern zu sehen?</Label>
          <Textarea
            id="media-desc"
            rows={2}
            placeholder="z.B. Festumzug in Bad Hersfeld, Mitglieder in dunkelgrünen Westen, Sommerabend"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            Wichtig: Diese Beschreibung bekommt die KI mit. Ohne sie weiß sie
            nicht, was an dem Foto nachahmenswert ist — und die Texte passen
            schlechter zum Motiv.
          </p>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => e.target.files?.length && void upload(e.target.files)}
        />
        <Button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full"
          style={{ background: "var(--brand-primary)", color: "white" }}
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Upload className="w-4 h-4 mr-2" />
          )}
          {uploading ? "Lädt hoch …" : "Bilder auswählen"}
        </Button>
      </div>

      {/* ── Bestand ─────────────────────────────────────── */}
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium">
          {assets.length} Bild(er) in der Bibliothek
        </p>
        <p className="text-xs text-muted-foreground">{activeCount} aktiv nutzbar</p>
      </div>

      {assets.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-lg border border-border p-6 text-center">
          Noch keine Bilder. Solange die Bibliothek leer ist, erzeugt die KI alle
          Fotos selbst — genau wie bisher.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {assets.map((a) => (
            <div
              key={a.id}
              className={cn(
                "rounded-xl border border-border overflow-hidden flex flex-col",
                !a.active && "opacity-60",
              )}
            >
              <div className="relative aspect-[4/5] bg-muted">
                <Image
                  src={a.public_url}
                  alt={a.title ?? "Bild aus der Bibliothek"}
                  fill
                  sizes="(max-width: 640px) 100vw, 33vw"
                  className="object-cover"
                  unoptimized
                />
              </div>
              <div className="p-3 space-y-2.5 flex-1 flex flex-col">
                <Input
                  defaultValue={a.title ?? ""}
                  placeholder="Titel"
                  className="h-8 text-sm"
                  onBlur={(e) =>
                    e.target.value !== (a.title ?? "") && patch(a.id, { title: e.target.value })
                  }
                />
                <Textarea
                  defaultValue={a.description ?? ""}
                  rows={2}
                  placeholder="Was ist zu sehen?"
                  className="text-sm"
                  onBlur={(e) =>
                    e.target.value !== (a.description ?? "") &&
                    patch(a.id, { description: e.target.value })
                  }
                />
                <Select
                  value={a.usage}
                  onValueChange={(v) => v && patch(a.id, { usage: v as MediaUsage })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(USAGE_LABEL) as MediaUsage[]).map((u) => (
                      <SelectItem key={u} value={u}>
                        {USAGE_LABEL[u]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={a.lane}
                  onValueChange={(v) => v && patch(a.id, { lane: v as MediaLane })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(LANE_LABEL) as MediaLane[]).map((l) => (
                      <SelectItem key={l} value={l}>
                        {LANE_LABEL[l]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex items-center justify-between pt-1 mt-auto text-[11px] text-muted-foreground">
                  <span>
                    {a.times_used}× verwendet
                    {a.bytes ? ` · ${fmtBytes(a.bytes)}` : ""}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      title={a.active ? "Vorübergehend pausieren" : "Wieder verwenden"}
                      onClick={() => patch(a.id, { active: !a.active })}
                    >
                      {a.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-red-600 hover:text-red-700"
                      title="Löschen"
                      onClick={() => remove(a)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
