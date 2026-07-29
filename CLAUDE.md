# Hersfelder Business Suite — CLAUDE.md

## Projekt-Übersicht
Interne Business App für **Andreas Hertwig**, Inhaber von **Hersfelder Schützenbekleidung** (schuetzen-ausstatter.de). Modulares Dashboard, das mit neuen Funktionen wachsen kann. Aktuell in Betrieb: **Modul 1 — Social Media Automation**.

**Ziel:** Andreas soll fertig generierte Posts in der App sehen, sie reviewen, freigeben — und sie werden automatisch zur geplanten Zeit veröffentlicht. Ohne dass sein PC an sein muss.

> **Zuverlässigkeits-Update (Juli 2026, `20260712100000_review_hardening`):** Sammelfreigabe nutzt jetzt dieselbe Publishing-Pipeline wie die Einzel-Freigabe (keine verspäteten Posts mehr); atomarer Publish-Claim (`claim_publication` RPC) gegen Doppel-Posts; Retry-Klassifizierung (transient/permanent/reauth) mit Backoff; `automation_runs`-Protokoll + echte Systemampel im Leitstand; verbindlicher Qualitäts-TÜV (`quality_status`) mit Freigabe-Blockern + Override; fail-closed Cron-Auth; `post_metrics`-Snapshots; konfigurierbarer Posting-Plan. Details siehe Abschnitt „Zuverlässigkeit & Betrieb".

---

## Tech Stack

| Layer | Technologie |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui (base-nova Theme) |
| Datenbank | Supabase (PostgreSQL + Storage + Auth) |
| Hosting | Vercel |
| KI Bilder | OpenAI `gpt-image-1` |
| KI Text | OpenAI `gpt-4o-mini` |
| Auth | Supabase SSR Auth (`@supabase/ssr`) |

## Infra

- **GitHub:** https://github.com/simplysweettv/hersfelder-business-app (public)
- **Vercel:** https://hersfelder-business-app.vercel.app
- **Supabase Produktion:** `kmkciylrmadkhywlytkf` — **das ist die Quelle der Wahrheit.** Migrationen und Datenprüfungen gehören hierhin.
- **Supabase alt:** `tjcpyzzexfulxwhykiap` — steht noch in `.env.local`, bekommt aber seit dem 14.07.2026 keinen Cron-Verkehr mehr. Ein Cutover wurde vorbereitet (`.env.local.NEU-fuer-cutover`), aber nie auf Vercel übertragen.
- **Lokales Projekt:** `/Users/marcwitzsche/Claude/hersfelder-app`

> **Achtung, häufige Falle:** Die beiden Projekte liegen in **verschiedenen Supabase-Konten**. Das MCP `supabase-hersfelder` zeigt auf die Produktion; ein `list_projects` über das andere Konto listet die Produktion gar nicht auf. Welches Projekt live ist, entscheidet der Cron-Verkehr, nicht die Post-Zahl:
> ```sql
> select max(started_at) from automation_runs;  -- Produktion hat einen Lauf von heute
> ```

---

## Projektstruktur

```
src/
├── app/
│   ├── (auth)/login/          # Login-Seite
│   ├── (dashboard)/           # Alle geschützten Seiten
│   │   ├── layout.tsx         # Sidebar + Topbar + MobileNav
│   │   ├── dashboard/         # Übersicht (Stats-Cards)
│   │   └── social/
│   │       ├── freigaben/     # Posts reviewen + freigeben ← Haupt-Workflow
│   │       ├── wochenplan/    # Wochenübersicht
│   │       ├── kalender/      # Kalender-View
│   │       └── generator/     # Manuell einen Post erstellen
│   └── api/
│       ├── cron/
│       │   ├── generate-week/ # Mi 08:00 — 2 Posts für nächste Woche generieren
│       │   └── publish/       # Täglich 09:00 — fällige Posts veröffentlichen
│       └── posts/
│           ├── [id]/approve/   # POST — Post freigeben
│           ├── [id]/regenerate/ # POST — Post neu generieren
│           └── [id]/           # PATCH — Caption bearbeiten
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx        # Desktop-Navigation (220px, hidden auf Mobile)
│   │   ├── Topbar.tsx         # Breadcrumb (Desktop) / Logo+Titel (Mobile)
│   │   └── MobileNav.tsx      # Bottom Tab Bar (nur Mobile, md:hidden)
│   └── social/
│       ├── ApprovalCard.tsx   # Haupt-Komponente: Preview + Edit + Approve
│       ├── PlatformDots.tsx   # Platform-Badges
│       └── GeneratorForm.tsx  # Manueller Post-Generator
├── lib/
│   ├── supabase/
│   │   ├── server.ts          # Anon-Client (SSR, mit RLS)
│   │   ├── client.ts          # Anon-Client (Browser)
│   │   └── admin.ts           # Service-Role-Client (Cron, bypasses RLS)
│   ├── openai.ts              # Alle KI-Funktionen (Brief, Image, Caption, Prompts)
│   └── settings.ts            # Settings aus DB laden
└── types/
    └── index.ts               # Post, Platform, etc.
```

---

## Datenbank (Supabase)

### Tabellen
```sql
posts (
  id uuid PRIMARY KEY,
  title text,
  image_url text,
  caption text,          -- Plattform-Captions mit Trennern (---INSTAGRAM--- etc.)
  status text,           -- pending → approved/scheduled → published → failed
  platforms text[],      -- ['instagram', 'facebook', 'tiktok', 'linkedin']
  scheduled_at timestamptz,
  week_number int,
  year int,
  updated_at timestamptz
)

post_briefs (
  id uuid PRIMARY KEY,
  post_id uuid REFERENCES posts,
  theme text,
  occasion text,
  product text,
  message text,
  prompt_used text        -- der tatsächlich verwendete Image-Prompt
)

settings (
  key text PRIMARY KEY,
  value text
)
-- Wichtige Keys: openai_api_key, brand_style_prompt, meta_access_token,
--               instagram_account_id, facebook_page_id, posting_plan
```

**Weitere Tabellen (vollständig in `20260624_init_full_schema.sql` + `20260712100000_review_hardening.sql`):**
- `posts` zusätzlich: `image_urls[]`, `quality_score`, `quality_notes[]`, `quality_status` (`passed|warning|failed|not_checked`), `approved_at`
- `post_briefs` zusätzlich: `pillar`, `style_type`
- `post_publications`: Per-Plattform-Status + `public_url`, `attempt_count`, `last_attempt_at`, `next_retry_at`, `error_code`
- `comments` — IG/FB-Kommentar-Inbox (personenbezogen)
- `ai_usage` — KI-Kosten pro Aufruf
- `automation_runs` — Protokoll jedes Cron-Laufs (Grundlage der Systemampel)
- `post_metrics` — tägliche Engagement-Snapshots (24h/7d/30d-Historie)
- `claim_publication(post_id, platform, stale_minutes)` — RPC für atomaren Publish-Claim

### RLS
- User-facing Routen: `createClient()` (anon key, RLS greift)
- Cron-Routen: `createAdminClient()` (service_role key, bypasses RLS) — **WICHTIG**
- `settings`: **Lese-Whitelist** für authentifizierte Nutzer (keine Secrets sichtbar); Schreiben nur über `/api/settings` (Admin-Client, Key-Whitelist). Secrets kommen als Vercel-ENV-Vars.
- `loadSettings()` läuft server-seitig mit Admin-Client — **nie** aus Client-Komponenten importieren.

---

## Automatisierung (Crons)

Drei tägliche Vercel-Crons (`vercel.json`), alle **fail-closed** abgesichert (`src/lib/cron-auth.ts` — ohne `CRON_SECRET` in Produktion abgelehnt) und mit `automation_runs`-Protokoll:

| Cron | Zeit (UTC) | Aufgabe |
|---|---|---|
| `generate-week` | 05:00 | Content-Puffer auffüllen (rollierend, nächste ~8 Tage) |
| `fetch-comments` | 07:00 | IG/FB-Kommentare abgleichen |
| `publish` | 09:00 | Fällige Posts posten (Sicherheitsnetz) + Status-Sync + `post_metrics`-Snapshot |

### generate-week (`/api/cron/generate-week`)
- Läuft **täglich 05:00 UTC** — hält einen rollenden Puffer geplanter Posts
- **Slots kommen aus dem konfigurierbaren Posting-Plan** (`src/lib/posting-plan.ts`, settings-Key `posting_plan`): Modi **Ruhig** (2×/Wo), **Normal** (3×), **Aktiv** (4×) oder **Individuell**. UI: Einstellungen → Posting-Plan
- Wochentage/Uhrzeiten in **deutscher Zeit** (DST-bewusst via `src/lib/berlin-time.ts`)
- **Idempotenz pro Berlin-Kalendertag** (nicht exaktem Timestamp) — Uhrzeit-Änderung erzeugt keinen Doppel-Post; max. 1 Post/Tag, bis zu 3 pro Lauf
- **Wetter-Aufhänger termin-gebunden** (`getWeatherForPublishDay`): Termin <24h → aktuelles Wetter als reaktiver Hook; sonst Tages-**Prognose** für den Veröffentlichungstag (kein „heute")
- **Service-Säule NUR im festen 5er-CTA-Slot** (jeder 5. Post) — die gewichtete Zufallsauswahl schließt `service` aus, damit der Werbeanteil ~20 % bleibt
- Vercel: `maxDuration = 300`

### Zwei-Säulen-System — designte Posts (Poster-Engine v3, Juli 2026)
**Alle Einzelposts (Generator + Cron) laufen über das Zwei-Säulen-System:**
- **Säule EMOTIONAL (60 %)** — Vereinsleben & Gefühl
- **Säule PRODUKT (40 %)** — konkrete Produkte mit Benefit-Leiste + CTA — nie zwei Produkt-Posts in Folge, der 5er-Slot erzwingt einen Produkt-Post

**Hybrid-Rendering:** gpt-image-1 generiert NUR das Foto (ohne Text, mit „copy space"-Komposition), das Marken-Layout (echtes Wappen-PNG, Playfair Display/Great Vibes/Montserrat/Inter, Icon-Leisten, CTA-Feld) wird deterministisch mit `next/og`/satori composited → Text immer perfekt, `sharp` konvertiert zu JPEG (TikTok).

> **Poster-Engine v3 (ersetzt v2):** v2 hatte `plakat`/`foto`/`typo` — darunter zwei Typo-Layouts ganz OHNE Foto (Text auf grünem Verlauf) und ein Plakat mit ganzflächigem grünem Schleier. Im Feed sah das aus wie „zu oft einfach nur grüner Hintergrund" und traf den Look der Vorbild-Posts nicht. v3 baut den Referenz-Aufbau nach.

**Die drei harten Regeln der Engine (`src/lib/render-poster.tsx`):**
1. **Jeder Post hat ein echtes Foto.** Es gibt keinen Layout-Pfad ohne Bild und keinen Farbverlauf als Ersatz — `renderPoster` wirft, wenn das Foto fehlt. (Der stille Fallback auf einen grünen Verlauf war die eigentliche Fehlerquelle.)
2. **Text sitzt auf einer HELLEN Marken-Fläche**, nie als helle Schrift auf abgedunkeltem Foto — dadurch auf jedem Motiv gleich lesbar.
3. **Grün ist Akzent** (Benefit-Leiste, CTA-Feld), nie Bildhintergrund.

**Canvas 1024×1280 = 4:5** — exakt das Format, das Instagram im Feed zeigt. Vorher wurde 2:3 gerendert und von Instagram beschnitten; jetzt sieht das Bild auf Facebook/LinkedIn/TikTok genauso aus wie im Feed. Die Foto-Prompts halten oberes/unteres Zehntel motivfrei (das Foto kommt weiter als 1024×1536 von gpt-image-1 und wird mittig beschnitten).

**Die 5 Layouts:**
| Layout | Säule | Aufbau (Vorbild) |
|---|---|---|
| `panel-links` | Produkt | Creme-Panel links + grüne Benefit-Leiste unten („Die Damenweste") |
| `panel-cta` | Produkt | Heller Wash + Tagline + CTA-Feld + helle Fußleiste („Ins Schwitzen") |
| `zentral-minimal` | Emotional | Zentriert: Wappen + Serife + Schreibschrift („Gemeinsam heute") |
| `karte-unten` | Emotional | Creme-Karte unten links über vollflächigem Foto |
| `band-unten` | beide | Foto oben, Creme-Band unten |

**Arbeitsteilung KI ↔ Marke:** Die KI liefert NUR die Idee-Texte (Kicker, Headline, Schreibschrift-Akzent, Sub, Copy). Alles, was die Marke wiedererkennbar macht — Benefit-Kacheln, CTA-Feld, Fußleiste, Tagline, Adresse — kommt fest aus dem Konzept-Format. Genau deshalb sehen die Posts konsistent aus und nicht wie 30 verschiedene Absender.

**Bausteine:**
- `src/lib/render-kit.tsx` — gemeinsame Satori-Bausteine (Farben, Fonts, Wappen, `el`/`box`/`kids`, `icon`, `fitSize`), genutzt von Poster + Reel. Es gibt bewusst nur EINE Feed-Engine: dass früher zwei nebeneinander standen (`render-post.tsx` + `render-poster.tsx`), war die Ursache dafür, dass monatelang die falsche live war.
- `src/lib/render-poster.tsx` — die 5 Layouts + `renderedTextOf` fürs QA-Gate
- `src/lib/concepts.ts` — 32 Konzept-Formate (E1–E17 emotional, P1–P15 produkt) mit Idee-Formeln, Beispiel-Headlines, Saison-Fenstern, Benefit-Trios und CTAs; `pickConceptFormat` (Rotation) + `pickLane` (60:40)
- `src/lib/designed-post.ts` — Konzept-KI (`generateDesignedConcept`, gpt-4o-mini) + Zeichen-Budgets pro Layout + Foto-Prompt-Bausteine + `createDesignedPostImage`
- `src/lib/brand-icons.ts` — Lucide-Icon-Pfade für Satori; Fonts in `src/assets/fonts/`, Wappen in `src/assets/brand/` (via `outputFileTracingIncludes` im Bundle)
- Anti-Generik: `BANNED_PHRASES` (Floskel- + Klima-Claim-Verbot) + Spezifitäts-Pflicht + `dropRedundantKicker` (Kicker darf die Headline nicht doppeln)
- `post_briefs` speichert `lane`, `format_code`, `template` (= Layout-Schlüssel, `style_type: "designed"`) — Basis für Rotation
- Dev-Vorschau: `GET /api/dev/poster-preview?layout=panel-links|panel-cta|zentral-minimal|karte-unten|band-unten` (Layout ohne KI-Kosten), `GET /api/dev/generate-designed?lane=…&format=…` (echte Pipeline) — beide nur lokal, in Produktion 404

**Themen-Abdeckung (v3):** Der Katalog deckt jetzt die VOLLE Zielgruppe des Briefings ab — nicht nur Schützenvereine, sondern auch **Spielmannszüge, Musikzüge, Bruderschaften und Traditionsvereine**, und nicht nur Mitglieder, sondern auch die Menschen, die beschaffen (**Vorstand, Uniformwart, Einkauf**). Neu erzählt wird außerdem die stärkste Sachgeschichte der Marke: **eigene Fertigung entlang der kompletten Wertschöpfungskette** → daraus folgen Verfügbarkeit und Nachkaufgarantie.

**Wetter-Aufhänger nur wo er hingehört:** `weatherReactive: true` steht nur an P2/E3/E9. Vorher bekam JEDES Format den aktuellen Wetter-Hook — so entstand „Bei 35 Grad bewegt ihr euch trotzdem mit." auf einem Post über Spielmannszug-Ausstattung. Die Bremse sitzt in `generateDesignedConcept`, damit Cron, Generator und Zufall sie gemeinsam erben.

### Karussell — entfernt (Juli 2026)
Der Karussell-Pfad (`/api/posts/generate-carousel`, `src/lib/carousel.tsx`, Cover+Slides+Outro) ist raus. Die Slides waren Typografie auf grünem Verlauf — genau der Look, den v3 abschafft — und er war eine dritte Render-Engine neben Poster und Reel. Der Generator bietet nur noch Einzelposts an.

### Content-Strategie
- **Master-Briefing:** `MASTER_BRIEFING` in `src/lib/openai.ts` — bindendes Marken-Briefing von Andreas (Juli 2026), wird JEDEM KI-Prompt (Bild + Text) vorangestellt. Kernpunkte: Standardsortiment-Marke (keine Maßschneiderei!), Größen 23–70 alle zum gleichen Preis, verbotene Claims (maßgeschneidert, handgeschneidert, atmungsaktiv …), realistische Uniformen ohne Goldlitzen/Epauletten/Fantasiedetails
- Emotionale Themen: Zusammenhalt, Generationen, Rituale, Vorfreude, Ehrenamt — immer mit konkreter Idee (siehe Format-Formeln)
- Produkt-Themen: Damenweste, leichte Sommerqualität, Größen-USP 23–70, Neuausstattung, Nachkaufgarantie, Jungschützen, Stick/Druck, Frack, Musterkollektion
- Stil: Wie Reportagefotografie — authentisch, nicht gestellt; Menschen bevorzugt von hinten/Profil/Detail (Uncanny-Valley-Schutz)

### Caption-Format
Captions werden mit Plattform-Trennern in einer DB-Spalte gespeichert:
```
---INSTAGRAM---
Wenn der Verein zur Familie wird. 🟢

#hersfelder #schützenfest #vereinsleben

---FACEBOOK---
Wer kennt das Gefühl, wenn man nach Jahren noch immer den gleichen Platz im Festzelt findet?

---TIKTOK---
Tradition trifft Lebensfreude 🎯 #schützenfest #hersfelder #vereinsleben #tradition

---LINKEDIN---
Was Schützenvereine über Gemeinschaft wissen...
```

---

## Mobile UI

Die App ist vollständig mobil nutzbar:
- **Desktop:** Sidebar (220px links) + Topbar mit Breadcrumb
- **Mobile:** Sidebar ausgeblendet + Bottom Tab Bar (`MobileNav.tsx`) + Topbar mit Logo
- ApprovalCard: Buttons auf Mobile unter dem Titel gestapelt (kleiner, touch-freundlich)
- Viewport: kein Zoomen beim Tippen (`export const viewport: Viewport` in `layout.tsx`)

---

## Umgebungsvariablen (Vercel)

```
NEXT_PUBLIC_SUPABASE_URL=https://kmkciylrmadkhywlytkf.supabase.co   # Produktion (NICHT das Projekt aus .env.local)
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # Für Cron-Jobs — niemals im Client verwenden
OPENAI_API_KEY=...
BLOTATO_API_KEY=...             # Veröffentlichung (alle Kanäle)
CRON_SECRET=...                 # PFLICHT in Produktion — Cron ist fail-closed
FACEBOOK_APP_ID=... FACEBOOK_APP_SECRET=...   # Meta-OAuth
```

---

## Wichtige Entwicklungshinweise

1. **Admin-Client nur in Server-Routen** — `createAdminClient()` niemals in Client-Komponenten
2. **Bildformate:** gpt-image-1 unterstützt nur `1024x1024`, `1024x1536`, `1536x1024`
3. **Function-Timeout:** bis 300s möglich (`export const maxDuration = 300`). Alle Routen mit Bildgenerierung ODER mehreren Blotato-Aufrufen brauchen das — bei 60s gab es HTTP 504
4. **Caption-Parsing:** `splitCaption()`/`buildCaption()` liegen zentral in `src/lib/caption.ts` (eine Quelle der Wahrheit für UI + Cron)
5. **Woche berechnen:** ISO-Wochen — Helfer in `src/lib/berlin-time.ts` (`isoWeek`, `isoWeekYear`); für Berlin-Zeit `berlinWallToUtc`/`berlinDayKey`
6. **Next.js 14:** `viewport` als eigenen Export (`export const viewport: Viewport`), nicht in `metadata`
7. **Publishing IMMER über `publishPost()`** (`src/lib/publishers/publish.ts`) — nie den Post-Status direkt umstellen. Freigabe (einzeln + Sammel) und Cron nutzen dieselbe Pipeline
8. **Qualitäts-TÜV = Zwei-Agenten-Freigabe** (`src/lib/qa-gate.ts`, seit Juli 2026): `runQaGate()` prüft das **fertige Composite als Bild** — QA-Agent (Motiv-Abgleich Bild↔Text, Grammatik, Compliance, Render-Artefakte) und Social-Agent (Scroll-Stopper, Note 1–10, ab 7 frei). Nur wenn beide freigeben, gilt der Post als bestanden.
   - Aufruf immer über `reviewDesignedPost()` (`src/lib/designed-review.ts`) — die sammelt gerenderten Text, Motiv und Säule aus dem Konzept ein. Alle Wege nutzen sie: Cron, Generator, Zufall, Regenerate.
   - Mapping: QA-Fehler → `failed` (Freigabe-Blocker), nur kreative Schwäche → `warning`, beide frei → `passed`
   - Der alte `reviewPost()` in `openai.ts` wird nicht mehr aufgerufen (nur noch Karussell/Legacy)
   - **Achtung Laufzeit:** Bildgenerierung + zwei Vision-Calls brauchen ~75 s. Alle Generierungs-Routen stehen deshalb auf `maxDuration = 300` — bei 60 s gab es HTTP 504
   - Freigabe-Regeln weiterhin in `src/lib/quality.ts` (`approvalGate`) — Blocker verlangen `override:true`

## Zuverlässigkeit & Betrieb (Juli 2026)

- **Sammelfreigabe = echte Pipeline:** „Alle freigeben" ruft `publishPost(…, "schedule")` je Post, überspringt geprüft-blockierte Posts und meldet eine ehrliche Zusammenfassung (freigegeben / eingeplant / Plattform-Übergaben / Fehler)
- **Atomarer Claim:** `claim_publication` RPC verhindert Doppel-Posts bei parallelen Läufen (Freigabe-Klick + Cron)
- **Retry-Klassifizierung** (`src/lib/publishers/errors.ts`): transient → Backoff (5/15/60/360/1440 min), permanent/reauth → kein Auto-Retry
- **Systemampel:** `getSystemHealth()` (`src/lib/automation.ts`) leitet grün/gelb/rot aus `automation_runs` + Post-Lage ab (überfällig, Puffer, wartende Freigaben, fehlgeschlagene Veröffentlichungen). Sichtbar im Leitstand mit Aufgaben-Liste
- **Tests:** `npm test` (Vitest, 46 Tests) — Caption, Berlin-Zeit/DST, ISO-Wochen, Quality-Gate, Retry-Klassifizierung, Posting-Plan, Status-Ableitung. CI: `.github/workflows/ci.yml` (typecheck, lint, test, build, audit)

---

## Noch nicht implementiert / bewusst verschoben

- **Next.js 15/16-Upgrade** — bewusst NACH der Vorstellung als eigenes Arbeitspaket (die 2 verbleibenden `npm audit`-Findings sind Next-14-transitiv). Nicht `npm audit fix --force`
- **Medienbibliothek / echte Produktreferenz-Bilder** (Review Abschnitt 10) — nächste Phase
- **Plattformnative Formate + TikTok-Video** (Review Abschnitt 11) — nächste Phase
- **E-Mail-Benachrichtigungen** bei Publish-Fehler / leerem Puffer — Systemampel zeigt es bereits in der App
- **TikTok + LinkedIn Direct-API** — laufen aktuell über Blotato
- **Shop Manager, Newsletter** — in der Sidebar als „bald" markiert
