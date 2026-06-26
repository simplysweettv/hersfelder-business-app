"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, CheckSquare, Sparkles, Calendar, BarChart3 } from "lucide-react";

const NAV_ITEMS = [
  { label: "Leitstand", href: "/dashboard", icon: LayoutDashboard },
  { label: "Freigaben", href: "/social/freigaben", icon: CheckSquare },
  { label: "Kalender", href: "/social/kalender", icon: Calendar },
  { label: "Analytics", href: "/social/analytics", icon: BarChart3 },
  { label: "Generator", href: "/social/generator", icon: Sparkles },
];

export function MobileNav({ pendingApprovals = 0 }: { pendingApprovals?: number }) {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-white flex items-stretch"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const hasBadge = item.href === "/social/freigaben" && pendingApprovals > 0;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] relative transition-colors",
              active ? "text-foreground" : "text-muted-foreground"
            )}
          >
            <div className="relative">
              <item.icon className="w-5 h-5" />
              {hasBadge && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 ring-1 ring-white" />
              )}
            </div>
            <span className="text-[10px] leading-none font-medium">{item.label}</span>
            {active && (
              <span
                className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full"
                style={{ background: "var(--brand-primary)" }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
