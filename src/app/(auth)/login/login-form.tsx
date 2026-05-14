"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Crosshair } from "lucide-react";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (error) {
      toast.error("Login fehlgeschlagen", { description: error.message });
      return;
    }
    router.push(nextPath);
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm border-border/60 shadow-lg">
      <CardContent className="p-8">
        <div className="flex flex-col items-center text-center mb-7">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
            style={{ background: "var(--brand-primary)" }}
          >
            <Crosshair className="w-7 h-7 text-white" />
          </div>
          <div className="font-semibold text-lg leading-tight">Hersfelder</div>
          <div className="text-xs text-muted-foreground tracking-wide">
            Business Suite
          </div>
        </div>

        <h1 className="text-xl font-semibold mb-1">Willkommen zurück</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Bitte melde dich mit deiner E-Mail an.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-Mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="andreas@hersfelder.de"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Passwort</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full"
            size="lg"
            style={{ background: "var(--brand-primary)", color: "white" }}
          >
            {loading ? "Anmelden…" : "Anmelden"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
