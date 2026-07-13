import type { createAdminClient } from "@/lib/supabase/admin";
import { captionForPlatform } from "@/lib/caption";
import { getPublisher } from "./registry";
import { classifyPublishError, nextRetryAt } from "./errors";
import type { ConfigGetter } from "./types";
import type { Platform, Post, PostStatus } from "@/types";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Lädt alle settings-Zeilen und baut einen ConfigGetter (ENV hat Vorrang).
 * Genutzt von Cron UND Freigabe-Route.
 */
export async function loadPublishConfig(
  supabase: AdminClient,
): Promise<ConfigGetter> {
  const { data: rows } = await supabase.from("settings").select("key,value");
  const settings: Record<string, string | null> = {};
  for (const row of rows ?? []) settings[row.key] = row.value;
  return (settingKey, envKey) =>
    (envKey ? process.env[envKey] : undefined) || settings[settingKey] || undefined;
}

export type PublishMode =
  // sofort posten (fällige Posts / Freigabe ohne Termin) → Erfolg = veröffentlicht
  | "immediate"
  // an den Anbieter mit Wunsch-Uhrzeit übergeben (Freigabe) → Erfolg = eingeplant
  | "schedule";

/**
 * Wer hat den Lauf ausgelöst? Manuelle Aktionen (Freigabe-Klick) versuchen
 * fehlgeschlagene Plattformen immer erneut; der Cron respektiert die
 * Retry-Klassifizierung (permanent = kein Auto-Retry, transient = Backoff).
 */
export type PublishTrigger = "manual" | "cron";

export type PerPlatformResult = {
  platform: Platform;
  ok: boolean;
  error?: string;
  /** true = diese Runde bewusst nicht versucht (Backoff/permanent/fremder Claim). */
  skippedAttempt?: boolean;
};

export type PublishPostResult = {
  ok: boolean;
  status: Post["status"];
  perPlatform: PerPlatformResult[];
  skipped?: string;
};

/**
 * Post-Status aus den Per-Plattform-Zeilen ableiten (pure, unit-getestet).
 * skipped (z.B. Konto nicht verbunden) blockiert nicht; ein fremder
 * pending-Claim hält den Post auf "scheduled".
 */
export function derivePostStatus(
  platforms: Platform[],
  statusByPlatform: Map<Platform, string>,
  mode: PublishMode,
): PostStatus {
  const anyFailed = platforms.some((p) => statusByPlatform.get(p) === "failed");
  if (anyFailed) return "failed";
  const allSuccess = platforms.every((p) => {
    const s = statusByPlatform.get(p);
    return s === "success" || s === "skipped";
  });
  if (allSuccess) return mode === "immediate" ? "published" : "scheduled";
  return "scheduled";
}

/**
 * Veröffentlicht (oder plant) EINEN Post über alle seine Plattformen.
 *
 * - mode "immediate": postet jetzt (kein scheduledTime).
 * - mode "schedule":  übergibt mit scheduledTime = post.scheduled_at an den
 *   Anbieter, der dann selbst zur richtigen Zeit postet.
 *
 * Doppel-Post-Schutz: pro Plattform ein ATOMARER Datenbank-Claim
 * (claim_publication) — parallele Aufrufe (Freigabe-Klick + Cron) können
 * dieselbe Plattform nie gleichzeitig bearbeiten; bereits erfolgreiche
 * Plattformen werden übersprungen.
 */
export async function publishPost(
  supabase: AdminClient,
  post: Post,
  getConfig: ConfigGetter,
  mode: PublishMode,
  trigger: PublishTrigger = "manual",
): Promise<PublishPostResult> {
  if (!post.image_url || !post.caption) {
    return {
      ok: false,
      status: post.status,
      perPlatform: [],
      skipped: "fehlendes image_url oder caption",
    };
  }

  const scheduledTime =
    mode === "schedule" && post.scheduled_at
      ? new Date(post.scheduled_at).toISOString()
      : undefined;

  const perPlatform: PerPlatformResult[] = [];

  for (const platform of post.platforms) {
    // 1. Aktuellen Stand lesen: erfolgreich → überspringen; Cron respektiert
    //    außerdem permanent-Fehler und Backoff-Zeitfenster.
    const { data: existing } = await supabase
      .from("post_publications")
      .select("status, error, error_code, next_retry_at")
      .eq("post_id", post.id)
      .eq("platform", platform)
      .maybeSingle();

    if (existing?.status === "success") {
      perPlatform.push({ platform, ok: true });
      continue;
    }

    if (trigger === "cron" && existing?.status === "failed") {
      if (existing.error_code === "permanent") {
        perPlatform.push({
          platform,
          ok: false,
          error: existing.error ?? "Dauerhafter Fehler — manuell prüfen.",
          skippedAttempt: true,
        });
        continue;
      }
      if (existing.next_retry_at && new Date(existing.next_retry_at) > new Date()) {
        perPlatform.push({
          platform,
          ok: false,
          error: existing.error ?? "Wartet auf nächsten Retry.",
          skippedAttempt: true,
        });
        continue;
      }
    }

    // 2. ATOMARER Claim — die DB entscheidet, wer diese Plattform bearbeitet.
    const { data: attempt, error: claimErr } = await supabase.rpc("claim_publication", {
      p_post_id: post.id,
      p_platform: platform,
      p_stale_minutes: 10,
    });
    if (claimErr || attempt == null || attempt < 0) {
      // Ein anderer Prozess arbeitet gerade (oder hat gerade gewonnen) —
      // kein Fehler, diese Runde einfach nicht anfassen.
      perPlatform.push({
        platform,
        ok: false,
        error: claimErr?.message ?? "Wird gerade von einem anderen Lauf verarbeitet.",
        skippedAttempt: true,
      });
      continue;
    }

    // 3. Veröffentlichen/Einplanen über die Abstraktion (Anbieter egal).
    const caption = captionForPlatform(post.caption, platform);
    const outcome = await getPublisher(platform).publish(
      {
        imageUrl: post.image_url ?? "",
        mediaUrls: post.image_urls ?? undefined,
        caption,
        scheduledTime,
      },
      getConfig,
    );

    // 4. Ergebnis klassifizieren + pro Plattform festhalten.
    //    reauth = kein verbundener Account → skipped (kein Fehler, blockiert nicht)
    const errorCode = outcome.ok
      ? null
      : classifyPublishError(outcome.error, outcome.reauth);
    const pubStatus = outcome.ok ? "success" : outcome.reauth ? "skipped" : "failed";
    const retryAt = outcome.ok ? null : nextRetryAt(errorCode!, attempt);

    await supabase
      .from("post_publications")
      .update({
        status: pubStatus,
        external_id: outcome.ok ? outcome.externalId : null,
        error: outcome.ok ? null : outcome.error,
        error_code: errorCode,
        next_retry_at: retryAt ? retryAt.toISOString() : null,
        // Bei "schedule" ist noch nichts live → published_at erst beim echten Posten.
        published_at:
          outcome.ok && mode === "immediate" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("post_id", post.id)
      .eq("platform", platform);

    // Rohantwort zusätzlich in publish_log (Debug-Historie).
    await supabase.from("publish_log").insert({
      post_id: post.id,
      platform,
      status: outcome.ok ? "success" : "failed",
      platform_post_id: outcome.ok ? outcome.externalId : null,
      error_message: outcome.ok ? null : outcome.error,
      response: (outcome.raw as Record<string, unknown>) ?? null,
    });

    perPlatform.push({
      platform,
      ok: outcome.ok,
      error: outcome.ok ? undefined : outcome.error,
    });
  }

  // 5. Post-Status aus den Per-Plattform-Zeilen ableiten.
  const { data: pubRows } = await supabase
    .from("post_publications")
    .select("platform,status")
    .eq("post_id", post.id);
  const statusByPlatform = new Map(
    (pubRows ?? []).map((r) => [r.platform as Platform, r.status as string]),
  );
  const newStatus = derivePostStatus(post.platforms, statusByPlatform, mode);
  const justPublished = newStatus === "published";

  await supabase
    .from("posts")
    .update({
      status: newStatus,
      published_at: justPublished
        ? post.published_at ?? new Date().toISOString()
        : post.published_at ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", post.id);

  const anyFailed = newStatus === "failed";
  return { ok: !anyFailed, status: newStatus, perPlatform };
}

/**
 * Fragt für EINEN Post den echten Veröffentlichungs-Status beim Anbieter ab
 * (z.B. Blotato GET /posts/{id}) und aktualisiert post_publications:
 * - published → public_url + published_at gesetzt
 * - failed    → status "failed" + error
 * - in-progress → unverändert (noch nicht live)
 *
 * Danach wird der Post-Status neu abgeleitet. Idempotent & gefahrlos
 * wiederholbar (postet nichts, fragt nur ab).
 */
export async function syncPostStatus(
  supabase: AdminClient,
  postId: string,
  getConfig: ConfigGetter,
): Promise<{ updated: number; postStatus: Post["status"] | null }> {
  const { data: rows } = await supabase
    .from("post_publications")
    .select("platform, status, external_id, public_url")
    .eq("post_id", postId);

  let updated = 0;

  for (const row of rows ?? []) {
    const platform = row.platform as Platform;
    const externalId = row.external_id as string | null;
    // Nur Einreichungen prüfen, die noch nicht final sind:
    // hat eine Submission-ID, ist noch nicht als live (public_url) bestätigt
    // und nicht bereits als Fehler markiert.
    if (!externalId) continue;
    if (row.public_url) continue;
    if (row.status === "failed" || row.status === "skipped") continue;

    const publisher = getPublisher(platform);
    if (!publisher.checkStatus) continue;

    const outcome = await publisher.checkStatus(externalId, getConfig);
    if (outcome.state === "in-progress") continue;

    if (outcome.state === "published") {
      await supabase
        .from("post_publications")
        .update({
          status: "success",
          public_url: outcome.publicUrl ?? null,
          published_at: new Date().toISOString(),
          error: null,
          error_code: null,
          next_retry_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("post_id", postId)
        .eq("platform", platform);
      updated++;
    } else if (outcome.state === "failed") {
      await supabase
        .from("post_publications")
        .update({
          status: "failed",
          error: outcome.error,
          error_code: classifyPublishError(outcome.error),
          updated_at: new Date().toISOString(),
        })
        .eq("post_id", postId)
        .eq("platform", platform);
      updated++;
    }
  }

  // Post-Status neu ableiten.
  const { data: post } = await supabase
    .from("posts")
    .select("platforms, published_at")
    .eq("id", postId)
    .single();
  if (!post) return { updated, postStatus: null };

  const { data: pubRows } = await supabase
    .from("post_publications")
    .select("platform, status, public_url")
    .eq("post_id", postId);
  const byPlatform = new Map(
    (pubRows ?? []).map((r) => [r.platform as Platform, r]),
  );

  const platforms = (post.platforms ?? []) as Platform[];
  const anyFailed = platforms.some((p) => byPlatform.get(p)?.status === "failed");
  // live = bestätigt veröffentlicht (public_url) ODER skipped (nicht verbunden)
  const allLive = platforms.every((p) => {
    const r = byPlatform.get(p);
    return r?.status === "skipped" || Boolean(r?.public_url);
  });

  const newStatus: Post["status"] = anyFailed
    ? "failed"
    : allLive
      ? "published"
      : "scheduled";

  await supabase
    .from("posts")
    .update({
      status: newStatus,
      published_at:
        newStatus === "published"
          ? post.published_at ?? new Date().toISOString()
          : post.published_at ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", postId);

  return { updated, postStatus: newStatus };
}
