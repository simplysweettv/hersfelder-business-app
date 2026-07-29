import type { Platform, Post } from "@/types";

/**
 * Ampel-Logik für den Kalender — beantwortet EINE Frage in Andreas' Sprache:
 * "Ist der Post rausgegangen?"
 *
 *   🟢 grün  = ja, ist live
 *   🟡 gelb  = läuft noch / steht bevor / wartet auf dich
 *   🔴 rot   = nein, hat nicht geklappt → handeln
 *
 * Reine Funktionen ohne Datenbank/React — unit-getestet in
 * tests/post-health.test.ts, damit die Ampel im Pitch nie lügt.
 */

export type Ampel = "green" | "amber" | "red";

/** Rohzeile aus post_publications (nur die Felder, die die Ampel braucht). */
export type PublicationLike = {
  platform: string;
  status: string;
  public_url: string | null;
  external_id: string | null;
  error: string | null;
  error_code?: string | null;
  attempt_count?: number | null;
  last_attempt_at?: string | null;
  next_retry_at?: string | null;
  published_at?: string | null;
};

export type PlatformState =
  /** Bestätigt veröffentlicht — es gibt einen Live-Link. */
  | "live"
  /** An Blotato übergeben, Bestätigung steht noch aus. */
  | "handed_over"
  /** Übergabe oder Veröffentlichung fehlgeschlagen. */
  | "failed"
  /** Konto/Seite nicht verbunden — bewusst übersprungen, kein Fehler. */
  | "not_connected"
  /** Noch gar nicht übergeben (wartet auf Freigabe). */
  | "open";

export type PlatformHealth = {
  platform: Platform;
  state: PlatformState;
  light: Ampel;
  /** Kurzlabel für die Pille, z.B. "live". */
  label: string;
  /** Ein Satz Klartext, was gerade Sache ist. */
  detail: string;
  /** Der exakte, ungekürzte Fehlertext vom Anbieter. */
  error: string | null;
  /** Fehlerart in Klartext, z.B. "Vorübergehendes Problem". */
  errorKind: string | null;
  /** Was Andreas jetzt tun kann. */
  advice: string | null;
  publicUrl: string | null;
  externalId: string | null;
  attempts: number;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  publishedAt: string | null;
};

export type PostHealth = {
  light: Ampel;
  /** Überschrift der Ampel, z.B. "Veröffentlicht". */
  label: string;
  /** Erklärsatz darunter. */
  detail: string;
  platforms: PlatformHealth[];
  /**
   * true = "Erneut versuchen" ist sinnvoll: mind. eine Plattform wurde schon
   * einmal übergeben und hängt (Fehler oder fehlende Verbindung).
   */
  canRetry: boolean;
  /**
   * true = der Post wurde nie freigegeben. Hier hilft kein Retry, sondern nur
   * die Freigabe — inklusive Qualitäts-TÜV.
   */
  needsApproval: boolean;
};

/** Ab wann gilt ein Termin als verpasst (Cron-Laufzeiten einkalkuliert). */
const OVERDUE_GRACE_MINUTES = 30;

export const AMPEL_LABEL: Record<Ampel, string> = {
  green: "Veröffentlicht",
  amber: "Läuft",
  red: "Nicht veröffentlicht",
};

const ERROR_KIND: Record<string, { label: string; advice: string }> = {
  transient: {
    label: "Vorübergehendes Problem",
    advice:
      "Das System versucht es automatisch erneut. Du musst nichts tun — du kannst aber jederzeit selbst neu anstoßen.",
  },
  permanent: {
    label: "Dauerhafter Fehler",
    advice:
      "Es wird NICHT automatisch erneut versucht. Bitte Bild oder Text prüfen und danach erneut versuchen.",
  },
  reauth: {
    label: "Verbindung fehlt",
    advice:
      "Das Konto ist nicht (mehr) verbunden. In Blotato neu verbinden, danach erneut versuchen.",
  },
};

const PLATFORM_NAME: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
};

function platformHealth(
  platform: Platform,
  row: PublicationLike | null,
): PlatformHealth {
  const base = {
    platform,
    error: row?.error ?? null,
    publicUrl: row?.public_url ?? null,
    externalId: row?.external_id ?? null,
    attempts: row?.attempt_count ?? 0,
    lastAttemptAt: row?.last_attempt_at ?? null,
    nextRetryAt: row?.next_retry_at ?? null,
    publishedAt: row?.published_at ?? null,
  };

  // Noch keine Zeile → nie an den Anbieter übergeben.
  if (!row) {
    return {
      ...base,
      state: "open",
      light: "amber",
      label: "offen",
      detail: "Noch nicht übergeben — der Post wartet auf deine Freigabe.",
      errorKind: null,
      advice: null,
    };
  }

  if (row.status === "failed") {
    const kind = ERROR_KIND[row.error_code ?? ""] ?? null;
    return {
      ...base,
      state: "failed",
      light: "red",
      label: "Fehler",
      detail: `Die Veröffentlichung auf ${PLATFORM_NAME[platform]} ist fehlgeschlagen.`,
      errorKind: kind?.label ?? "Fehler",
      advice: kind?.advice ?? "Bitte Fehlermeldung prüfen und erneut versuchen.",
    };
  }

  if (row.status === "skipped") {
    return {
      ...base,
      state: "not_connected",
      light: "amber",
      label: "nicht verbunden",
      detail: `Für ${PLATFORM_NAME[platform]} ist kein Konto verbunden — dieser Kanal wurde übersprungen.`,
      errorKind: ERROR_KIND.reauth.label,
      advice: ERROR_KIND.reauth.advice,
    };
  }

  // success MIT Live-Link = bestätigt draußen.
  if (row.public_url) {
    return {
      ...base,
      state: "live",
      light: "green",
      label: "live",
      detail: `Auf ${PLATFORM_NAME[platform]} veröffentlicht.`,
      errorKind: null,
      advice: null,
    };
  }

  // success/pending OHNE Live-Link = übergeben, Bestätigung steht aus.
  return {
    ...base,
    state: "handed_over",
    light: "amber",
    label: "eingeplant",
    detail: `An den Veröffentlichungsdienst übergeben — ${PLATFORM_NAME[platform]} bestätigt den Live-Link in Kürze.`,
    errorKind: null,
    advice: null,
  };
}

function nameList(items: PlatformHealth[]): string {
  return items.map((p) => PLATFORM_NAME[p.platform]).join(", ");
}

/** Verbform passend zur Anzahl — "Facebook ist" vs. "Facebook, TikTok sind". */
function verb(items: PlatformHealth[], singular: string, plural: string): string {
  return items.length === 1 ? singular : plural;
}

/**
 * Leitet die Ampel für EINEN Post aus seinen Plattform-Zeilen ab.
 * `now` ist injizierbar, damit Tests nicht von der Uhrzeit abhängen.
 */
export function postHealth(
  post: Pick<Post, "status" | "platforms" | "scheduled_at">,
  pubs: PublicationLike[],
  now: Date = new Date(),
): PostHealth {
  const byPlatform = new Map(pubs.map((p) => [p.platform, p]));
  const platforms = (post.platforms ?? []) as Platform[];
  const perPlatform = platforms.map((p) =>
    platformHealth(p, byPlatform.get(p) ?? null),
  );

  const failed = perPlatform.filter((p) => p.state === "failed");
  const live = perPlatform.filter((p) => p.state === "live");
  const open = perPlatform.filter((p) => p.state === "open");
  const handedOver = perPlatform.filter((p) => p.state === "handed_over");
  const notConnected = perPlatform.filter((p) => p.state === "not_connected");

  const scheduledMs = post.scheduled_at
    ? new Date(post.scheduled_at).getTime()
    : null;
  const overdue =
    scheduledMs != null &&
    now.getTime() - scheduledMs > OVERDUE_GRACE_MINUTES * 60_000;

  // Retry lohnt nur, wo schon einmal ein Versuch lief (failed/skipped haben
  // immer eine Zeile). Nie-freigegebene Posts brauchen die Freigabe mit TÜV —
  // die darf ein Retry-Knopf nicht stillschweigend überspringen.
  const canRetry = failed.length > 0 || notConnected.length > 0;
  const needsApproval = open.length > 0;

  const result = (light: Ampel, label: string, detail: string): PostHealth => ({
    light,
    label,
    detail,
    platforms: perPlatform,
    canRetry,
    needsApproval,
  });

  if (platforms.length === 0) {
    return result("amber", "Keine Plattform", "Für diesen Post ist kein Kanal ausgewählt.");
  }

  // 1. ROT — irgendetwas ist echt schiefgegangen.
  if (failed.length > 0) {
    const detail =
      live.length > 0
        ? `Teilweise veröffentlicht: ${nameList(live)} ${verb(live, "ist", "sind")} live, ${nameList(failed)} ${verb(failed, "ist", "sind")} fehlgeschlagen.`
        : `Fehlgeschlagen auf ${nameList(failed)}. Details und Fehlermeldung stehen unten.`;
    return result("red", "Nicht veröffentlicht", detail);
  }

  // Termin vorbei, aber nie freigegeben: der Post ist NICHT rausgegangen —
  // trotzdem gelb, nicht rot. Rot bleibt echten Fehlern vorbehalten (das
  // System hat es versucht und es ging schief). Hier hat das System nichts
  // falsch gemacht, es fehlt nur die Freigabe. Der Text sagt es deutlich.
  if (overdue && open.length === platforms.length) {
    return result(
      "amber",
      "Termin verpasst",
      "Der geplante Zeitpunkt ist vorbei und der Post wurde nie freigegeben — er ist nicht veröffentlicht worden. Eine Freigabe holt ihn nach.",
    );
  }
  // Teilweise übergeben, ein Kanal blieb liegen → das ist eine echte Panne.
  if (overdue && open.length > 0) {
    return result(
      "red",
      "Teilweise veröffentlicht",
      `${nameList(open)} ${verb(open, "wurde", "wurden")} nie übergeben, obwohl der Termin vorbei ist.`,
    );
  }

  // 2. GRÜN — alles, was zählt, ist bestätigt draußen.
  if (live.length > 0 && live.length + notConnected.length === platforms.length) {
    const detail =
      notConnected.length > 0
        ? `Live auf ${nameList(live)}. ${nameList(notConnected)} ${verb(notConnected, "ist", "sind")} nicht verbunden und ${verb(notConnected, "wurde", "wurden")} übersprungen.`
        : `Live auf ${nameList(live)}.`;
    return result("green", "Veröffentlicht", detail);
  }

  // 3. GELB — unterwegs oder wartend.
  if (notConnected.length === platforms.length) {
    return result(
      "amber",
      "Kein Kanal verbunden",
      "Für keinen der ausgewählten Kanäle ist ein Konto verbunden — es wurde nichts veröffentlicht.",
    );
  }
  if (handedOver.length > 0) {
    const detail =
      live.length > 0
        ? `${nameList(live)} ${verb(live, "ist", "sind")} live, ${nameList(handedOver)} ${verb(handedOver, "ist", "sind")} übergeben und ${verb(handedOver, "wartet", "warten")} auf Bestätigung.`
        : `Übergeben an ${nameList(handedOver)} — wird zum geplanten Zeitpunkt veröffentlicht.`;
    return result("amber", "Eingeplant", detail);
  }

  return result(
    "amber",
    "Wartet auf Freigabe",
    "Der Post ist fertig, aber noch nicht freigegeben — er geht erst nach deiner Freigabe raus.",
  );
}
