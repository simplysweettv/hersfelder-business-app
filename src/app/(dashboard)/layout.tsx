import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

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
      <Sidebar user={user} pendingApprovals={pendingApprovals ?? 0} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar hasNotifications={(pendingApprovals ?? 0) > 0} />
        {children}
      </div>
    </div>
  );
}
