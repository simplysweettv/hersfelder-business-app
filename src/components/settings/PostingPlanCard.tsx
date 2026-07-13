"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { CalendarClock, Loader2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  parsePostingPlan,
  PLAN_PRESETS,
  PLAN_MODE_LABEL,
  type PostingPlanMode,
} from "@/lib/posting-plan";

const WEEKDAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MODES: Exclude<PostingPlanMode, "individuell">[] = ["ruhig", "normal", "aktiv"];

export default function PostingPlanCard() {
  const [mode, setMode] = useState<PostingPlanMode>("aktiv");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<PostingPlanMode | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "posting_plan")
        .maybeSingle();
      setMode(parsePostingPlan(data?.value ?? null).mode);
      setLoading(false);
    })();
  }, []);

  async function save(next: Exclude<PostingPlanMode, "individuell">) {
    setSaving(next);
    const plan = { mode: next, slots: PLAN_PRESETS[next] };
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "posting_plan", value: JSON.stringify(plan) }),
    });
    setSaving(null);
    if (!res.ok) {
      toast.error("Speichern fehlgeschlagen");
      return;
    }
    setMode(next);
    toast.success("Posting-Plan gespeichert ✓", {
      description: `Ab dem nächsten Lauf: ${PLAN_MODE_LABEL[next]}`,
    });
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-1">
        <CalendarClock className="w-4 h-4" style={{ color: "var(--brand-primary)" }} />
        <h2 className="font-medium">Posting-Plan</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Wie oft soll die Content-Maschine posten? Die Wochentage &amp; Uhrzeiten
        passen sich automatisch an.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Lade…
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-3">
          {MODES.map((m) => {
            const active = mode === m;
            const slots = PLAN_PRESETS[m];
            return (
              <button
                key={m}
                onClick={() => save(m)}
                disabled={saving !== null}
                className={`text-left rounded-lg border p-3 min-h-[92px] transition-colors ${
                  active
                    ? "border-transparent ring-2"
                    : "border-border hover:border-foreground/30"
                }`}
                style={active ? { borderColor: "var(--brand-primary)", boxShadow: "0 0 0 2px var(--brand-primary)" } : undefined}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{PLAN_MODE_LABEL[m]}</span>
                  {active && <Check className="w-4 h-4" style={{ color: "var(--brand-primary)" }} />}
                  {saving === m && <Loader2 className="w-4 h-4 animate-spin" />}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {slots.map((s, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                    >
                      {WEEKDAY_SHORT[s.weekday]} {String(s.hour).padStart(2, "0")}:
                      {String(s.minute).padStart(2, "0")}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
