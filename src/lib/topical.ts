/**
 * Aktueller Kontext für reaktive, zeitspezifische Posts (wie "heute 34°C…").
 * Holt Live-Wetter für Bad Hersfeld (open-meteo, kostenlos, kein Key) und
 * leitet Datum/Wochentag/Saison/Anlass ab. Liefert einen Text, den die
 * Brief-Generierung als konkreten Aufhänger nutzen kann.
 */

const LAT = 50.868;
const LON = 9.703; // Bad Hersfeld

const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function weatherText(code: number): string {
  if (code === 0) return "klar und sonnig";
  if (code <= 3) return "teils bewölkt";
  if (code === 45 || code === 48) return "neblig";
  if (code >= 51 && code <= 57) return "Nieselregen";
  if (code >= 61 && code <= 67) return "Regen";
  if (code >= 71 && code <= 77) return "Schnee";
  if (code >= 80 && code <= 82) return "Regenschauer";
  if (code >= 95) return "Gewitter";
  return "wechselhaft";
}

function seasonOf(month: number): string {
  if (month >= 5 && month <= 9) return "Schützenfest-Hochsaison (Sommer)";
  if (month >= 3 && month <= 4) return "Vorsaison/Frühling — Vereine planen die Ausstattung";
  if (month >= 10 && month <= 11) return "Nachsaison/Herbst";
  return "Winter/Nebensaison — Planung für die nächste Saison";
}

// grobe Anlass-Hinweise je nach Datum (für zeitnahe Aufhänger)
function occasionHint(month: number, day: number): string | null {
  if (month === 12) return "Weihnachtszeit / Jahresausklang";
  if (month === 1 && day <= 6) return "Jahresanfang — gute Vorsätze, Ausblick auf die Saison";
  if (month === 2 || (month === 3 && day <= 5)) return "Faschings-/Karnevalszeit";
  if (month >= 6 && month <= 8) return "Sommer — viele Schützenfeste finden jetzt statt";
  if (month === 5) return "Saisonauftakt — die ersten Feste stehen an";
  if (month === 9) return "Erntedank/Spätsommer, letzte große Feste";
  if (month === 10) return "Oktoberfest-Zeit, Tracht & Tradition allgegenwärtig";
  return null;
}

export type TopicalContext = {
  text: string; // fertiger Kontext-Block für den Prompt
  reactiveHook: string | null; // starker Aufhänger bei extremem Wetter
  tempC: number | null;
};

export async function getTopicalContext(now: Date = new Date()): Promise<TopicalContext> {
  // Datum in deutscher Zeit
  const berlin = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
  const weekday = WEEKDAYS[berlin.getDay()];
  const day = berlin.getDate();
  const month = berlin.getMonth() + 1;
  const dateStr = `${weekday}, ${day}. ${MONTHS[month - 1]}`;
  const season = seasonOf(month);
  const occasion = occasionHint(month, day);

  let tempC: number | null = null;
  let condition: string | null = null;
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,weather_code&timezone=Europe/Berlin`,
      { cache: "no-store" },
    );
    if (res.ok) {
      const json = (await res.json()) as {
        current?: { temperature_2m?: number; weather_code?: number };
      };
      if (typeof json.current?.temperature_2m === "number") {
        tempC = Math.round(json.current.temperature_2m);
      }
      if (typeof json.current?.weather_code === "number") {
        condition = weatherText(json.current.weather_code);
      }
    }
  } catch {
    /* Wetter optional */
  }

  // starker reaktiver Aufhänger bei Extremwetter
  let reactiveHook: string | null = null;
  if (tempC != null) {
    if (tempC >= 30)
      reactiveHook = `Es ist heute ${tempC}°C und glühend heiß — mach einen humorvollen, hitze-bezogenen Post (Uniform bei der Hitze, Abkühlung im Festzelt, Schatten suchen).`;
    else if (tempC <= 2)
      reactiveHook = `Es ist heute eisige ${tempC}°C — mach einen Post über Kälte/Winter (warme Vereinsstube, Vorfreude auf die Saison, dicke Jacken).`;
    else if (condition && /Regen|Schauer|Gewitter/.test(condition))
      reactiveHook = `Heute ${condition} — mach einen Post mit Augenzwinkern übers Wetter (Schützen kennen kein schlechtes Wetter, Festzelt als Zuflucht).`;
  }

  const wx = tempC != null ? `${tempC}°C, ${condition ?? "wechselhaft"}` : "unbekannt";
  const text = `AKTUELLER KONTEXT (für einen zeitnahen, spezifischen Aufhänger nutzen, wenn er passt):
- Heute: ${dateStr}
- Saison: ${season}${occasion ? `\n- Anlass: ${occasion}` : ""}
- Wetter in Bad Hersfeld gerade: ${wx}`;

  return { text, reactiveHook, tempC };
}
