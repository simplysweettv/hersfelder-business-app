"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TrafficLightDot, TrafficLightChip } from "./TrafficLight";
import { formatDateTime } from "@/lib/date-utils";
import type { PostHealth, PlatformHealth } from "@/lib/post-health";
import { PLATFORM_LABEL } from "@/types";
import { ExternalLink, RefreshCw, AlertTriangle, Info } from "lucide-react";

/**
 * Das "was ist passiert"-Fenster: pro Kanal der genaue Zustand, bei Fehlern
 * die EXAKTE Meldung des Anbieters im Klartext plus die Handlungsempfehlung.
 * Nichts wird gekürzt oder in einem Tooltip versteckt — Andreas soll direkt
 * reagieren können, auch vom Handy aus.
 */
export function PublicationDetail({
  postId,
  health,
}: {
  postId: string;
  health: PostHealth;
}) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);

  async function retry() {
    setRetrying(true);
    try {
      const res = await fetch(`/api/posts/${postId}/retry`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        status?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Neuer Versuch fehlgeschlagen.");
      if (data.ok) {
        toast.success("Neuer Versuch gestartet", {
          description: "Der Post wurde erneut an den Veröffentlichungsdienst übergeben.",
        });
      } else {
        toast.error("Hat wieder nicht geklappt", {
          description: data.error ?? "Details stehen im Status-Fenster.",
        });
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Kopf: Ampel + Klartext-Zusammenfassung */}
      <div className="flex items-start gap-2.5">
        <TrafficLightDot light={health.light} label={health.label} className="mt-1" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{health.label}</div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {health.detail}
          </p>
        </div>
        {health.canRetry && (
          <Button
            size="sm"
            variant="outline"
            onClick={retry}
            disabled={retrying}
            className="shrink-0 gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${retrying ? "animate-spin" : ""}`} />
            {retrying ? "Läuft …" : "Erneut versuchen"}
          </Button>
        )}
      </div>

      {/* Nie freigegeben → hier hilft kein Retry, sondern die Freigabe. */}
      {health.needsApproval && !health.canRetry && (
        <div className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
          <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span className="leading-relaxed">
            Dieser Post wurde noch nicht freigegeben. Er geht erst raus, wenn du ihn
            unter{" "}
            <Link href="/social/freigaben" className="font-semibold underline">
              Freigaben
            </Link>{" "}
            freigibst — dort läuft auch der Qualitäts-TÜV.
          </span>
        </div>
      )}

      {/* Pro Kanal ein Block */}
      <div className="space-y-2">
        {health.platforms.map((p) => (
          <PlatformBlock key={p.platform} p={p} />
        ))}
      </div>
    </div>
  );
}

function PlatformBlock({ p }: { p: PlatformHealth }) {
  return (
    <div className="rounded-md border border-border p-2.5 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <TrafficLightDot light={p.light} label={p.label} />
        <span className="text-sm font-medium">{PLATFORM_LABEL[p.platform]}</span>
        <TrafficLightChip light={p.light} label={p.label} />
        {p.publicUrl && (
          <a
            href={p.publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:underline"
          >
            Beitrag ansehen
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">{p.detail}</p>

      {/* Der exakte Fehler — ungekürzt, markierbar, gut lesbar. */}
      {p.error && (
        <div className="rounded border border-red-200 bg-red-50 p-2 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-red-800">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {p.errorKind ?? "Fehler"}
          </div>
          <p className="text-xs text-red-900 whitespace-pre-wrap break-words font-mono leading-relaxed select-text">
            {p.error}
          </p>
          {p.advice && (
            <div className="flex items-start gap-1.5 text-[11px] text-red-800 pt-0.5 border-t border-red-200">
              <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span className="leading-relaxed">{p.advice}</span>
            </div>
          )}
        </div>
      )}

      {/* Technische Spur — klein, aber vollständig. */}
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
        {p.publishedAt && (
          <Row label="Veröffentlicht" value={formatDateTime(p.publishedAt)} />
        )}
        {p.lastAttemptAt && (
          <Row label="Letzter Versuch" value={formatDateTime(p.lastAttemptAt)} />
        )}
        {p.attempts > 0 && <Row label="Versuche" value={String(p.attempts)} />}
        {p.nextRetryAt && (
          <Row label="Nächster Versuch" value={formatDateTime(p.nextRetryAt)} />
        )}
        {p.externalId && <Row label="Vorgangs-Nr." value={p.externalId} />}
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="whitespace-nowrap">{label}:</dt>
      <dd className="font-medium text-foreground/80 break-all">{value}</dd>
    </>
  );
}
