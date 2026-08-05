"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Images, Loader2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  parseMediaUsageMode,
  MEDIA_USAGE_MODE_LABEL,
  type MediaUsageMode,
} from "@/lib/media-library";
import { cn } from "@/lib/utils";

const MODES: MediaUsageMode[] = ["photo+reference", "reference", "off"];

const HINT: Record<MediaUsageMode, string> = {
  "photo+reference":
    "Empfohlen: Manche Posts bekommen ein echtes Foto, bei den übrigen orientiert sich die KI am Look eurer Bilder.",
  reference:
    "Die KI erzeugt jedes Foto selbst, nimmt eure Bilder aber als Vorlage für Kleidung, Menschen und Stimmung.",
  off: "Eure Bilder bleiben ungenutzt — alle Fotos kommen wie früher komplett aus der KI.",
};

/** Steuert, wie stark Automatik-Posts auf die Bildbibliothek zugreifen. */
export default function MediaUsageCard() {
  const [mode, setMode] = useState<MediaUsageMode>("photo+reference");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<MediaUsageMode | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "media_usage_mode")
        .maybeSingle();
      setMode(parseMediaUsageMode(data?.value ?? null));
      setLoading(false);
    })();
  }, []);

  async function save(next: MediaUsageMode) {
    setSaving(next);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "media_usage_mode", value: next }),
      });
      if (!res.ok) throw new Error("Speichern fehlgeschlagen");
      setMode(next);
      toast.success("Gespeichert ✓", { description: MEDIA_USAGE_MODE_LABEL[next] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-1">
        <Images className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-medium">Eigene Bilder in den Posts</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-3">
        Gilt für die automatisch erzeugten Posts (Nachtlauf, Zufalls-Post,
        Puffer). Hochgeladen werden die Fotos in der{" "}
        <Link href="/social/bilder" className="underline">
          Bildbibliothek
        </Link>
        .
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Lade Einstellung…
        </div>
      ) : (
        <div className="space-y-2">
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => save(m)}
              disabled={saving !== null}
              className={cn(
                "w-full text-left rounded-lg border p-3 transition-colors",
                mode === m ? "border-foreground bg-muted" : "border-border hover:bg-muted/50",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium flex-1">{MEDIA_USAGE_MODE_LABEL[m]}</span>
                {saving === m ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : mode === m ? (
                  <Check className="w-4 h-4" />
                ) : null}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">{HINT[m]}</p>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
