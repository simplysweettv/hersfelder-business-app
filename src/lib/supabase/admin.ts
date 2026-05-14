import { createClient } from "@supabase/supabase-js";

// Service role client — bypasses RLS, only use in server-side cron/admin routes
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY ist nicht gesetzt.");
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}
