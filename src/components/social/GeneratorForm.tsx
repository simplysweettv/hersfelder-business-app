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
import { Sparkles, CalendarClock, Shuffle, Layers, GalleryHorizontalEnd } from "lucide-react";
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
import Link from "next/link";
import type { MediaAsset } from "@/lib/media-library";

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

  // Karussell
  const [carouselLane, setCarouselLane] = useState<string>("auto");
  const [carouselPoints, setCarouselPoints] = useState<string>("4");
  const [carouselScheduledAt, setCarouselScheduledAt] = useState("");
  const [carouselGenerating, setCarouselGenerating] = useState(false);

  // Manuell
  const [manualLane, setManualLane] = useState<string>("emotional");
  // Bildquelle: auto = Bibliothek wie in den Einstellungen, library = eigenes
  // Foto, ai = ohne Bibliothek.
  const [imageSource, setImageSource] = useState<string>("auto");
  const [mediaAssetId, setMediaAssetId] = useState<string>("");
  const [mediaPhotos, setMediaPhotos] = useState<MediaAsset[] | null>(null);
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

  /**
   * Die eigenen Fotos erst laden, wenn sie gebraucht werden — der Generator
   * soll nicht bei jedem Aufruf die halbe Bibliothek ziehen.
   */
  async function loadMediaPhotos() {
    if (mediaPhotos) return;
    try {
      const res = await fetch("/api/media");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bibliothek nicht ladbar");
      setMediaPhotos(
        (data.assets as MediaAsset[]).filter((a) => a.active && a.usage !== "reference"),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bibliothek nicht ladbar");
      setMediaPhotos([]);
    }
  }

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
      description: "Pro Post ein Bild und zwei KI-Prüfungen — das dauert einige Minuten.",
    });

    // Ein Serverlauf schafft höchstens 3 Posts (Vercel deckelt bei 300 s).
    // Statt den Nutzer mehrfach klicken zu lassen, rufen wir hier so lange
    // nach, bis keine freien Termine mehr übrig sind. Die Runden-Obergrenze
    // ist nur eine Notbremse gegen Endlosschleifen.
    const MAX_RUNDEN = 4;
    let gesamt = 0;
    const fehler: string[] = [];

    try {
      for (let runde = 1; runde <= MAX_RUNDEN; runde++) {
        const res = await fetch("/api/posts/fill-buffer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: 3 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Auffüllen fehlgeschlagen");

        gesamt += data.created ?? 0;
        if (Array.isArray(data.errors)) fehler.push(...data.errors);
        router.refresh();

        // Keine freien Termine mehr → fertig.
        if (!data.openSlots) break;

        // Der Lauf hat einen Slot gefunden, aber nichts erzeugt: weiteres
        // Nachfassen würde nur denselben Fehler wiederholen.
        if (!data.created) break;

        if (runde < MAX_RUNDEN) {
          toast.loading(`${gesamt} Posts erstellt — es sind noch Termine frei …`, {
            id: t,
            description: "Läuft weiter, du kannst das Fenster offen lassen.",
          });
        }
      }

      if (gesamt === 0 && fehler.length === 0) {
        toast.success("Puffer ist schon voll ✓", {
          id: t,
          description: "Für die nächsten Tage sind alle Termine des Posting-Plans belegt.",
        });
      } else {
        toast.success(`${gesamt} Post(s) erstellt ✓`, {
          id: t,
          description:
            (fehler.length ? `${fehler.length} Fehlschlag/Fehlschläge. ` : "") +
            "Liegen in den Freigaben — prüfen & freigeben.",
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unbekannter Fehler";
      toast.error(msg, {
        id: t,
        description: gesamt > 0 ? `${gesamt} Post(s) waren vorher schon fertig.` : undefined,
      });
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

  /**
   * Karussell: Cover (Foto + Aussage) + Inhalts-Slides + Abschluss-Slide.
   * Dauert länger als ein Einzelpost — Foto, mehrere Renders und der
   * Qualitäts-TÜV laufen nacheinander.
   */
  async function generateCarousel() {
    if (platforms.length === 0) {
      toast.error("Bitte mindestens eine Plattform wählen.");
      return;
    }
    setCarouselGenerating(true);
    const t = toast.loading("Karussell wird gebaut …", {
      description: "Cover mit Foto, Inhalts-Slides und Abschluss — das dauert 1–2 Minuten.",
    });
    try {
      const res = await fetch("/api/posts/generate-carousel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platforms,
          points: Number(carouselPoints),
          ...(carouselScheduledAt ? { scheduledAt: localToIso(carouselScheduledAt) } : {}),
          ...(carouselLane !== "auto" ? { lane: carouselLane } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generierung fehlgeschlagen");
      setPreview({ imageUrl: data.image_url, caption: data.caption });
      toast.success(`Karussell mit ${data.slides} Slides erstellt ✓`, {
        id: t,
        description: "Liegt in den Freigaben — dort siehst du alle Slides.",
      });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unbekannter Fehler", { id: t });
    } finally {
      setCarouselGenerating(false);
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
    const body: GeneratorInput & {
      occasion?: string;
      scheduledAt?: string;
      lane?: string;
      imageSource?: string;
      mediaAssetId?: string;
    } = {
      theme,
      occasion: theme,
      product,
      message,
      season,
      platforms,
      lane: manualLane,
      imageSource,
      ...(imageSource === "library" && mediaAssetId ? { mediaAssetId } : {}),
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

  const busy = generating || randomGenerating || carouselGenerating;
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
              Belegt alle freien Termine der nächsten Tage aus deinem
              Posting-Plan — Thema, Format und Termin wählt die KI selbst, genau
              wie nachts der Automatik-Lauf. Ein Klick genügt; es läuft durch,
              bis der Puffer voll ist. Rechne mit ein paar Minuten pro Post.
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
          {filling ? "Erstellt Posts … (bitte offen lassen)" : "Puffer jetzt füllen"}
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

      {/* ── Karussell ────────────────────────────────── */}
      <div className="rounded-xl border border-dashed border-border p-4 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <GalleryHorizontalEnd className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="space-y-0.5">
            <p className="font-medium">Karussell</p>
            <p className="text-sm text-muted-foreground">
              Mehrere Bilder zum Durchwischen. Slide 1 ist ein vollwertiger Post
              mit echtem Foto und einer starken Aussage — nur die entscheidet, ob
              jemand weiterwischt. Danach faltet das Karussell dieselbe Idee in
              ruhige Text-Slides auf und endet mit Fazit und Einladung.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Säule</Label>
            <Select value={carouselLane} onValueChange={(v) => v && setCarouselLane(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">🎲 Automatisch</SelectItem>
                <SelectItem value="emotional">💚 Emotional</SelectItem>
                <SelectItem value="product">🛍️ Produkt</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Inhalts-Slides</Label>
            <Select value={carouselPoints} onValueChange={(v) => v && setCarouselPoints(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["3", "4", "5"].map((n) => (
                  <SelectItem key={n} value={n}>
                    {n} (= {Number(n) + 2} Slides gesamt)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="carousel-date" className="flex items-center gap-1.5">
            <CalendarClock className="w-3.5 h-3.5" />
            Datum &amp; Uhrzeit
          </Label>
          <Input
            id="carousel-date"
            type="datetime-local"
            min={isoMinDefault()}
            value={carouselScheduledAt}
            onChange={(e) => setCarouselScheduledAt(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            Leer lassen = kein fester Termin (landet in Freigaben)
          </p>
        </div>

        <div className="space-y-2">
          <Label>Plattformen</Label>
          <PlatformPicker platforms={platforms} toggle={togglePlatform} />
        </div>

        <Button onClick={generateCarousel} disabled={busy} variant="outline" className="w-full" size="lg">
          <GalleryHorizontalEnd className={`w-4 h-4 mr-2 ${carouselGenerating ? "animate-pulse" : ""}`} />
          {carouselGenerating ? "Baut Slides … (bitte offen lassen)" : "Karussell erstellen"}
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
          <Label>Bildquelle</Label>
          <Select
            value={imageSource}
            onValueChange={(v) => {
              if (!v) return;
              setImageSource(v);
              if (v === "library") void loadMediaPhotos();
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">🤖 Automatisch — KI-Foto, eure Bilder als Referenz</SelectItem>
              <SelectItem value="library">📷 Eigenes Foto aus der Bildbibliothek</SelectItem>
              <SelectItem value="ai">✨ Nur KI — Bibliothek ignorieren</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            {imageSource === "library"
              ? "Ein echtes Foto trägt den Post. Layout und Texte richten sich nach dem Motiv."
              : imageSource === "ai"
                ? "Die KI erfindet die Szene komplett selbst — ohne eure hochgeladenen Bilder."
                : "Die KI erzeugt das Foto und orientiert sich dabei am Look eurer hochgeladenen Bilder."}
          </p>

          {imageSource === "library" && (
            <div className="pt-1.5">
              {mediaPhotos === null ? (
                <p className="text-xs text-muted-foreground">Bibliothek wird geladen …</p>
              ) : mediaPhotos.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Noch keine eigenen Fotos.{" "}
                  <Link href="/social/bilder" className="underline">
                    Jetzt hochladen
                  </Link>
                  .
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-2">
                    {mediaPhotos.slice(0, 12).map((a) => (
                      <button
                        type="button"
                        key={a.id}
                        onClick={() => setMediaAssetId(mediaAssetId === a.id ? "" : a.id)}
                        title={a.title ?? undefined}
                        className={cn(
                          "relative aspect-[4/5] rounded-md overflow-hidden border-2 transition-colors",
                          mediaAssetId === a.id ? "border-foreground" : "border-transparent",
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={a.public_url}
                          alt={a.title ?? "Bild"}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    {mediaAssetId
                      ? "Dieses Foto wird verwendet."
                      : "Kein Bild gewählt = die Bibliothek nimmt das am längsten nicht genutzte passende Foto."}
                  </p>
                </>
              )}
            </div>
          )}
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
