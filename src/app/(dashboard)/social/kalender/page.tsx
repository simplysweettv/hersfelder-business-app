import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { SyncStatusButton } from "@/components/social/SyncStatusButton";
import { type PublicationRow } from "@/components/social/PublicationStatus";
import { PostDetailDialog } from "@/components/social/PostDetailDialog";
import { TrafficLightDot } from "@/components/social/TrafficLight";
import { postHealth } from "@/lib/post-health";
import type { Post } from "@/types";
import { Calendar as CalendarIcon } from "lucide-react";

export const dynamic = "force-dynamic";

/** Der Zeitpunkt, unter dem ein Post im Kalender einsortiert wird. */
function calendarDate(p: Post): number | null {
  const value = p.published_at ?? p.scheduled_at;
  return value ? new Date(value).getTime() : null;
}

export default async function KalenderPage() {
  const supabase = await createClient();
  // Alles, was einen Platz im Kalender hat: geplante Posts UND bereits
  // veröffentlichte (die haben nach einer Sofort-Veröffentlichung kein
  // scheduled_at — sie sollen trotzdem sichtbar bleiben).
  const { data } = await supabase
    .from("posts")
    .select("*")
    .or("scheduled_at.not.is.null,published_at.not.is.null");

  const posts = (data ?? []) as Post[];

  // Publications laden (für echten Live-Status pro Plattform).
  const ids = posts.map((p) => p.id);
  const pubsByPost = new Map<string, PublicationRow[]>();
  if (ids.length) {
    const { data: pubs } = await supabase
      .from("post_publications")
      .select(
        "post_id, platform, status, public_url, external_id, error, error_code, attempt_count, last_attempt_at, next_retry_at, published_at",
      )
      .in("post_id", ids);
    for (const row of pubs ?? []) {
      const list = pubsByPost.get(row.post_id) ?? [];
      list.push(row as PublicationRow);
      pubsByPost.set(row.post_id, list);
    }
  }

  const now = Date.now();
  // Anstehend = Termin liegt in der Zukunft und der Post ist noch nicht raus.
  const upcoming = posts
    .filter((p) => {
      const t = calendarDate(p);
      return t != null && t >= now && p.status !== "published";
    })
    .sort((a, b) => (calendarDate(a) ?? 0) - (calendarDate(b) ?? 0));

  const past = posts
    .filter((p) => !upcoming.includes(p))
    .sort((a, b) => (calendarDate(b) ?? 0) - (calendarDate(a) ?? 0)); // neueste zuerst

  // Ampel-Zählung fürs Kopf-Resümee — zeigt sofort, ob etwas hängt.
  const counts = { green: 0, amber: 0, red: 0 };
  for (const p of posts) {
    counts[postHealth(p, pubsByPost.get(p.id) ?? []).light]++;
  }

  return (
    <div className="flex-1 p-3 md:p-5 bg-background space-y-5 pb-24 md:pb-6">
      <div className="flex items-center gap-3 flex-wrap">
        <CalendarIcon className="w-5 h-5" style={{ color: "var(--brand-primary)" }} />
        <h1 className="text-xl font-semibold">Kalender</h1>
        <div className="ml-auto">
          <SyncStatusButton />
        </div>
      </div>

      {/* Ampel-Legende + Zählung: der Blick, der alles beantwortet. */}
      {posts.length > 0 && (
        <Card className="p-3 flex flex-row items-center gap-4 flex-wrap text-xs">
          <LegendItem light="green" count={counts.green} text="veröffentlicht" />
          <LegendItem light="amber" count={counts.amber} text="läuft / wartet" />
          <LegendItem light="red" count={counts.red} text="nicht veröffentlicht" />
          <span className="text-muted-foreground ml-auto hidden sm:inline">
            Auf einen Post klicken zeigt den genauen Status und die Fehlermeldung.
          </span>
        </Card>
      )}

      {posts.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Noch keine Posts eingeplant — die Maschine füllt morgen früh nach.
        </Card>
      ) : (
        <>
          <Section title="Anstehend" count={upcoming.length}>
            {upcoming.map((p) => (
              <PostDetailDialog key={p.id} post={p} pubs={pubsByPost.get(p.id) ?? []} />
            ))}
            {upcoming.length === 0 && (
              <p className="text-sm text-muted-foreground px-1">Nichts geplant.</p>
            )}
          </Section>

          {past.length > 0 && (
            <Section title="Veröffentlicht & vergangen" count={past.length}>
              {past.map((p) => (
                <PostDetailDialog key={p.id} post={p} pubs={pubsByPost.get(p.id) ?? []} />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function LegendItem({
  light,
  count,
  text,
}: {
  light: "green" | "amber" | "red";
  count: number;
  text: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <TrafficLightDot light={light} label={text} />
      <span className="font-semibold">{count}</span>
      <span className="text-muted-foreground">{text}</span>
    </span>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        <span className="text-xs text-muted-foreground">({count})</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
