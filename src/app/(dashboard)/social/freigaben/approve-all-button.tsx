"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

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
      onClick={() =>
        start(async () => {
          const res = await fetch("/api/posts/approve-all", { method: "POST" });
          if (!res.ok) {
            toast.error("Freigabe fehlgeschlagen");
            return;
          }
          toast.success("Alle Posts freigegeben");
          router.refresh();
        })
      }
      style={{ background: "var(--brand-primary)", color: "white" }}
    >
      {pending ? "…" : `Alle freigeben (${count})`}
    </Button>
  );
}
