import { Loader2 } from "lucide-react";

/**
 * Ladeanzeige fürs Dashboard. Alle Seiten sind force-dynamic und einige rufen
 * dabei externe Dienste (Blotato) auf — ohne diese Datei blieb beim Wechsel
 * einfach die alte Seite stehen, als sei der Klick ins Leere gegangen.
 */
export default function DashboardLoading() {
  return (
    <div className="flex-1 flex items-center justify-center p-10 bg-background">
      <div className="flex flex-row items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Wird geladen …
      </div>
    </div>
  );
}
