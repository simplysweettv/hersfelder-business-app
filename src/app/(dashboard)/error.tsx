"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertTriangle, RefreshCw, LayoutDashboard } from "lucide-react";

/**
 * Auffangnetz für unerwartete Server-Fehler im Dashboard. Ohne diese Datei
 * zeigt Next.js die nackte Seite "Application error: a server-side exception
 * has occurred" — weiß, ohne Navigation und ohne Weg zurück.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard-Fehler:", error);
  }, [error]);

  return (
    <div className="flex-1 p-4 md:p-8 bg-background">
      <Card className="max-w-lg mx-auto p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h1 className="font-semibold">Da ist etwas schiefgegangen</h1>
            <p className="text-sm text-muted-foreground">
              Die Seite konnte nicht geladen werden.
            </p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          Deine Daten sind nicht betroffen — es ist nur die Anzeige gescheitert.
          Versuch es noch einmal; wenn es bleibt, hilft der Fehlercode unten bei
          der Suche.
        </p>

        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono bg-muted rounded px-2 py-1 select-text">
            Fehlercode: {error.digest}
          </p>
        )}

        <div className="flex flex-row gap-2 flex-wrap">
          <Button onClick={reset} className="gap-1.5">
            <RefreshCw className="w-4 h-4" />
            Nochmal versuchen
          </Button>
          <Link href="/dashboard">
            <Button variant="outline" className="gap-1.5">
              <LayoutDashboard className="w-4 h-4" />
              Zum Leitstand
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
