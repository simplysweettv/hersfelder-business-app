"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Wallet, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export default function CostSettingsCard() {
  const [blotato, setBlotato] = useState("");
  const [rate, setRate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("settings")
        .select("key, value")
        .in("key", ["blotato_monthly_eur", "usd_eur_rate"]);
      const map: Record<string, string> = {};
      data?.forEach((row) => {
        map[row.key] = row.value ?? "";
      });
      setBlotato(map["blotato_monthly_eur"] ?? "");
      setRate(map["usd_eur_rate"] ?? "");
      setLoading(false);
    }
    load();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const entries = [
        { key: "blotato_monthly_eur", value: blotato },
        { key: "usd_eur_rate", value: rate },
      ];
      for (const e of entries) {
        const res = await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(e),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? "Speichern fehlgeschlagen");
        }
      }
      toast.success("Kosten-Einstellungen gespeichert ✓");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-1">
        <Wallet className="w-4 h-4" style={{ color: "var(--brand-primary)" }} />
        <h2 className="font-medium">Kosten &amp; Abrechnung</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Grundlage für die <strong>Kosten</strong>-Übersicht. Die KI-Kosten (Bild &amp; Text)
        werden automatisch aus der OpenAI-Nutzung berechnet — diese beiden Werte ergänzen das.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Lade Werte…
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Blotato-Abo pro Monat (€)</label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="z. B. 39"
                value={blotato}
                onChange={(e) => setBlotato(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Fixer Monatsbeitrag. Blotato liefert keine Kosten über die API — daher manuell.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Wechselkurs 1&nbsp;$ → €</label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0,92"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                OpenAI rechnet in US-Dollar ab. Standard: 0,92. Leer = 0,92.
              </p>
            </div>
          </div>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Speichern
          </Button>
        </div>
      )}
    </Card>
  );
}
