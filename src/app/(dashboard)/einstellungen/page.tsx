"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, Share2, Camera, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import CostSettingsCard from "@/components/settings/CostSettingsCard";
import PostingPlanCard from "@/components/settings/PostingPlanCard";

interface MetaStatus {
  page_name: string | null;
  page_id: string | null;
  instagram_id: string | null;
}

export default function EinstellungenPage() {
  const searchParams = useSearchParams();
  const [metaStatus, setMetaStatus] = useState<MetaStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const metaParam = searchParams.get("meta");
    if (metaParam === "connected") {
      toast.success("Facebook & Instagram erfolgreich verbunden! 🎉");
    } else if (metaParam === "error") {
      toast.error("Verbindung fehlgeschlagen. Bitte versuche es erneut.");
    } else if (metaParam === "no_pages") {
      toast.error("Keine Facebook-Seite gefunden. Stelle sicher, dass du als Admin einer Seite eingeloggt bist.");
    }
  }, [searchParams]);

  useEffect(() => {
    async function loadStatus() {
      const supabase = createClient();
      const { data } = await supabase
        .from("settings")
        .select("key, value")
        .in("key", ["facebook_page_name", "facebook_page_id", "instagram_account_id"]);

      const map: Record<string, string> = {};
      data?.forEach((row) => { map[row.key] = row.value; });

      setMetaStatus({
        page_name: map.facebook_page_name ?? null,
        page_id: map.facebook_page_id ?? null,
        instagram_id: map.instagram_account_id ?? null,
      });
      setLoading(false);
    }
    loadStatus();
  }, [searchParams]);

  const isConnected = !!metaStatus?.page_id;

  return (
    <div className="flex-1 p-3 md:p-5 bg-background">
      <h1 className="text-xl md:text-2xl font-semibold mb-1">Einstellungen</h1>
      <p className="text-sm text-muted-foreground mb-4 md:mb-6">
        Verbindungen und Konfiguration der Hersfelder Business Suite
      </p>

      {/* Meta / Social Media Verbindung */}
      <Card className="p-5 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <div className="flex items-center gap-1.5">
                <Share2 className="w-4 h-4 text-blue-600" />
                <Camera className="w-4 h-4 text-pink-500" />
              </div>
              <h2 className="font-medium">Facebook & Instagram</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Verbinde deine Facebook-Seite und dein Instagram-Business-Profil für automatisches Posten.
            </p>

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Lade Status…
              </div>
            ) : isConnected ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-green-700">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-medium">Verbunden</span>
                </div>
                {metaStatus?.page_name && (
                  <p className="text-sm text-muted-foreground pl-6">
                    Facebook-Seite: <span className="font-medium text-foreground">{metaStatus.page_name}</span>
                    <span className="ml-1 text-xs opacity-60">(ID: {metaStatus.page_id})</span>
                  </p>
                )}
                {metaStatus?.instagram_id && (
                  <p className="text-sm text-muted-foreground pl-6">
                    Instagram-Konto: <span className="font-medium text-foreground">verknüpft</span>
                    <span className="ml-1 text-xs opacity-60">(ID: {metaStatus.instagram_id})</span>
                  </p>
                )}
                {!metaStatus?.instagram_id && (
                  <div className="flex items-center gap-2 text-sm text-amber-600 pl-6">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Instagram noch nicht verknüpft — stelle sicher, dass dein IG-Konto als Business-Profil mit der Facebook-Seite verbunden ist.
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                Noch nicht verbunden — Posts werden nicht automatisch veröffentlicht.
              </div>
            )}
          </div>

          <div className="shrink-0">
            <a
              href="/api/auth/meta"
              className={`inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                isConnected
                  ? "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                  : "text-white hover:opacity-90"
              }`}
              style={!isConnected ? { background: "var(--brand-primary)" } : undefined}
            >
              {isConnected ? "Neu verbinden" : "Facebook verbinden"}
            </a>
          </div>
        </div>
      </Card>

      {/* Posting-Plan (Frequenz) */}
      <div className="mb-4">
        <PostingPlanCard />
      </div>

      {/* Kosten & Abrechnung */}
      <div className="mb-4">
        <CostSettingsCard />
      </div>

      {/* Hinweis */}
      {!isConnected && !loading && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>Hinweis:</strong> Ohne Verbindung werden generierte Posts gespeichert und können freigegeben werden, aber nicht automatisch veröffentlicht. Du kannst sie später manuell posten.
        </div>
      )}
    </div>
  );
}
