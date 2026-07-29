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
import { Sparkles, CalendarClock, Shuffle, Layers } from "lucide-react";
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
  const [lane, setLane] = useState<string>("auto");
  const [randomGenerating, setRandomGenerating] = useState(false);
  const [filling, setFilling] = useState(false);
  const randomDateRef = useRef<HTMLInputElement>(null);

  // Manuell
  const [manualLane, setManualLane] = useState<string>("emotional");
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

  /**
   * Füllt die nächsten freien Termine des Posting-Plans auf — dieselbe Engine,
   * die auch der nächtliche Cron nutzt. Praktisch, wenn der Puffer leer ist und
   * man nicht bis zum nächsten Morgen warten will.
   */
  async function fillBuffer() {
    setFilling(true);
    const t = toast.loading("Puffer wird aufgefüllt …", {
      description: "Bis zu 3 Posts inkl. Bild und Qualitäts-TÜV — das dauert ein paar Minuten.",
    });
    try {
      const res = await fetch("/api/posts/fill-buffer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 3 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Auffüllen fehlgeschlagen");

      if (data.created === 0 && data.openSlots === 0) {
        toast.success("Puffer ist schon voll ✓", {
          id: t,
          description: "Für die nächsten Tage sind alle Termine des Posting-Plans belegt.",
        });
      } else {
        toast.success(`${data.created} Post(s) erstellt ✓`, {
          id: t,
          description:
            (data.errors?.length ? `${data.errors.length} Fehlschlag/Fehlschläge. ` : "") +
            "Liegen in den Freigaben — prüfen & freigeben.",
        });
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unbekannter Fehler", { id: t });
    } finally {
      setFilling(false);
    }
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
      const res = await fetch("/api/posts/generate-random", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platforms,
          scheduledAt: localToIso(randomScheduledAt),
          ...(lane !== "auto" ? { lane } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generierung fehlgeschlagen");
      setPreview({ imageUrl: data.image_url, caption: data.caption });
      const score = data?.review?.score;
      toast.success("Zufalls-Post erstellt ✓", {
        description:
          (typeof score === "number" ? `Qualitäts-TÜV: ${score}/10. ` : "") +
          "Liegt in den Freigaben — prüfen & freigeben.",
      });
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
    // Ohne Plattform kam vorher erst nach dem Server-Roundtrip die rohe
    // API-Meldung statt eines sofortigen Hinweises.
    if (!platforms.length) {
      toast.error("Wähle mindestens eine Plattform.");
      return;
    }
    setGenerating(true);
    const body: GeneratorInput & { occasion?: string; scheduledAt?: string; lane?: string } = {
      theme,
      occasion: theme,
      product,
      message,
      season,
      platforms,
      lane: manualLane,
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
      {/* ── Puffer auffüllen ─────────────────────────── */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="space-y-0.5">
            <p className="font-medium">Puffer auffüllen</p>
            <p className="text-sm text-muted-foreground">
              Belegt die nächsten freien Termine aus deinem Posting-Plan — Thema,
              Format und Termin wählt die KI selbst, genau wie nachts der
              Automatik-Lauf. Nützlich, wenn die Freigaben leer sind.
            </p>
          </div>
        </div>
        <Button
          onClick={fillBuffer}
          disabled={busy || filling}
          variant="outline"
          className="w-full"
        >
          <Layers className={`w-4 h-4 mr-2 ${filling ? "animate-pulse" : ""}`} />
          {filling ? "Erstellt Posts … (kann einige Minuten dauern)" : "Bis zu 3 Posts erstellen"}
        </Button>
      </div>

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
          <Label>Säule</Label>
          <Select value={lane} onValueChange={(v) => v && setLane(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">🎲 Automatisch (60 % emotional, 40 % Produkt)</SelectItem>
              <SelectItem value="emotional">💚 Emotional — Vereinsleben & Gefühl</SelectItem>
              <SelectItem value="product">🛍️ Produkt — mit Benefits & CTA</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            {lane === "product"
              ? "Designtes Produkt-Layout: Wappen, Benefit-Leiste, CTA-Button — wie die Vorbild-Posts."
              : lane === "emotional"
                ? "Reduziertes Emotional-Layout: Wappen, Serifen-Headline, Schreibschrift-Akzent."
                : "Die KI wählt Säule + Konzept-Format mit Rotation — nie zwei Produkt-Posts in Folge."}
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
          {randomGenerating ? "KI denkt nach …" : "Zufalls-Post erstellen"}
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
          <Label>Säule</Label>
          <Select value={manualLane} onValueChange={(v) => v && setManualLane(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="emotional">💚 Emotional — Vereinsleben & Gefühl</SelectItem>
              <SelectItem value="product">🛍️ Produkt — mit Benefits & CTA</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Bestimmt das Layout: emotional (Wappen + Serifen-/Schreibschrift) oder Produkt (Benefit-Leiste + CTA).
          </p>
        </div>

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
