import {
  addDays,
  addWeeks,
  format,
  getISOWeek,
  getISOWeekYear,
  startOfISOWeek,
  isSameDay,
  parseISO,
} from "date-fns";
import { de } from "date-fns/locale";

export function currentWeekInfo(offset = 0, now: Date = new Date()) {
  const base = offset !== 0 ? addWeeks(now, offset) : now;
  const monday = startOfISOWeek(base);
  const week = getISOWeek(base);
  const year = getISOWeekYear(base);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  return { monday, week, year, days };
}

export function weekDayLabels(days: Date[]) {
  return days.map((d) => ({
    date: d,
    name: format(d, "EEEEEE", { locale: de }),
    day: format(d, "d", { locale: de }),
    iso: format(d, "yyyy-MM-dd"),
    isToday: isSameDay(d, new Date()),
  }));
}

/**
 * Alle Anzeige-Zeiten IMMER in deutscher Zeit — unabhängig davon, wo der Code
 * läuft. date-fns `format` nimmt die Zeitzone der Laufzeit: Server-Komponenten
 * rendern auf Vercel in UTC, Client-Komponenten im Browser in Berlin. Dadurch
 * zeigte der Leitstand 17:00, wo der Kalender für denselben Post 19:00 zeigte.
 * Intl mit fester timeZone liefert überall dasselbe Ergebnis.
 */
const BERLIN = "Europe/Berlin";

function berlinParts(value: string | Date) {
  const d = typeof value === "string" ? parseISO(value) : value;
  const p = new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return {
    day: get("day"),
    month: get("month"),
    year: get("year"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

export function formatDateTime(value: string | Date) {
  const b = berlinParts(value);
  return `${b.day}.${b.month}.${b.year} · ${b.hour}:${b.minute} Uhr`;
}

export function formatTime(value: string | Date) {
  const b = berlinParts(value);
  return `${b.hour}:${b.minute}`;
}

export function formatDate(value: string | Date) {
  const b = berlinParts(value);
  return `${b.day}.${b.month}.${b.year}`;
}
