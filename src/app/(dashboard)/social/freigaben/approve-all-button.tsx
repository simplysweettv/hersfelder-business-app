"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

type ApproveAllResult = {
  ok: boolean;
  approved: number;
  scheduled: number;
  platformsOk?: number;
  platformsTotal?: number;
  skipped?: { title: string; reason: string }[];
  failed?: { title: string; error: string }[];
};

export function ApproveAllButton({
  disabled,
  count,
}: {
  disabled: boolean;
  count: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      size="sm"
      disabled={disabled || pending}
      className="min-h-[40px]"
      onClick={() =>
        start(async () => {
          const res = await fetch("/api/posts/approve-all", { method: "POST" });
          const data = (await res.json().catch(() => ({}))) as ApproveAllResult;
          if (!res.ok) {
            toast.error("Freigabe fehlgeschlagen");
            return;
          }

          // Ehrliche Zusammenfassung — erst danach "alles freigegeben".
          const parts: string[] = [];
          if (data.scheduled)
            parts.push(`${data.scheduled} vollständig eingeplant`);
          if (data.platformsTotal)
            parts.push(
              `${data.platformsOk}/${data.platformsTotal} Plattform-Übergaben ok`,
            );
          if (data.failed?.length)
            parts.push(`${data.failed.length} mit Fehlern`);
          if (data.skipped?.length)
            parts.push(`${data.skipped.length} übersprungen (Prüfung nötig)`);

          const description = parts.join(" · ") || undefined;

          if (data.failed?.length || data.skipped?.length) {
            toast.warning(`${data.approved} freigegeben`, { description });
          } else if (data.approved > 0) {
            toast.success("Alle Posts freigegeben ✓", { description });
          } else {
            toast.info("Nichts freizugeben", {
              description: data.skipped?.length
                ? "Alle offenen Posts brauchen erst eine Prüfung/Bearbeitung."
                : undefined,
            });
          }
          router.refresh();
        })
      }
      style={{ background: "var(--brand-primary)", color: "white" }}
    >
      {pending ? "…" : `Alle freigeben (${count})`}
    </Button>
  );
}
