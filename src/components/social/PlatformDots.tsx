import { PLATFORM_COLOR, PLATFORM_LABEL, type Platform } from "@/types";

export function PlatformDots({
  platforms,
  size = 8,
}: {
  platforms: Platform[];
  size?: number;
}) {
  return (
    <div className="flex items-center gap-1">
      {platforms.map((p) => (
        <span
          key={p}
          title={PLATFORM_LABEL[p]}
          className="inline-block rounded-full ring-1 ring-white"
          style={{
            width: size,
            height: size,
            background: PLATFORM_COLOR[p],
          }}
        />
      ))}
    </div>
  );
}

export function PlatformPills({ platforms }: { platforms: Platform[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {platforms.map((p) => (
        <span
          key={p}
          className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded text-white"
          style={{ background: PLATFORM_COLOR[p] }}
        >
          {PLATFORM_LABEL[p]}
        </span>
      ))}
    </div>
  );
}
