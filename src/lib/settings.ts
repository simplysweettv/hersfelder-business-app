import { createClient } from "@/lib/supabase/server";

export type AppSettings = Record<string, string | null>;

export async function loadSettings(): Promise<AppSettings> {
  const supabase = await createClient();
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
