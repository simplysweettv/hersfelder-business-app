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
| Hosting | Vercel (Hobby Plan) |
| KI Bilder | OpenAI `gpt-image-1` |
| KI Text | OpenAI `gpt-4o-mini` |
| Auth | Supabase SSR Auth (`@supabase/ssr`) |

## Infra

- **GitHub:** https://github.com/simplysweettv/hersfelder-business-app (public)
- **Vercel:** https://hersfelder-business-app.vercel.app
- **Supabase Projekt:** `tjcpyzzexfulxwhykiap` (Region: eu-central-1)
- **Lokales Projekt:** `/Users/marcwitzsche/Documents/hersfelder-app`

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

### Zwei-Säulen-System (Juli 2026) — designte Posts
**Alle Einzelposts (Generator + Cron) laufen über das Zwei-Säulen-System:**
- **Säule EMOTIONAL (60 %)** — Vereinsleben & Gefühl, reduzierte Layouts (Wappen + Serifen-Headline + Schreibschrift-Akzent bzw. dunkles Statement-Feld)
- **Säule PRODUKT (40 %)** — konkrete Produkte mit Benefits + CTA (Creme-Panel + Benefit-Icon-Leiste bzw. Panel + CTA-Button) — nie zwei Produkt-Posts in Folge, der 5er-Slot erzwingt einen Produkt-Post

**Hybrid-Rendering:** gpt-image-1 generiert NUR das Foto (ohne Text, mit „copy space"-Komposition), das Marken-Layout (echtes Wappen-PNG, Playfair Display/Great Vibes/Montserrat/Inter, Icon-Leisten, CTA-Buttons) wird deterministisch mit `next/og`/satori composited → Text immer perfekt, `sharp` konvertiert zu JPEG (TikTok).

**Bausteine:**
- `src/lib/concepts.ts` — 20 Konzept-Formate (E1–E10 emotional, P1–P10 produkt) mit Idee-Formeln, Beispiel-Headlines, Saison-Fenstern; `pickConceptFormat` (Rotation) + `pickLane` (60:40)
- `src/lib/designed-post.ts` — Konzept-KI (`generateDesignedConcept`, gpt-4o-mini) + Foto-Prompt-Bausteine + `createDesignedPostImage` (Foto → Overlay → JPEG)
- `src/lib/render-post.tsx` — Template-Engine, 4 Layouts nach den Vorbild-Posts (`product-feature`, `emotional-minimal`, `product-reactive`, `emotional-statement`), 1024×1536, Instagram-4:5-Crop-sicher
- `src/lib/brand-icons.ts` — Lucide-Icon-Pfade für Satori; Fonts in `src/assets/fonts/`, Wappen in `src/assets/brand/` (via `outputFileTracingIncludes` im Bundle)
- Anti-Generik: `BANNED_PHRASES` (Floskel-Verbot) + Spezifitäts-Pflicht (Zahl/Detail/Kontrast/Wortspiel) im Konzept-Prompt; Ansprache immer „ihr/euch"
- `post_briefs` speichert `lane`, `format_code`, `template` (`style_type: "designed"`) — Basis für Rotation
- Dev-Vorschau: `GET /api/dev/render-preview?template=a|b|c|d` (Templates), `GET /api/dev/generate-designed?lane=…&format=…` (echte Pipeline) — beide nur lokal, in Produktion 404

### Alte Post-Typen (nur noch Karussell-Pfad)
| Typ | Beschreibung |
|---|---|
| `photo` / `hook` / `typography` | Alter KI-rendert-alles-Weg — nur noch vom Karussell-Cover + manuellen Formular genutzt |

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
NEXT_PUBLIC_SUPABASE_URL=https://tjcpyzzexfulxwhykiap.supabase.co
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
3. **Vercel Hobby Timeout:** 60s max. pro Serverless Function — nie zwei lange OpenAI-Calls sequenziell ohne Idempotenz
4. **Caption-Parsing:** `splitCaption()`/`buildCaption()` liegen zentral in `src/lib/caption.ts` (eine Quelle der Wahrheit für UI + Cron)
5. **Woche berechnen:** ISO-Wochen — Helfer in `src/lib/berlin-time.ts` (`isoWeek`, `isoWeekYear`); für Berlin-Zeit `berlinWallToUtc`/`berlinDayKey`
6. **Next.js 14:** `viewport` als eigenen Export (`export const viewport: Viewport`), nicht in `metadata`
7. **Publishing IMMER über `publishPost()`** (`src/lib/publishers/publish.ts`) — nie den Post-Status direkt umstellen. Freigabe (einzeln + Sammel) und Cron nutzen dieselbe Pipeline
8. **Qualitäts-TÜV:** `reviewPost()` liefert `checked`; `qualityStatusFrom()` mappt auf `quality_status`. Freigabe-Regeln in `src/lib/quality.ts` (`approvalGate`) — Blocker verlangen `override:true`

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
