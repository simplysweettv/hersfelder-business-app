"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, CalendarClock, Shuffle } from "lucide-react";
import {
  PLATFORM_COLOR,
  PLATFORM_LABEL,
  type GeneratorInput,
  type Platform,
} from "@/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PostPreview } from "./PostPreview";
import { useRouter } from "next/navigation";

const THEMES = [
  "Neue Kollektion",
  "Schützenfest",
  "Gewinnspiel",
  "Vereinsleben",
  "Saisonaktion",
  "Tradition & Werte",
  "Jungschützen",
];
const SEASONS = ["Frühling", "Sommer", "Herbst", "Winter", "Ganzjährig"];

function localToIso(local: string) {
  if (!local) return undefined;
  return new Date(local).toISOString();
}

function isoMinDefault() {
  const now = new Date();
  now.setSeconds(0, 0);
  now.setMinutes(now.getMinutes() + 5);
  return now.toISOString().slice(0, 16);
}

export function GeneratorForm() {
  const router = useRouter();
  const [theme, setTheme] = useState(THEMES[0]);
  const [product, setProduct] = useState("");
  const [message, setMessage] = useState("");
  const [season, setSeason] = useState(SEASONS[0]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [platforms, setPlatforms] = useState<Platform[]>([
    "instagram",
    "facebook",
  ]);
  const [generating, setGenerating] = useState(false);
  const [randomGenerating, setRandomGenerating] = useState(false);
  const [preview, setPreview] = useState<{
    imageUrl: string | null;
    caption: string | null;
  }>({ imageUrl: null, caption: null });

  function togglePlatform(p: Platform) {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  }

  async function generate() {
    if (!product.trim() || !message.trim()) {
      toast.error("Produkt und Botschaft sind Pflicht.");
      return;
    }
    setGenerating(true);
    const body: GeneratorInput & { occasion?: string; scheduledAt?: string } = {
      theme,
      occasion: theme,
      product,
      message,
      season,
      platforms,
      ...(scheduledAt ? { scheduledAt: localToIso(scheduledAt) } : {}),
    };
    try {
      const res = await fetch("/api/posts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generierung fehlgeschlagen");
      setPreview({ imageUrl: data.image_url, caption: data.caption });
      toast.success("Post generiert", {
        description: "Du findest ihn in den Freigaben.",
      });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setGenerating(false);
    }
  }

  async function generateRandom() {
    setRandomGenerating(true);
    try {
      const res = await fetch("/api/posts/generate-random", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generierung fehlgeschlagen");
      setPreview({ imageUrl: data.image_url, caption: data.caption });
      toast.success("Zufalls-Post generiert", {
        description: "Du findest ihn in den Freigaben.",
      });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setRandomGenerating(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">
      <div>
        <Tabs defaultValue="manual" className="w-full">
          <TabsList className="w-full mb-5">
            <TabsTrigger value="manual" className="flex-1 gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Manuell
            </TabsTrigger>
            <TabsTrigger value="random" className="flex-1 gap-1.5">
              <Shuffle className="w-3.5 h-3.5" />
              Zufalls-Post
            </TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="space-y-5 mt-0">
            <div className="space-y-1.5">
              <Label>Thema / Anlass</Label>
              <Select value={theme} onValueChange={(v) => v && setTheme(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {THEMES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product">Produkt / Kollektion</Label>
              <Input
                id="product"
                placeholder="z.B. Schützenrock Premium 2026"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="message">Botschaft / Stimmung</Label>
              <Textarea
                id="message"
                placeholder="z.B. Tradition trifft auf moderne Verarbeitung"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Jahreszeit / Saison</Label>
              <Select value={season} onValueChange={(v) => v && setSeason(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEASONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scheduled-at" className="flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5" />
                Datum &amp; Uhrzeit
              </Label>
              <Input
                id="scheduled-at"
                type="datetime-local"
                min={isoMinDefault()}
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Leer lassen = kein fester Termin (landet in Freigaben)
              </p>
            </div>

            <div className="space-y-2">
              <Label>Plattformen</Label>
              <div className="flex flex-wrap gap-2">
                {(["instagram", "facebook", "tiktok", "linkedin"] as Platform[]).map(
                  (p) => {
                    const active = platforms.includes(p);
                    return (
                      <button
                        type="button"
                        key={p}
                        onClick={() => togglePlatform(p)}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border transition-colors",
                          active
                            ? "bg-foreground text-background border-foreground"
                            : "bg-white text-foreground border-border hover:bg-muted",
                        )}
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: PLATFORM_COLOR[p] }}
                        />
                        {PLATFORM_LABEL[p]}
                      </button>
                    );
                  },
                )}
              </div>
            </div>

            <Button
              onClick={generate}
              disabled={generating}
              className="w-full"
              size="lg"
              style={{ background: "var(--brand-primary)", color: "white" }}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {generating ? "Generiere …" : "Post generieren"}
            </Button>
          </TabsContent>

          <TabsContent value="random" className="mt-0">
            <div className="rounded-xl border border-dashed border-border p-6 text-center space-y-4">
              <div className="flex justify-center">
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                  <Shuffle className="w-7 h-7 text-muted-foreground" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="font-medium">Die KI entscheidet alles</p>
                <p className="text-sm text-muted-foreground">
                  Thema, Stil, Botschaft und Bild — komplett zufällig und trotzdem
                  markenkonform. Perfekt wenn du einfach einen neuen Post brauchst.
                </p>
              </div>

              <div className="space-y-2 pt-1">
                <Label className="text-left block">Plattformen</Label>
                <div className="flex flex-wrap gap-2 justify-center">
                  {(["instagram", "facebook", "tiktok", "linkedin"] as Platform[]).map(
                    (p) => {
                      const active = platforms.includes(p);
                      return (
                        <button
                          type="button"
                          key={p}
                          onClick={() => togglePlatform(p)}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border transition-colors",
                            active
                              ? "bg-foreground text-background border-foreground"
                              : "bg-white text-foreground border-border hover:bg-muted",
                          )}
                        >
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ background: PLATFORM_COLOR[p] }}
                          />
                          {PLATFORM_LABEL[p]}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>

              <Button
                onClick={generateRandom}
                disabled={randomGenerating}
                className="w-full"
                size="lg"
                style={{ background: "var(--brand-primary)", color: "white" }}
              >
                <Shuffle className="w-4 h-4 mr-2" />
                {randomGenerating ? "KI denkt nach …" : "Überrasch mich!"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <div>
        <PostPreview
          imageUrl={preview.imageUrl}
          caption={preview.caption}
          platforms={platforms}
        />
      </div>
    </div>
  );
}
