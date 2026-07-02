# Hersfelder Business Suite — CLAUDE.md

## Projekt-Übersicht
Interne Business App für **Andreas Hertwig**, Inhaber von **Hersfelder Schützenbekleidung** (schuetzen-ausstatter.de). Modulares Dashboard, das mit neuen Funktionen wachsen kann. Aktuell in Betrieb: **Modul 1 — Social Media Automation**.

**Ziel:** Andreas soll jeden Mittwoch 2 fertig generierte Posts in der App sehen, sie reviewen, freigeben — und sie werden automatisch veröffentlicht. Ohne dass sein PC an sein muss.

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
--               instagram_account_id, facebook_page_id
```

### RLS
- User-facing Routen: `createClient()` (anon key, RLS greift)
- Cron-Routen: `createAdminClient()` (service_role key, bypasses RLS) — **WICHTIG**

---

## Wöchentliche Automatisierung

### generate-week (`/api/cron/generate-week`)
- Läuft **jeden Mittwoch 08:00 UTC** auf Vercel — PC muss nicht online sein
- Generiert **2 Posts für die nächste Woche**:
  - **Mittwoch 17:00** — Lifestyle-Foto, Portrait-Format (1024×1536), immer `photo`
  - **Samstag 12:00** — rotiert wöchentlich: `hook` → `typography` → `photo` (via HOOK_ROTATION)
- **Per-Slot-Idempotenz:** Jeder Slot hat einen `scheduled_at`-Timestamp. Wird beim Timeout nur Slot 1 gespeichert, generiert der nächste Aufruf automatisch Slot 2
- Vercel Hobby: max. 60s pro Function — beide Posts passen bei normaler Bildgenerierung rein

### Post-Typen
| Typ | Beschreibung |
|---|---|
| `photo` | Authentisches Reportage-Foto: Menschen in Uniform beim Feiern/Marschieren/Lachen |
| `hook` | Vereinsfoto mit GROSSEM Text-Overlay im Bild (Scroll-Stopper) |
| `typography` | Dunkelgrüner Hintergrund, bold weiße Großbuchstaben, kein Foto |

### Content-Strategie
- **Master-Briefing:** `MASTER_BRIEFING` in `src/lib/openai.ts` — bindendes Marken-Briefing von Andreas (Juli 2026), wird JEDEM KI-Prompt (Bild + Text) vorangestellt. Kernpunkte: Standardsortiment-Marke (keine Maßschneiderei!), Größen 23–70 alle zum gleichen Preis, verbotene Claims (maßgeschneidert, handgeschneidert, atmungsaktiv …), realistische Uniformen ohne Goldlitzen/Epauletten/Fantasiedetails
- **KEIN Produktmarketing** — die Kleidung ist im Hintergrund sichtbar, aber nie das Thema
- Themen: Zusammenhalt, gemeinsames Feiern, Generationen, Tradition, Stolz auf den Verein
- Stil: Wie Reportagefotografie — authentisch, nicht gestellt
- 10 Szenen-Pool in `openai.ts` (`PHOTO_SCENES`) — zufällig gewählt für Vielfalt

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
CRON_SECRET=...                 # Optional: schützt die Cron-Endpoints
```

---

## Wichtige Entwicklungshinweise

1. **Admin-Client nur in Server-Routen** — `createAdminClient()` niemals in Client-Komponenten
2. **Bildformate:** gpt-image-1 unterstützt nur `1024x1024`, `1024x1536`, `1536x1024`
3. **Vercel Hobby Timeout:** 60s max. pro Serverless Function — nie zwei lange OpenAI-Calls sequenziell ohne Idempotenz
4. **Caption-Parsing:** `splitCaption()` in `ApprovalCard.tsx` parst die Trennzeichen für die Inline-Bearbeitung
5. **Woche berechnen:** `getISOWeek` + `getISOWeekYear` aus `date-fns` — immer ISO-Wochen verwenden
6. **Next.js 14:** `viewport` als eigenen Export (`export const viewport: Viewport`), nicht in `metadata`

---

## Noch nicht implementiert (nächste Phasen)

- **Meta Graph API** — Instagram + Facebook Publishing (Tokens in Settings eintragen)
- **TikTok + LinkedIn API** — Tokens noch ausstehend
- **Logo** — `/public/logo-hersfelder.png` noch nicht vorhanden
- **Shop Manager, Analytics, Newsletter** — in der Sidebar als "bald" markiert
