import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Automatisierungs-Protokoll (automation_runs) + echte Systemampel.
 *
 * Jeder Cron-/Sync-Lauf schreibt eine Zeile: was geplant war, was gelang,
 * was fehlschlug. Der Leitstand leitet daraus einen BELEGTEN Systemzustand
 * ab — "Content-Maschine läuft" ist damit eine Aussage mit Beweis.
 */

export type RunType = "content_generation" | "publication" | "comment_sync";
export type RunStatus = "running" | "ok" | "partial" | "error";

export const RUN_TYPE_LABEL: Record<RunType, string> = {
  content_generation: "Content-Generierung",
  publication: "Veröffentlichung",
  comment_sync: "Kommentar-Abgleich",
};

export async function startRun(
  supabase: AdminClient,
  runType: RunType,
  trigger: "cron" | "manual" = "cron",
): Promise<string | null> {
  const { data } = await supabase
    .from("automation_runs")
    .insert({ run_type: runType, trigger, status: "running" })
    .select("id")
    .single();
  return data?.id ?? null;
}

export async function finishRun(
  supabase: AdminClient,
  runId: string | null,
  result: {
    planned: number;
    succeeded: number;
    failed: number;
    errors?: string[];
    postIds?: string[];
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  if (!runId) return;
  const status: RunStatus =
    result.failed === 0 ? "ok" : result.succeeded > 0 ? "partial" : "error";
  await supabase
    .from("automation_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      planned: result.planned,
      succeeded: result.succeeded,
      failed: result.failed,
      errors: result.errors?.length ? result.errors.slice(0, 20) : null,
      post_ids: result.postIds?.length ? result.postIds : null,
      meta: result.meta ?? null,
    })
    .eq("id", runId);
}

// ── Systemampel ──────────────────────────────────────────────────────────────

export type HealthLevel = "ok" | "warn" | "error";

export type HealthTask = {
  level: "warn" | "error";
  text: string;
  href: string;
};

export type RunSummary = {
  run_type: RunType;
  status: RunStatus;
  started_at: string;
  finished_at: string | null;
  planned: number;
  succeeded: number;
  failed: number;
  errors: string[] | null;
};

export type SystemHealth = {
  level: HealthLevel;
  /** Kurzer Satz für die Ampel-Zeile. */
  headline: string;
  tasks: HealthTask[];
  lastRuns: RunSummary[];
  bufferDays3: number; // geplante Posts in den nächsten 3 Tagen
  overdueCount: number;
  failedPublications: number;
  pendingCount: number;
};

/**
 * Belegter Systemzustand aus automation_runs + Post-Lage.
 * Grün nur, wenn die letzten Läufe ok sind, nichts überfällig/fehlgeschlagen
 * ist und Content im Puffer liegt.
 */
export async function getSystemHealth(supabase: AdminClient): Promise<SystemHealth> {
  const now = new Date();
  const nowIso = now.toISOString();
  const in3d = new Date(now.getTime() + 3 * 86_400_000).toISOString();
  const ago2h = new Date(now.getTime() - 2 * 3_600_000).toISOString();
  const ago48h = new Date(now.getTime() - 48 * 3_600_000).toISOString();
  const ago7d = new Date(now.getTime() - 7 * 86_400_000).toISOString();

  const [
    { data: runsRaw },
    { count: buffer3 },
    { data: overdueRaw },
    { count: failedPubs },
    { count: pendingCount },
    { count: pendingOld },
    { count: approvedNoDate },
  ] = await Promise.all([
    supabase
      .from("automation_runs")
      .select("run_type,status,started_at,finished_at,planned,succeeded,failed,errors")
      .order("started_at", { ascending: false })
      .limit(30),
    supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "approved", "scheduled"])
      .gte("scheduled_at", nowIso)
      .lte("scheduled_at", in3d),
    supabase
      .from("posts")
      .select("id,status,scheduled_at")
      .in("status", ["scheduled", "approved", "pending"])
      .not("scheduled_at", "is", null)
      .lt("scheduled_at", ago2h)
      .limit(20),
    supabase
      .from("post_publications")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("updated_at", ago7d),
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .lt("created_at", ago48h),
    supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .is("scheduled_at", null),
  ]);

  // Jüngster Lauf pro Typ.
  const lastRuns: RunSummary[] = [];
  const seen = new Set<string>();
  for (const r of (runsRaw ?? []) as RunSummary[]) {
    if (seen.has(r.run_type)) continue;
    seen.add(r.run_type);
    lastRuns.push(r);
  }

  const overdue = overdueRaw ?? [];
  // pending mit vergangenem Termin = verpasste Freigabe (gelb),
  // scheduled/approved mit vergangenem Termin = Veröffentlichung hängt (rot).
  const overduePending = overdue.filter((p) => p.status === "pending").length;
  const overdueHard = overdue.length - overduePending;

  const tasks: HealthTask[] = [];
  let level: HealthLevel = "ok";
  const raise = (l: HealthLevel) => {
    if (l === "error" || (l === "warn" && level === "ok")) level = l;
  };

  const genRun = lastRuns.find((r) => r.run_type === "content_generation");
  const pubRun = lastRuns.find((r) => r.run_type === "publication");
  const commentRun = lastRuns.find((r) => r.run_type === "comment_sync");

  if ((pendingCount ?? 0) > 0) {
    tasks.push({
      level: "warn",
      text: `${pendingCount} Post${pendingCount === 1 ? " wartet" : "s warten"} auf Freigabe`,
      href: "/social/freigaben",
    });
  }
  if ((pendingOld ?? 0) > 0) {
    raise("warn");
    tasks.push({
      level: "warn",
      text: `${pendingOld} Freigabe${pendingOld === 1 ? "" : "n"} wartet seit über 48 Stunden`,
      href: "/social/freigaben",
    });
  }
  if (overdueHard > 0) {
    raise("error");
    tasks.push({
      level: "error",
      text: `${overdueHard} freigegebene${overdueHard === 1 ? "r" : ""} Post${overdueHard === 1 ? "" : "s"} überfällig — Veröffentlichung prüfen`,
      href: "/social/kalender",
    });
  }
  if (overduePending > 0) {
    raise("warn");
    tasks.push({
      level: "warn",
      text: `${overduePending} Post${overduePending === 1 ? "" : "s"} mit verpasstem Termin — neu terminieren oder löschen`,
      href: "/social/freigaben",
    });
  }
  if ((failedPubs ?? 0) > 0) {
    raise("error");
    tasks.push({
      level: "error",
      text: `${failedPubs} fehlgeschlagene Plattform-Veröffentlichung${failedPubs === 1 ? "" : "en"} (7 Tage)`,
      href: "/social/kalender",
    });
  }
  const approvedNoDateCount = approvedNoDate ?? 0;
  if (approvedNoDateCount > 0) {
    raise("warn");
    tasks.push({
      level: "warn",
      text: `${approvedNoDateCount} freigegebene${approvedNoDateCount === 1 ? "r" : ""} Post${approvedNoDateCount === 1 ? "" : "s"} ohne Termin`,
      href: "/social/kalender",
    });
  }

  for (const run of [genRun, pubRun]) {
    if (run?.status === "error") {
      raise("error");
      tasks.push({
        level: "error",
        text: `Letzter Lauf „${RUN_TYPE_LABEL[run.run_type]}" ist fehlgeschlagen`,
        href: "/dashboard",
      });
    } else if (run?.status === "partial") {
      raise("warn");
      tasks.push({
        level: "warn",
        text: `Letzter Lauf „${RUN_TYPE_LABEL[run.run_type]}" nur teilweise erfolgreich`,
        href: "/dashboard",
      });
    }
  }

  // Content-Puffer: kein einziger geplanter Post in den nächsten 3 Tagen → rot.
  if ((buffer3 ?? 0) === 0) {
    raise("error");
    tasks.push({
      level: "error",
      text: "Keine Posts für die nächsten 3 Tage geplant",
      href: "/social/generator",
    });
  } else if ((buffer3 ?? 0) === 1) {
    raise("warn");
    tasks.push({
      level: "warn",
      text: "Content-Puffer wird knapp (nur 1 Post in 3 Tagen)",
      href: "/social/kalender",
    });
  }

  // Kommentar-Abgleich älter als 26h → gelb (Cron läuft täglich).
  if (commentRun && now.getTime() - new Date(commentRun.started_at).getTime() > 26 * 3_600_000) {
    raise("warn");
    tasks.push({
      level: "warn",
      text: "Kommentar-Abgleich ist älter als 26 Stunden",
      href: "/social/kommentare",
    });
  }

  // Noch nie ein Lauf protokolliert → gelb (frisch nach Deploy normal).
  if (!genRun && !pubRun) {
    raise("warn");
    tasks.push({
      level: "warn",
      text: "Noch kein Automatisierungslauf protokolliert (nach Update normal — Läufe erscheinen ab morgen früh)",
      href: "/dashboard",
    });
  }

  const headline =
    level === "ok"
      ? "Alles im grünen Bereich — Automatisierung belegt aktiv"
      : level === "warn"
        ? "Läuft — mit Hinweisen"
        : "Eingreifen nötig";

  return {
    level,
    headline,
    tasks,
    lastRuns,
    bufferDays3: buffer3 ?? 0,
    overdueCount: overdue.length,
    failedPublications: failedPubs ?? 0,
    pendingCount: pendingCount ?? 0,
  };
}
