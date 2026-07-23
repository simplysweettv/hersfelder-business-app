import { NextResponse } from "next/server";
import { computeContentPerformance } from "@/lib/learning";

export const dynamic = "force-dynamic";

// Dev-only: zeigt den aktuellen Lern-Stand (Lane-/Format-Faktoren). In Prod 404.
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  }
  const perf = await computeContentPerformance();
  return NextResponse.json(perf);
}
