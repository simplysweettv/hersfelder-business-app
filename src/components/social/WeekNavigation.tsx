"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WeekNavigation({
  week,
  year,
}: {
  week: number;
  year: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentOffset = Number(searchParams.get("offset") ?? "0");

  function navigate(delta: number) {
    const next = currentOffset + delta;
    const params = new URLSearchParams(searchParams.toString());
    if (next === 0) {
      params.delete("offset");
    } else {
      params.set("offset", String(next));
    }
    const query = params.toString();
    router.push(query ? `?${query}` : "?");
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm font-semibold tabular-nums">
        KW&nbsp;{week}&nbsp;/&nbsp;{year}
      </span>
      <Button variant="outline" size="icon" onClick={() => navigate(1)}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
