"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Megaphone,
  ShoppingBag,
  BarChart3,
  Mail,
  Settings,
  Calendar,
  CheckSquare,
  Sparkles,
} from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  children?: { label: string; href: string; icon: React.ComponentType<{ className?: string }> }[];
};

const TOP_ITEMS: NavItem[] = [
  { label: "Leitstand", href: "/dashboard", icon: LayoutDashboard },
  {
    label: "Social Media",
    href: "/social",
    icon: Megaphone,
    children: [
      { label: "Freigaben", href: "/social/freigaben", icon: CheckSquare },
      { label: "Kalender", href: "/social/kalender", icon: Calendar },
      { label: "Analytics", href: "/social/analytics", icon: BarChart3 },
      { label: "Generator", href: "/social/generator", icon: Sparkles },
    ],
  },
  { label: "Shop Manager", href: "#", icon: ShoppingBag, disabled: true },
  { label: "Newsletter", href: "#", icon: Mail, disabled: true },
];

export function Sidebar({
  user,
  pendingApprovals = 0,
}: {
  user?: { email?: string | null };
  pendingApprovals?: number;
}) {
  const pathname = usePathname();

  return (
    <aside
      className="w-[220px] shrink-0 flex flex-col text-white"
      style={{ background: "var(--brand-sidebar)" }}
    >
      <div className="px-4 pt-4 pb-4 border-b border-white/10">
        <div className="bg-white rounded-xl px-3 py-2.5 inline-flex items-center gap-2.5">
          <Image
            src="/logo-hersfelder.png"
            alt="Hersfelder"
            width={140}
            height={184}
            className="h-9 w-auto"
          />
          <div className="leading-tight">
            <div className="text-[11px] font-bold text-[#0f3d1a] tracking-wide">Business</div>
            <div className="text-[11px] font-bold text-[#0f3d1a] tracking-wide">Suite</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
        {TOP_ITEMS.map((item) => {
          const active =
            !item.disabled &&
            (pathname === item.href || pathname.startsWith(item.href + "/"));
          const showDot = item.label === "Social Media" && pendingApprovals > 0;

          return (
            <div key={item.label}>
              {item.disabled ? (
                <div
                  className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-white/40 cursor-not-allowed select-none"
                  title="Bald verfügbar"
                >
                  <item.icon className="w-4 h-4" />
                  <span className="flex-1">{item.label}</span>
                  <span className="text-[10px] uppercase tracking-wide bg-white/10 px-1.5 py-0.5 rounded">
                    bald
                  </span>
                </div>
              ) : (
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                    active
                      ? "bg-white/15 text-white"
                      : "text-white/85 hover:bg-white/10",
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  <span className="flex-1">{item.label}</span>
                  {showDot && (
                    <span className="w-2 h-2 rounded-full bg-yellow-400" />
                  )}
                </Link>
              )}

              {item.children && active && (
                <div className="mt-1 ml-3 pl-3 border-l border-white/15 space-y-0.5">
                  {item.children.map((sub) => {
                    const subActive = pathname === sub.href;
                    return (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        className={cn(
                          "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] transition-colors",
                          subActive
                            ? "bg-white/10 text-white"
                            : "text-white/70 hover:bg-white/5",
                        )}
                      >
                        <sub.icon className="w-3.5 h-3.5" />
                        {sub.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="px-2 py-3 border-t border-white/10 space-y-0.5">
        <Link
          href="/einstellungen"
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
            pathname.startsWith("/einstellungen")
              ? "bg-white/15 text-white"
              : "text-white/85 hover:bg-white/10",
          )}
        >
          <Settings className="w-4 h-4" />
          Einstellungen
        </Link>
        <form action="/auth/signout" method="post">
          <div className="flex items-center gap-3 px-3 py-2 mt-1">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold"
              style={{ background: "var(--brand-primary)" }}
            >
              {(user?.email?.[0] ?? "A").toUpperCase()}
            </div>
            <button
              type="submit"
              className="text-left leading-tight flex-1 text-white/90 hover:text-white"
              title="Abmelden"
            >
              <div className="text-sm font-medium">Andreas</div>
              <div className="text-[11px] text-white/55">Admin · abmelden</div>
            </button>
          </div>
        </form>
      </div>
    </aside>
  );
}
