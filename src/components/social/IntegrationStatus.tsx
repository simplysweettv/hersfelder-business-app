import Link from "next/link";
import { CheckCircle2, AlertTriangle, XCircle, Settings } from "lucide-react";

/**
 * Klare Verbindungs-Statusleiste für die Analytics-Seite.
 * Erklärt, WARUM ggf. keine Zahlen da sind und was zu tun ist — statt
 * einfach leerer Karten. Drei Quellen:
 *  - Instagram-Insights (über Blotato)
 *  - Facebook-Insights (über Blotato)
 *  - Kommentare/Meta (eigene Facebook-Verbindung in den Einstellungen)
 */

type State = "ok" | "warn" | "off";

function Row({
  state,
  title,
  detail,
  action,
}: {
  state: State;
  title: string;
  detail: string;
  action?: { href: string; label: string };
}) {
  const Icon = state === "ok" ? CheckCircle2 : state === "warn" ? AlertTriangle : XCircle;
  const color =
    state === "ok"
      ? "text-emerald-600"
      : state === "warn"
        ? "text-amber-600"
        : "text-rose-600";
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${color}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
      </div>
      {action && (
        <Link
          href={action.href}
          className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md border border-border hover:bg-muted transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function IntegrationStatus({
  instagram,
  facebook,
  metaConnected,
  lastSnapshot,
  publishedCount,
}: {
  instagram: State;
  facebook: State;
  metaConnected: boolean;
  lastSnapshot: string | null;
  publishedCount: number;
}) {
  // Wenn alles läuft und genug Daten da sind: dezente „alles verbunden"-Zeile.
  const allGood = instagram === "ok" && facebook === "ok" && metaConnected;

  return (
    <div className="rounded-xl border border-border bg-card p-4 mb-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold">Verbindungen &amp; Datenquellen</h2>
        {lastSnapshot && (
          <span className="text-[11px] text-muted-foreground">
            Zahlen zuletzt aktualisiert: {lastSnapshot}
          </span>
        )}
      </div>

      <div className="divide-y divide-border">
        <Row
          state={instagram}
          title="Instagram-Insights"
          detail={
            instagram === "ok"
              ? "Likes & Reichweite werden über Blotato erfasst."
              : "Aktuell keine Instagram-Zahlen von Blotato."
          }
        />
        <Row
          state={facebook}
          title="Facebook-Insights"
          detail={
            facebook === "ok"
              ? "Likes & Reichweite werden über Blotato erfasst."
              : "Blotato liefert für Facebook keine Werte (0 Likes/Reichweite). Facebook-Seite in Blotato mit Insights-Berechtigung (pages_read_engagement) neu verbinden."
          }
        />
        <Row
          state={metaConnected ? "ok" : "off"}
          title="Kommentare (Facebook & Instagram)"
          detail={
            metaConnected
              ? "Meta ist verbunden — Kommentare werden synchronisiert."
              : "Nicht verbunden. Ohne Meta-Verbindung werden keine Kommentare geladen und keine Antworten möglich."
          }
          action={metaConnected ? undefined : { href: "/einstellungen", label: "Facebook verbinden" }}
        />
      </div>

      {publishedCount < 8 && (
        <p className="text-[11px] text-muted-foreground mt-3 border-t border-border pt-3">
          Hinweis: Erst {publishedCount} von 8 Posts veröffentlicht — die
          Lern-Auswertung (beste Säule/Zeit) greift ab 8 veröffentlichten Posts.
        </p>
      )}
      {allGood && publishedCount >= 8 && (
        <p className="text-[11px] text-emerald-600 mt-3 border-t border-border pt-3">
          Alle Datenquellen verbunden.
        </p>
      )}
    </div>
  );
}
