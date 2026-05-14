"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bot } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

export function AIBanner({
  weekNumber,
  pendingCount,
  totalForWeek,
}: {
  weekNumber: number;
  pendingCount: number;
  totalForWeek: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function approveAll() {
    start(async () => {
      const res = await fetch("/api/posts/approve-all", { method: "POST" });
      if (!res.ok) {
        toast.error("Freigabe fehlgeschlagen");
        return;
      }
      toast.success("Alle Posts freigegeben");
      router.refresh();
    });
  }

  return (
    <Card className="p-4 flex items-start gap-4 border-l-4" style={{ borderLeftColor: "var(--brand-primary)" }}>
      <div
        className="w-11 h-11 rounded-lg flex items-center justify-center text-white shrink-0"
        style={{ background: "var(--brand-primary)" }}
      >
        <Bot className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">
          {totalForWeek > 0
            ? `KI hat deinen Wochenplan erstellt — ${totalForWeek} Posts für KW ${weekNumber} bereit`
            : `Noch keine Posts für KW ${weekNumber}`}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {totalForWeek > 0
            ? "Automatisch generiert für IG · FB · TT · LI"
            : "Lass die KI eine Woche planen oder erstelle Posts manuell im Generator."}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/social/freigaben")}
        >
          Einzeln prüfen
        </Button>
        <Button
          size="sm"
          disabled={pending || pendingCount === 0}
          onClick={approveAll}
          style={{ background: "var(--brand-primary)", color: "white" }}
        >
          {pending ? "…" : `Alle freigeben (${pendingCount})`}
        </Button>
      </div>
    </Card>
  );
}
