import { createAdminClient } from "@/lib/supabase/admin";

export type AppSettings = Record<string, string | null>;

/**
 * Lädt alle Settings mit dem Service-Role-Client (nur server-seitig nutzen —
 * niemals aus Client-Komponenten importieren).
 *
 * Bewusst admin statt Session-Client: Cron-Läufe haben keine Session, und die
 * settings-RLS erlaubt Client-Sessions nur noch eine Lese-Whitelist ohne
 * Secrets. Alle Aufrufer sind auth-geschützte Server-Routen oder Crons.
 */
export async function loadSettings(): Promise<AppSettings> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("settings").select("key,value");
  const map: AppSettings = {};
  for (const row of data ?? []) map[row.key] = row.value;
  return map;
}

export function getEnvOrSetting(
  envKey: string,
  settings: AppSettings,
  settingKey?: string,
): string | undefined {
  return process.env[envKey] || settings[settingKey ?? envKey.toLowerCase()] || undefined;
}
