import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCaptionPrompt } from "./openai";
import {
  generateDesignedConcept,
  createDesignedPostImage,
  conceptHookText,
  generateCompliantCaption,
} from "./designed-post";
import { PHOTO_SAFE_LAYOUTS } from "./designed-post";
import {
  markMediaUsed,
  parseMediaUsageMode,
  planPhotoSource,
  resolvePhotoInput,
} from "./media-library";
import { pickConceptFormat, pickLane, BANNED_PHRASES, type Lane } from "./concepts";
import { computeContentPerformance } from "./learning";
import { getWeatherForPublishDay } from "./topical";
import { reviewDesignedPost } from "./designed-review";
import { parsePostingPlan } from "./posting-plan";
import { berlinWallToUtc, berlinDayKey, berlinWeekday, isoWeek, isoWeekYear } from "./berlin-time";
import type { Platform } from "@/types";
import type { AppSettings } from "./settings";

/**
 * Die autonome Content-Engine — als Funktion, nicht als Route.
 *
 * Sie lag früher komplett im Handler von `/api/cron/generate-week`. Das hatte
 * einen praktischen Haken: Nachfüllen ging AUSSCHLIESSLICH über den Cron, und
 * der ist fail-closed mit einem verschlüsselten Secret abgesichert. Wer den
 * Puffer von Hand auffüllen wollte — etwa nachdem alte Posts verworfen wurden —
 * hatte keinen Weg dorthin und musste bis zum nächsten Morgen warten.
 *
 * Jetzt teilen sich Cron und ein angemeldeter Nutzer dieselbe Engine.
 */

const LOOKAHEAD_DAYS = 8;
const DEFAULT_MAX_PER_RUN = 3;

export type FillResult = {
  created: string[];
  openSlots: number;
  errors: string[];
  mode: string;
};

/**
 * Füllt bis zu `maxPosts` freie Slots der nächsten Tage mit fertigen,
 * qualitätsgeprüften Posts (Status „pending" — veröffentlicht wird nichts
 * ohne Freigabe).
 */
export async function fillContentBuffer(opts: {
  supabase: SupabaseClient;
  apiKey: string;
  settings: AppSettings;
  maxPosts?: number;
  now?: Date;
}): Promise<FillResult> {
  const { supabase, apiKey, settings } = opts;
  const now = opts.now ?? new Date();
  const maxPosts = Math.max(1, Math.min(opts.maxPosts ?? DEFAULT_MAX_PER_RUN, DEFAULT_MAX_PER_RUN));
  const plan = parsePostingPlan(settings["posting_plan"]);

  // 1) Kommende Slots (deutsche Zeit) für die nächsten LOOKAHEAD_DAYS berechnen.
  const slots: { when: Date; platforms: Platform[] }[] = [];
  for (let i = 0; i <= LOOKAHEAD_DAYS; i++) {
    const dayUtc = new Date(now.getTime() + i * 86_400_000);
    const weekday = berlinWeekday(dayUtc);
    for (const p of plan.slots) {
      if (p.weekday !== weekday) continue;
      const [y, m, d] = berlinDayKey(dayUtc).split("-").map(Number);
      const when = berlinWallToUtc(y, m - 1, d, p.hour, p.minute);
      if (when.getTime() <= now.getTime() + 60 * 60 * 1000) continue; // mind. 1h Vorlauf
      slots.push({ when, platforms: p.platforms });
    }
  }
  slots.sort((a, b) => a.when.getTime() - b.when.getTime());

  // 2) Belegte Slots ermitteln — Idempotenz pro Berlin-KALENDERTAG (nicht exaktem
  //    Timestamp): wird die Uhrzeit im Plan geändert, entsteht kein Doppel-Post.
  const from = now.toISOString();
  const to = new Date(now.getTime() + (LOOKAHEAD_DAYS + 1) * 86_400_000).toISOString();
  const { data: existing } = await supabase
    .from("posts")
    .select("scheduled_at")
    .gte("scheduled_at", from)
    .lte("scheduled_at", to)
    .not("status", "in", "(draft)");
  const takenDays = new Set(
    (existing ?? [])
      .filter((p) => p.scheduled_at)
      .map((p) => berlinDayKey(new Date(p.scheduled_at as string))),
  );

  // Nur ein Post pro Tag; erste freien Tage bis maxPosts.
  const open: typeof slots = [];
  const plannedDays = new Set<string>();
  for (const s of slots) {
    const key = berlinDayKey(s.when);
    if (takenDays.has(key) || plannedDays.has(key)) continue;
    plannedDays.add(key);
    open.push(s);
    if (open.length >= maxPosts) break;
  }

  // 3) Anti-Wiederholung: zuletzt genutzte Themen/Botschaften + Formate/Lanes laden.
  const { data: recentBriefs } = await supabase
    .from("post_briefs")
    .select("theme, message, format_code, lane, template")
    .order("created_at", { ascending: false })
    .limit(8);
  const avoid = (recentBriefs ?? [])
    .flatMap((b) => [b.theme, b.message])
    .filter((x): x is string => Boolean(x));
  const recentFormats = (recentBriefs ?? [])
    .map((b) => b.format_code)
    .filter((x): x is string => Boolean(x))
    .slice(0, 4);
  let prevLane: Lane | null = ((recentBriefs?.[0]?.lane as Lane | undefined) ?? null) || null;
  // Zuletzt genutzte Layouts meiden → Abwechslung im Feed.
  const recentLayouts = (recentBriefs ?? [])
    .map((b) => b.template)
    .filter((x): x is string => Boolean(x))
    .slice(0, 3);

  // 5er-Zyklus: jeder fünfte Post = garantierter Produkt-Post (mit CTA).
  const { count: totalPostCount } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true });
  const baseIndex = totalPostCount ?? 0;

  const created: string[] = [];
  const errors: string[] = [];

  // Selbstlernend: welche Lane/Formate performen am besten? (greift ab ≥8 Posts,
  // sonst neutrale Faktoren → keine Verzerrung). Einmal pro Lauf.
  const perf = await computeContentPerformance();

  for (const slot of open) {
    try {
      const week = isoWeek(slot.when);
      const year = isoWeekYear(slot.when);
      const month = slot.when.getUTCMonth() + 1;

      const postIndex = baseIndex + created.length;
      const isCTASlot = postIndex % 5 === 4;
      // Zwei-Säulen-System: 60 % emotional / 40 % Produkt, nie zwei Produkt-
      // Posts in Folge; der 5er-CTA-Slot erzwingt einen Produkt-Post.
      const lane: Lane = isCTASlot
        ? "product"
        : pickLane({ previousLane: prevLane, laneMult: perf.laneMult });
      const format = pickConceptFormat({
        lane,
        avoidCodes: recentFormats,
        month,
        formatMult: perf.formatMult,
      });
      const pillar = lane === "product" ? "service" : "community";

      // Wetter für den KONKRETEN Veröffentlichungstag (Prognose, wenn > 24h weg).
      // Ob das Format den Aufhänger überhaupt aufgreifen darf, entscheidet
      // generateDesignedConcept anhand von `weatherReactive`.
      const topical = await getWeatherForPublishDay(slot.when, now);

      // Bildbibliothek: echtes Foto direkt verwenden oder als Referenz an die
      // Bild-KI geben (Einstellung `media_usage_mode`). Ist die Bibliothek leer,
      // fällt alles automatisch auf die reine KI-Erzeugung zurück.
      const mediaPlan = await planPhotoSource(supabase, {
        lane,
        mode: parseMediaUsageMode(settings["media_usage_mode"]),
      });
      const photo = await resolvePhotoInput(mediaPlan);

      const makePost = async () => {
        // 1) Konzept: Idee + Plakat-Text + Foto-Szene nach Format-Formel
        const concept = await generateDesignedConcept({
          apiKey,
          format,
          reactiveHook: topical.reactiveHook ?? null,
          topical: topical.reactiveHook ? topical.text : null,
          avoid,
          avoidLayouts: recentLayouts,
          month,
          // Steht das Foto schon fest, muss die Idee zum Motiv passen — und das
          // Layout braucht eine deckende Textfläche.
          ...(photo.mode === "library"
            ? { fixedPhoto: photo.description, allowedLayouts: PHOTO_SAFE_LAYOUTS }
            : {}),
        });
        const captionPrompt = buildCaptionPrompt({
          theme: concept.theme,
          product: concept.product,
          message: concept.message,
          platforms: slot.platforms as string[],
          pillar,
          hook: conceptHookText(concept),
          bannedPhrases: BANNED_PHRASES,
        });
        // 2) Foto ohne Text + Marken-Overlay (parallel zur Caption)
        const [rendered, caption] = await Promise.all([
          createDesignedPostImage({
            apiKey,
            concept,
            brandStyle: settings["brand_style_prompt"],
            photo,
          }),
          generateCompliantCaption({ apiKey, captionPrompt, bannedPhrases: BANNED_PHRASES }),
        ]);
        let imageUrl: string | null = null;
        const filename = `${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("post-images")
          .upload(filename, rendered.jpeg, { contentType: "image/jpeg" });
        if (!upErr) {
          imageUrl = supabase.storage.from("post-images").getPublicUrl(filename).data.publicUrl;
        }
        // Zwei-Agenten-Freigabe auf dem FERTIGEN Composite (prüft auch, ob
        // Bild und Text dasselbe Motiv meinen).
        const review = await reviewDesignedPost({ apiKey, jpeg: rendered.jpeg, concept, caption });
        return {
          concept,
          photoPrompt: rendered.photoPrompt,
          photoSource: rendered.photoSource,
          caption,
          imageUrl,
          review,
        };
      };

      // Generieren + Freigabe; wenn ein Agent blockt, EINMAL komplett neu.
      let result = await makePost();
      if (!result.review.pass) {
        const retry = await makePost();
        if (retry.review.score >= result.review.score) result = retry;
      }

      const { concept, photoPrompt, photoSource, caption, imageUrl, review } = result;
      avoid.unshift(concept.theme, concept.message);
      recentFormats.unshift(format.code);
      recentLayouts.unshift(concept.posterCode);
      prevLane = lane;

      const { data: post, error: postErr } = await supabase
        .from("posts")
        .insert({
          title: `${concept.theme}`.slice(0, 200),
          image_url: imageUrl,
          caption,
          status: "pending",
          platforms: slot.platforms,
          scheduled_at: slot.when.toISOString(),
          week_number: week,
          year,
          quality_score: review.score,
          quality_notes: review.notes,
          quality_status: review.status,
        })
        .select("id")
        .single();

      // Stille Fehlschläge haben hier monatelang Schaden angerichtet: schlug der
      // Insert fehl (fehlende Spalte, RLS), war `post` null, das if() sprang
      // darüber hinweg und der Lauf meldete "0 erstellt, keine Fehler" — obwohl
      // Bild und KI-Kosten längst bezahlt waren. Jetzt scheitert er sichtbar.
      if (postErr || !post) {
        throw new Error(
          `Post konnte nicht gespeichert werden: ${postErr?.message ?? "kein Datensatz zurückgekommen"}`,
        );
      }

      created.push(post.id);
      const { error: briefErr } = await supabase.from("post_briefs").insert({
        post_id: post.id,
        theme: concept.theme,
        occasion: format.name,
        product: concept.product,
        message: concept.message,
        prompt_used: photoPrompt,
        pillar,
        style_type: "designed",
        lane,
        format_code: format.code,
        template: concept.posterCode,
        photo_source: photoSource,
        media_asset_ids: mediaPlan.assets.length ? mediaPlan.assets.map((a) => a.id) : null,
      });
      // Rotation der Bibliothek: erst jetzt, wenn der Post wirklich steht.
      if (photoSource !== "ai") await markMediaUsed(supabase, mediaPlan.assets);
      if (briefErr) {
        // Ohne Briefing fehlt die Grundlage für Format- und Layout-Rotation
        // sowie die selbstlernende Auswahl — das darf nicht stillschweigend
        // passieren.
        throw new Error(`Briefing konnte nicht gespeichert werden: ${briefErr.message}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[content-engine] ERROR", msg);
      errors.push(msg);
    }
  }

  return { created, openSlots: open.length, errors, mode: plan.mode };
}
