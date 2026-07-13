"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  CheckSquare,
  Calendar,
  BarChart3,
  MessageCircle,
  Wallet,
  Sparkles,
  Settings,
  MoreHorizontal,
  LogOut,
  X,
} from "lucide-react";

// Fünf gleichwertige Haupt-Tabs + "Mehr" (Review: sechs waren zu viel).
const MAIN_ITEMS = [
  { label: "Leitstand", href: "/dashboard", icon: LayoutDashboard },
  { label: "Freigaben", href: "/social/freigaben", icon: CheckSquare },
  { label: "Kommentare", href: "/social/kommentare", icon: MessageCircle },
  { label: "Kalender", href: "/social/kalender", icon: Calendar },
];

// Unter "Mehr" — inkl. des vorher mobil fehlenden Wegs zu den Einstellungen.
const MORE_ITEMS = [
  { label: "Analytics", href: "/social/analytics", icon: BarChart3 },
  { label: "Kosten", href: "/kosten", icon: Wallet },
  { label: "Generator", href: "/social/generator", icon: Sparkles },
  { label: "Einstellungen", href: "/einstellungen", icon: Settings },
];

export function MobileNav({
  pendingApprovals = 0,
  unansweredComments = 0,
}: {
  pendingApprovals?: number;
  unansweredComments?: number;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const moreActive = MORE_ITEMS.some(
    (i) => pathname === i.href || pathname.startsWith(i.href + "/"),
  );

  return (
    <>
      {/* "Mehr"-Overlay */}
      {moreOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/40"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-4 pb-8 space-y-1"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-sm">Mehr</span>
              <button
                aria-label="Schließen"
                onClick={() => setMoreOpen(false)}
                className="w-11 h-11 -mr-2 flex items-center justify-center text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {MORE_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 min-h-[48px] px-2 rounded-lg hover:bg-muted transition-colors"
              >
                <item.icon className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            ))}
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="w-full flex items-center gap-3 min-h-[48px] px-2 rounded-lg hover:bg-muted transition-colors text-left"
              >
                <LogOut className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm font-medium">Abmelden</span>
              </button>
            </form>
          </div>
        </div>
      )}

      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-white flex items-stretch"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {MAIN_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const hasBadge =
            (item.href === "/social/freigaben" && pendingApprovals > 0) ||
            (item.href === "/social/kommentare" && unansweredComments > 0);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] relative transition-colors",
                active ? "text-foreground" : "text-muted-foreground",
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
                  style={{ background: "#0f172a" }}
                />
              )}
            </Link>
          );
        })}
        <button
          onClick={() => setMoreOpen(true)}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] transition-colors",
            moreActive ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <MoreHorizontal className="w-5 h-5" />
          <span className="text-[10px] leading-none font-medium">Mehr</span>
        </button>
      </nav>
    </>
  );
}
