/**
 * Zeitzonen-Helfer für Europe/Berlin — DST-bewusst, ohne Zusatz-Dependency.
 * Pure Funktionen (unit-getestet in tests/berlin-time.test.ts).
 */

/** Offset (Minuten) der Zeitzone Europe/Berlin für einen UTC-Zeitpunkt. */
export function berlinOffsetMinutes(d: Date): number {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(d)) p[part.type] = part.value;
  // Intl liefert für Mitternacht "24" — auf 0 normalisieren.
  const hour = p.hour === "24" ? 0 : +p.hour;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, hour, +p.minute);
  return Math.round((asUTC - d.getTime()) / 60000);
}

/** Deutsche Wandzeit (Y, M0, D, H, Min) → korrekter UTC-Instant. */
export function berlinWallToUtc(
  y: number,
  m: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const guess = new Date(Date.UTC(y, m, day, hour, minute));
  const off = berlinOffsetMinutes(guess);
  return new Date(guess.getTime() - off * 60000);
}

/** Kalendertag in Berlin als "YYYY-MM-DD" — für Slot-Idempotenz pro Tag. */
export function berlinDayKey(d: Date): string {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(d)) p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day}`;
}

/** Wochentag in Berlin: 0=So … 6=Sa. */
export function berlinWeekday(d: Date): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    weekday: "short",
  }).format(d);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

/** Stunde (0-23) in Berlin. */
export function berlinHour(d: Date): number {
  const h = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    hour12: false,
    hour: "2-digit",
  }).format(d);
  return +h === 24 ? 0 : +h;
}

/** ISO-Woche (1-53) eines Zeitpunkts (UTC-basiert). */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** ISO-Wochenjahr (kann vom Kalenderjahr abweichen, z.B. 1. Januar). */
export function isoWeekYear(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  return t.getUTCFullYear();
}
