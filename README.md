# Hersfelder · Business Suite

Interne SaaS-Dashboard-App für Andreas' Schützenausstatter-Business (schuetzen-ausstatter.de). Phase 1 (Auth + Shell) und Phase 2 (Social Media Modul) sind implementiert.

## Live

- **Production:** https://hersfelder-business-app.vercel.app
- **Vercel-Projekt:** `marcs-projects-6289937a/hersfelder-business-app`
- **Supabase-Projekt:** `tjcpyzzexfulxwhykiap` (Region eu-central-1)

## Tech-Stack

- Next.js 14 (App Router, TypeScript)
- Tailwind v4 + shadcn/ui (base-nova / @base-ui/react)
- Supabase (Auth, Postgres, Storage) via `@supabase/ssr`
- OpenAI `gpt-image-1` (Bild) + `gpt-4o-mini` (Caption)
- Meta Graph API für IG/FB Publishing
- Vercel Cron Jobs

## Lokale Entwicklung

```bash
npm install
npm run dev
```

`.env.local` enthält bereits die öffentlichen Supabase-Keys. Zusätzlich nötig (in Supabase `settings`-Tabelle ODER als env vars):

| Key | Zweck |
|-----|-------|
| `OPENAI_API_KEY` | Bild + Caption generieren |
| `META_ACCESS_TOKEN` | Instagram/Facebook publishing |
| `INSTAGRAM_ACCOUNT_ID` | IG Business Account ID |
| `FACEBOOK_PAGE_ID` | FB Page ID |
| `TIKTOK_ACCESS_TOKEN` | TikTok publishing (noch nicht implementiert) |
| `LINKEDIN_ACCESS_TOKEN` | LinkedIn publishing (noch nicht implementiert) |
| `CRON_SECRET` | optionaler Bearer-Token für Cron-Endpoints |

## Nächste Schritte (manuell)

### 1. Andreas als User in Supabase anlegen

Supabase Dashboard → Authentication → Users → **Invite user** → Andreas' E-Mail eingeben. Andreas erhält einen Login-Link.

### 2. GitHub-Repo anlegen + verbinden

Lokal ist bereits ein git-Repo initialisiert mit allen Commits. Um auf GitHub zu pushen:

```bash
# Repo auf github.com anlegen (privat, name: hersfelder-business-app)
# Danach lokal:
git remote add origin git@github.com:<dein-user>/hersfelder-business-app.git
git push -u origin main
```

Anschließend in Vercel Dashboard → Project → Settings → Git → **Connect Git Repository** → das gerade gepushte GitHub-Repo verknüpfen. Ab dann lösen `git push` Auto-Deployments aus.

### 3. OpenAI + Meta-Tokens hinzufügen

Entweder in Vercel (Settings → Environment Variables) oder in der Supabase `settings`-Tabelle:

```sql
update public.settings set value = 'sk-...' where key = 'openai_api_key';
update public.settings set value = '...' where key = 'meta_access_token';
update public.settings set value = '...' where key = 'instagram_account_id';
update public.settings set value = '...' where key = 'facebook_page_id';
```

Env vars haben Vorrang vor settings-Einträgen.

### 4. Logo einbinden

`public/logo-hersfelder.png` (transparent, mind. 88×88) ablegen, dann in `src/components/layout/Sidebar.tsx` den `<Crosshair>`-Placeholder durch `<img src="/logo-hersfelder.png" />` ersetzen.

## Architektur

```
src/
  app/
    (auth)/login/        Login-Seite (E-Mail + Passwort)
    (dashboard)/         Geschützte Routes
      dashboard/         Übersicht
      social/
        wochenplan/      7-Tage-Grid + KI-Banner
        freigaben/       Pending Posts Queue
        generator/       Manueller Post-Generator
        kalender/        Alle geplanten Posts
    api/
      posts/generate     POST: GPT-Image + Caption → Storage + DB
      posts/[id]/approve POST: status → approved/scheduled
      posts/approve-all  POST: alle pending freigeben
      cron/publish       GET: scheduled Posts publishen
      cron/generate-week GET: Wochenplan generieren (Mo 08:00)
  components/
    layout/              Sidebar, Topbar, SectionTabs
    social/              WeekPlanGrid, PostMiniCard, ApprovalCard,
                         PostPreview, GeneratorForm, AIBanner …
  lib/
    supabase/            client/server/middleware
    openai.ts            buildImagePrompt, generateImage, generateCaption
    meta-api.ts          publishToInstagram/Facebook/…
    date-utils.ts        ISO-Woche, Tageslabels
    settings.ts          Settings aus DB laden
  types/index.ts         Post, PostBrief, Platform, …
```

## Vercel Cron

Auf dem Hobby-Plan sind nur **tägliche** Crons erlaubt:
- `/api/cron/publish` läuft **09:00 UTC** (nicht jede Minute!)
- `/api/cron/generate-week` läuft **Montags 08:00 UTC**

Für Echtzeit-Publishing entweder auf **Vercel Pro** upgraden (dann `* * * * *` in `vercel.json` wieder aktivieren) oder externen Trigger nutzen (z.B. `cron-job.org` → ruft `https://hersfelder-business-app.vercel.app/api/cron/publish` alle 5 min auf, mit `Authorization: Bearer <CRON_SECRET>` Header).

## Post-Status-Flow

```
draft → pending → approved → scheduled → published
                                       ↘ failed
```

- KI generiert Posts mit Status `pending`
- Andreas gibt frei → `approved` (sofort publish-bereit) oder `scheduled` (wartet auf `scheduled_at`)
- Cron-Job publisht → `published` oder `failed`

## Storage

Bucket `post-images` (public, mit RLS-Policy für authenticated writes). KI-Bilder werden als PNG abgelegt, `getPublicUrl()` liefert die URL für IG/FB.
