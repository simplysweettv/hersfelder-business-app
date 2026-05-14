import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { MobileNav } from "@/components/layout/MobileNav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { count: pendingApprovals } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return (
    <div className="min-h-screen flex bg-muted/30">
      {/* Sidebar — nur auf Desktop sichtbar */}
      <div className="hidden md:flex">
        <Sidebar user={user} pendingApprovals={pendingApprovals ?? 0} />
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar hasNotifications={(pendingApprovals ?? 0) > 0} />
        {/* Extra padding-bottom auf Mobile für die Bottom-Nav */}
        <div className="flex-1 flex flex-col pb-[56px] md:pb-0">
          {children}
        </div>
      </div>
      {/* Mobile Bottom Navigation */}
      <MobileNav pendingApprovals={pendingApprovals ?? 0} />
    </div>
  );
}
