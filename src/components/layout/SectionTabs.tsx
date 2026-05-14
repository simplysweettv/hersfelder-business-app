"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type Tab = { label: string; href: string };

export function SectionTabs({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();

  if (!tabs.length) return null;

  return (
    <div className="h-11 bg-white border-b border-border px-5 flex items-end gap-1 shrink-0">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-3 py-2 text-sm transition-colors border-b-2 -mb-px",
              active
                ? "border-[color:var(--brand-primary)] text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
