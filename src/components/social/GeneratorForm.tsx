"use client";

import { useRef, useState } from "react";
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
import { Sparkles, CalendarClock, Shuffle } from "lucide-react";
import {
  PLATFORM_COLOR,
  PLATFORM_LABEL,
  CONTENT_PILLARS,
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

function PlatformPicker({
  platforms,
  toggle,
}: {
  platforms: Platform[];
  toggle: (p: Platform) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(["instagram", "facebook", "tiktok", "linkedin"] as Platform[]).map((p) => {
        const active = platforms.includes(p);
        return (
          <button
            type="button"
            key={p}
            onClick={() => toggle(p)}
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
      })}
    </div>
  );
}

export function GeneratorForm() {
  const router = useRouter();

  // Zufalls-Post
  const [randomScheduledAt, setRandomScheduledAt] = useState("");
  const [pillar, setPillar] = useState<string>("auto");
  const [format, setFormat] = useState<"single" | "carousel">("single");
  const [randomGenerating, setRandomGenerating] = useState(false);
  const randomDateRef = useRef<HTMLInputElement>(null);

  // Manuell
  const [theme, setTheme] = useState(THEMES[0]);
  const [product, setProduct] = useState("");
  const [message, setMessage] = useState("");
  const [season, setSeason] = useState(SEASONS[0]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [generating, setGenerating] = useState(false);

  const [platforms, setPlatforms] = useState<Platform[]>(["instagram", "facebook"]);
  const [preview, setPreview] = useState<{
    imageUrl: string | null;
    caption: string | null;
  }>({ imageUrl: null, caption: null });

  function togglePlatform(p: Platform) {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  }

  async function generateRandom() {
    if (!randomScheduledAt) {
      toast.error("Bitte wähle erst Datum & Uhrzeit für den Post.");
      randomDateRef.current?.focus();
      randomDateRef.current?.showPicker?.();
      return;
    }
    if (platforms.length === 0) {
      toast.error("Bitte mindestens eine Plattform wählen.");
      return;
    }
    setRandomGenerating(true);
    try {
      const endpoint =
        format === "carousel" ? "/api/posts/generate-carousel" : "/api/posts/generate-random";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platforms,
          scheduledAt: localToIso(randomScheduledAt),
          ...(pillar !== "auto" ? { pillar } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generierung fehlgeschlagen");
      setPreview({ imageUrl: data.image_url, caption: data.caption });
      if (format === "carousel") {
        toast.success("Karussell erstellt ✓", {
          description: `${data.slides ?? ""} Slides — liegt in den Freigaben.`,
        });
      } else {
        const score = data?.review?.score;
        toast.success("Zufalls-Post erstellt ✓", {
          description:
            (typeof score === "number" ? `Qualitäts-TÜV: ${score}/10. ` : "") +
            "Liegt in den Freigaben — prüfen & freigeben.",
        });
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setRandomGenerating(false);
    }
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
      toast.success("Post generiert", { description: "Du findest ihn in den Freigaben." });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setGenerating(false);
    }
  }

  const busy = generating || randomGenerating;
  const hasPreview = !!(preview.imageUrl || preview.caption);

  return (
    <div className="max-w-xl space-y-6">
      {/* ── Zufalls-Post ─────────────────────────────── */}
      <div className="rounded-xl border border-dashed border-border p-4 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Shuffle className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="space-y-0.5">
            <p className="font-medium">Zufalls-Post</p>
            <p className="text-sm text-muted-foreground">
              Die KI wählt Thema, Stil und Botschaft selbst. Du gibst den
              Zeitpunkt an — danach kannst du ihn in den Freigaben prüfen und
              freigeben. Veröffentlicht wird er dann automatisch zum Termin.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Format</Label>
          <div className="flex gap-2">
            {([
              { key: "single", label: "Einzelbild" },
              { key: "carousel", label: "Karussell" },
            ] as const).map((f) => (
              <button
                type="button"
                key={f.key}
                onClick={() => setFormat(f.key)}
                className={cn(
                  "flex-1 px-3 py-1.5 text-sm rounded-md border transition-colors",
                  format === f.key
                    ? "bg-foreground text-background border-foreground"
                    : "bg-white text-foreground border-border hover:bg-muted",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          {format === "carousel" && (
            <p className="text-[11px] text-muted-foreground">
              Mehrere Slides (Cover + Punkte) — z.B. 5 Qualitätsmerkmale oder der
              Ablauf einer Ausstattung. Text wird scharf gerendert.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Content-Säule</Label>
          <Select value={pillar} onValueChange={(v) => v && setPillar(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">🎲 Automatisch (gewichtet)</SelectItem>
              {CONTENT_PILLARS.map((p) => (
                <SelectItem key={p.key} value={p.key}>
                  {p.emoji} {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            {pillar === "auto"
              ? "Die KI mischt strategisch — meist Gemeinschaft, ab und zu Qualität, Stories & Angebote."
              : CONTENT_PILLARS.find((p) => p.key === pillar)?.hint}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="random-date" className="flex items-center gap-1.5">
            <CalendarClock className="w-3.5 h-3.5" />
            Datum &amp; Uhrzeit
          </Label>
          <Input
            id="random-date"
            ref={randomDateRef}
            type="datetime-local"
            min={isoMinDefault()}
            value={randomScheduledAt}
            onChange={(e) => setRandomScheduledAt(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Plattformen</Label>
          <PlatformPicker platforms={platforms} toggle={togglePlatform} />
        </div>

        <Button
          onClick={generateRandom}
          disabled={busy}
          className="w-full"
          size="lg"
          style={{ background: "var(--brand-primary)", color: "white" }}
        >
          <Shuffle className={`w-4 h-4 mr-2 ${randomGenerating ? "animate-spin" : ""}`} />
          {randomGenerating
            ? "KI denkt nach …"
            : format === "carousel"
              ? "Karussell erstellen"
              : "Zufalls-Post erstellen"}
        </Button>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="flex-1 border-t border-border" />
        oder manuell mit eigenem Briefing
        <div className="flex-1 border-t border-border" />
      </div>

      {/* ── Manuelles Formular ───────────────────────── */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Thema / Anlass</Label>
          <Select value={theme} onValueChange={(v) => v && setTheme(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {THEMES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
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
                <SelectItem key={s} value={s}>{s}</SelectItem>
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
          <PlatformPicker platforms={platforms} toggle={togglePlatform} />
        </div>

        <Button
          onClick={generate}
          disabled={busy}
          className="w-full"
          size="lg"
          style={{ background: "var(--brand-primary)", color: "white" }}
        >
          <Sparkles className="w-4 h-4 mr-2" />
          {generating ? "Generiere …" : "Post generieren"}
        </Button>
      </div>

      {/* Preview — nur sichtbar wenn was generiert wurde */}
      {hasPreview && (
        <div className="pt-2 border-t border-border">
          <p className="text-sm font-medium mb-3">Vorschau</p>
          <PostPreview
            imageUrl={preview.imageUrl}
            caption={preview.caption}
            platforms={platforms}
          />
        </div>
      )}
    </div>
  );
}
