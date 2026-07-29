import { cn } from "@/lib/utils";
import type { Ampel } from "@/lib/post-health";

/**
 * Die Ampel — ein Blick genügt: rot / gelb / grün.
 * Bewusst NICHT nur Farbe: jede Stufe hat ein eigenes Symbol und einen
 * Text, damit sie auch bei Rot-Grün-Sehschwäche und im Screenreader trägt.
 */

const DOT: Record<Ampel, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-400",
  red: "bg-red-500",
};

const RING: Record<Ampel, string> = {
  green: "ring-emerald-500/25",
  amber: "ring-amber-400/25",
  red: "ring-red-500/25",
};

const TEXT: Record<Ampel, string> = {
  green: "text-emerald-700",
  amber: "text-amber-700",
  red: "text-red-700",
};

const CHIP: Record<Ampel, string> = {
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
};

/** Nur der Punkt — für die kompakte Kalender-Zeile. */
export function TrafficLightDot({
  light,
  label,
  className,
}: {
  light: Ampel;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn("relative flex h-3 w-3 shrink-0", className)}
      role="img"
      aria-label={`Status: ${label}`}
      title={label}
    >
      <span
        className={cn("h-3 w-3 rounded-full ring-4", DOT[light], RING[light])}
      />
    </span>
  );
}

/** Punkt + Text — für Kopfzeilen und das Detail-Fenster. */
export function TrafficLightChip({
  light,
  label,
  className,
}: {
  light: Ampel;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        CHIP[light],
        className,
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", DOT[light])} aria-hidden />
      {label}
    </span>
  );
}

export { TEXT as TRAFFIC_TEXT_COLOR };
