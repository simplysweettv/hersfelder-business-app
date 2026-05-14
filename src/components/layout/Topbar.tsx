"use client";

import { usePathname } from "next/navigation";
import { Bell, ChevronRight, Crosshair } from "lucide-react";

const SECTION_LABEL: Record<string, string> = {
  dashboard: "Dashboard",
  social: "Social Media",
  wochenplan: "Wochenplan",
  freigaben: "Freigaben",
  generator: "Generator",
  kalender: "Kalender",
  einstellungen: "Einstellungen",
};

export function Topbar({ hasNotifications = false }: { hasNotifications?: boolean }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const currentLabel = SECTION_LABEL[segments[segments.length - 1]] ?? "Hersfelder";

  return (
    <div className="h-12 bg-white border-b border-border flex items-center justify-between px-4 md:px-5 shrink-0">
      {/* Mobile: Logo + Seitenname */}
      <div className="flex items-center gap-2 md:hidden">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0"
          style={{ background: "var(--brand-primary)" }}
        >
          <Crosshair className="w-3.5 h-3.5" />
        </div>
        <span className="font-semibold text-sm">{currentLabel}</span>
      </div>

      {/* Desktop: Breadcrumb */}
      <nav className="hidden md:flex items-center gap-1.5 text-sm text-muted-foreground">
        {segments.map((seg, i) => {
          const label = SECTION_LABEL[seg] ?? seg;
          const isLast = i === segments.length - 1;
          return (
            <span key={seg} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="w-3.5 h-3.5 opacity-50" />}
              <span className={isLast ? "text-foreground font-medium" : "text-muted-foreground"}>
                {label}
              </span>
            </span>
          );
        })}
      </nav>

      <div className="flex items-center gap-3 md:gap-4">
        <button
          aria-label="Benachrichtigungen"
          className="relative text-muted-foreground hover:text-foreground transition-colors"
        >
          <Bell className="w-[18px] h-[18px]" />
          {hasNotifications && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" />
          )}
        </button>
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold"
          style={{ background: "var(--brand-primary)" }}
        >
          A
        </div>
      </div>
    </div>
  );
}
