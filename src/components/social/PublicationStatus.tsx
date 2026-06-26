import { PLATFORM_LABEL, type Platform } from "@/types";
import { CheckCircle2, Clock, XCircle, MinusCircle, ExternalLink } from "lucide-react";

export type PublicationRow = {
  platform: string;
  status: string;
  public_url: string | null;
  external_id: string | null;
  error: string | null;
};

/**
 * Zeigt pro Plattform den echten Veröffentlichungs-Status:
 * Live ✅ (mit Link) · Eingeplant ⏳ · Fehler ❌ · nicht verbunden ·
 * (noch nicht übergeben).
 */
export function PublicationStatus({
  platforms,
  publications,
}: {
  platforms: Platform[];
  publications: PublicationRow[];
}) {
  const byPlatform = new Map(publications.map((p) => [p.platform, p]));

  return (
    <div className="flex flex-wrap gap-1.5">
      {platforms.map((p) => {
        const row = byPlatform.get(p);
        const label = PLATFORM_LABEL[p];

        // Kein Eintrag → noch nicht an Blotato übergeben (wartet auf Freigabe).
        if (!row) {
          return (
            <Pill key={p} className="bg-zinc-100 text-zinc-500">
              <Clock className="w-3 h-3" />
              {label}: offen
            </Pill>
          );
        }

        if (row.public_url) {
          return (
            <a key={p} href={row.public_url} target="_blank" rel="noopener noreferrer">
              <Pill className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200">
                <CheckCircle2 className="w-3 h-3" />
                {label}: live
                <ExternalLink className="w-2.5 h-2.5" />
              </Pill>
            </a>
          );
        }

        if (row.status === "failed") {
          return (
            <Pill key={p} className="bg-red-100 text-red-800" title={row.error ?? undefined}>
              <XCircle className="w-3 h-3" />
              {label}: Fehler
            </Pill>
          );
        }

        if (row.status === "skipped") {
          return (
            <Pill key={p} className="bg-zinc-100 text-zinc-500" title="Konto nicht in Blotato verbunden">
              <MinusCircle className="w-3 h-3" />
              {label}: nicht verbunden
            </Pill>
          );
        }

        // success (übergeben, noch nicht live bestätigt) oder pending
        return (
          <Pill key={p} className="bg-blue-100 text-blue-800">
            <Clock className="w-3 h-3" />
            {label}: eingeplant
          </Pill>
        );
      })}
    </div>
  );
}

function Pill({
  children,
  className = "",
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors ${className}`}
    >
      {children}
    </span>
  );
}
