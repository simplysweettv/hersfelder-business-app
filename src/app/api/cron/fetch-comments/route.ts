import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthorized } from "@/lib/cron-auth";
import { syncMetaComments } from "@/lib/comments-sync";
import { startRun, finishRun } from "@/lib/automation";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = cronAuthorized(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const runId = await startRun(admin, "comment_sync", "cron");

  const result = await syncMetaComments();

  await finishRun(admin, runId, {
    planned: 1,
    succeeded: result.ok ? 1 : 0,
    failed: result.ok ? 0 : 1,
    errors: result.errors,
    meta: {
      fetched: result.fetched,
      instagram: result.instagram,
      facebook: result.facebook,
    },
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
