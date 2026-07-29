import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createClient();
  // Einzige Route ohne Guard: unangemeldet kam bisher HTTP 200 mit leerer Liste
  // zurück (RLS greift zwar, aber die Inbox wirkte dadurch leer statt gesperrt).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const filter = searchParams.get("filter") ?? "all";

  let query = supabase
    .from("comments")
    .select("*")
    .eq("hidden", false)
    .order("comment_timestamp", { ascending: false })
    .limit(100);

  if (filter === "unanswered") query = query.eq("replied", false);
  if (filter === "instagram") query = query.eq("platform", "instagram");
  if (filter === "facebook") query = query.eq("platform", "facebook");

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ comments: data ?? [] });
}
