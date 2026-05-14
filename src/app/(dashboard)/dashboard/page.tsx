import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Clock, Send, Calendar } from "lucide-react";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ count: pending }, { count: scheduled }, { count: published }] =
    await Promise.all([
      supabase
        .from("posts")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("posts")
        .select("id", { count: "exact", head: true })
        .eq("status", "scheduled"),
      supabase
        .from("posts")
        .select("id", { count: "exact", head: true })
        .eq("status", "published"),
    ]);

  const stats = [
    { label: "Offene Freigaben", value: pending ?? 0, icon: Clock },
    { label: "Geplant", value: scheduled ?? 0, icon: Calendar },
    { label: "Veröffentlicht", value: published ?? 0, icon: CheckCircle2 },
    { label: "Heute aktiv", value: 0, icon: Send },
  ];

  return (
    <div className="flex-1 p-5 bg-background">
      <h1 className="text-2xl font-semibold mb-1">Dashboard</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Überblick über deine Hersfelder Business Suite
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {s.label}
              </div>
              <s.icon
                className="w-4 h-4"
                style={{ color: "var(--brand-primary)" }}
              />
            </div>
            <div className="text-3xl font-semibold">{s.value}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
