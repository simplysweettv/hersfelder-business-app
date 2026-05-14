import {
  addDays,
  format,
  getISOWeek,
  getISOWeekYear,
  startOfISOWeek,
  isSameDay,
  parseISO,
} from "date-fns";
import { de } from "date-fns/locale";

export function currentWeekInfo(now: Date = new Date()) {
  const monday = startOfISOWeek(now);
  const week = getISOWeek(now);
  const year = getISOWeekYear(now);
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

export function formatDateTime(value: string | Date) {
  const d = typeof value === "string" ? parseISO(value) : value;
  return format(d, "dd.MM.yyyy · HH:mm 'Uhr'", { locale: de });
}

export function formatTime(value: string | Date) {
  const d = typeof value === "string" ? parseISO(value) : value;
  return format(d, "HH:mm", { locale: de });
}

export function formatDate(value: string | Date) {
  const d = typeof value === "string" ? parseISO(value) : value;
  return format(d, "dd.MM.yyyy", { locale: de });
}
