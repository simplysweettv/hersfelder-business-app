-- ============================================================================
-- Review-Hardening (Juli 2026)
-- ============================================================================
-- Teil A dokumentiert Strukturen, die in Produktion bereits existieren, aber
-- in den Migrationen fehlten (frische Umgebungen wären sonst nicht lauffähig).
-- Teil B ergänzt die neuen Zuverlässigkeits-Strukturen: automation_runs,
-- post_metrics, Qualitäts-Status, Retry-Felder und den atomaren Publish-Claim.
-- Teil C verschärft die RLS der settings-Tabelle auf eine Lese-Whitelist.
-- Idempotent: kann gefahrlos erneut laufen.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A) Bestand dokumentieren (existiert in Produktion, fehlte in Migrationen)
-- ---------------------------------------------------------------------------
alter table public.posts add column if not exists image_urls    text[];
alter table public.posts add column if not exists quality_score int;
alter table public.posts add column if not exists quality_notes text[];

alter table public.post_briefs add column if not exists pillar     text;
alter table public.post_briefs add column if not exists style_type text;

alter table public.post_publications add column if not exists public_url text;

create table if not exists public.comments (
  id                text primary key,             -- Plattform-Kommentar-ID
  platform          text not null,                -- instagram | facebook
  media_id          text not null,
  media_caption     text,
  media_thumbnail   text,
  author_name       text not null default 'Unbekannt',
  author_id         text,
  message           text not null,
  comment_timestamp timestamptz not null,
  replied           boolean not null default false,
  reply_text        text,
  replied_at        timestamptz,
  hidden            boolean not null default false,
  created_at        timestamptz not null default now()
);
create index if not exists idx_comments_replied   on public.comments (replied, hidden);
create index if not exists idx_comments_timestamp on public.comments (comment_timestamp desc);

create table if not exists public.ai_usage (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  operation          text not null,               -- image | caption | brief | review | carousel
  model              text not null,
  input_tokens       int not null default 0,
  output_tokens      int not null default 0,
  image_input_tokens int not null default 0,
  text_input_tokens  int not null default 0,
  image_count        int not null default 0,
  cost_usd           numeric not null default 0,
  estimated          boolean not null default false,
  post_id            uuid,
  meta               jsonb
);
create index if not exists idx_ai_usage_created on public.ai_usage (created_at desc);

-- ---------------------------------------------------------------------------
-- B) Neue Zuverlässigkeits-Strukturen
-- ---------------------------------------------------------------------------

-- Qualitäts-TÜV: expliziter Status statt stillschweigendem Default-Score.
-- passed | warning | failed | not_checked
alter table public.posts add column if not exists quality_status text;
alter table public.posts add column if not exists approved_at    timestamptz;

-- Retry-Steuerung pro Plattform-Veröffentlichung.
alter table public.post_publications add column if not exists attempt_count   int not null default 0;
alter table public.post_publications add column if not exists last_attempt_at timestamptz;
alter table public.post_publications add column if not exists next_retry_at   timestamptz;
-- transient (erneut versuchen) | permanent (manuell klären) | reauth (Konto verbinden)
alter table public.post_publications add column if not exists error_code      text;

-- Protokoll jedes Automatisierungslaufs — Grundlage der echten Systemampel.
create table if not exists public.automation_runs (
  id          uuid primary key default gen_random_uuid(),
  run_type    text not null,                      -- content_generation | publication | comment_sync
  trigger     text not null default 'cron',       -- cron | manual
  status      text not null default 'running',    -- running | ok | partial | error
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  planned     int not null default 0,
  succeeded   int not null default 0,
  failed      int not null default 0,
  errors      jsonb,
  post_ids    uuid[],
  meta        jsonb
);
create index if not exists idx_automation_runs_type on public.automation_runs (run_type, started_at desc);

-- Tägliche Metrik-Snapshots — dauerhafte Historie unabhängig vom Anbieter.
create table if not exists public.post_metrics (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts (id) on delete cascade,
  platform    text not null,
  captured_on date not null default current_date,
  captured_at timestamptz not null default now(),
  likes       int not null default 0,
  comments    int not null default 0,
  shares      int not null default 0,
  views       int not null default 0,
  reach       int not null default 0,
  public_url  text,
  unique (post_id, platform, captured_on)
);
create index if not exists idx_post_metrics_post on public.post_metrics (post_id, captured_on desc);

-- Atomarer Publish-Claim: Die Datenbank entscheidet, welcher Prozess einen
-- Post+Plattform bearbeiten darf. Verhindert Doppel-Posts bei parallelen
-- Aufrufen (z.B. Freigabe-Klick + Cron gleichzeitig).
-- Rückgabe: neuer attempt_count (>=1) wenn der Claim gewonnen wurde, -1 sonst.
create or replace function public.claim_publication(
  p_post_id       uuid,
  p_platform      text,
  p_stale_minutes int default 10
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt int;
begin
  -- Zeile sicherstellen, ohne einen bestehenden Status zu überschreiben.
  insert into public.post_publications (post_id, platform, status)
  values (p_post_id, p_platform, 'idle')
  on conflict (post_id, platform) do nothing;

  -- Claim: nie bei success; ein fremder pending-Claim gilt nach
  -- p_stale_minutes als verwaist (Prozess-Absturz) und darf übernommen werden.
  update public.post_publications
     set status          = 'pending',
         error           = null,
         attempt_count   = attempt_count + 1,
         last_attempt_at = now(),
         updated_at      = now()
   where post_id  = p_post_id
     and platform = p_platform
     and status  <> 'success'
     and (status <> 'pending'
          or updated_at < now() - make_interval(mins => p_stale_minutes))
  returning attempt_count into v_attempt;

  return coalesce(v_attempt, -1);
end;
$$;

-- Nur der Service-Role-Client (Cron/Server-Routen) darf claimen.
revoke execute on function public.claim_publication(uuid, text, int) from public;
revoke execute on function public.claim_publication(uuid, text, int) from anon;
revoke execute on function public.claim_publication(uuid, text, int) from authenticated;

-- ---------------------------------------------------------------------------
-- C) RLS
-- ---------------------------------------------------------------------------
alter table public.comments        enable row level security;
alter table public.ai_usage        enable row level security;
alter table public.automation_runs enable row level security;
alter table public.post_metrics    enable row level security;

drop policy if exists "comments_authenticated_all" on public.comments;
create policy "comments_authenticated_all" on public.comments
  for all to authenticated using (true) with check (true);

drop policy if exists "ai_usage_authenticated_select" on public.ai_usage;
create policy "ai_usage_authenticated_select" on public.ai_usage
  for select to authenticated using (true);

drop policy if exists "automation_runs_authenticated_select" on public.automation_runs;
create policy "automation_runs_authenticated_select" on public.automation_runs
  for select to authenticated using (true);

drop policy if exists "post_metrics_authenticated_select" on public.post_metrics;
create policy "post_metrics_authenticated_select" on public.post_metrics
  for select to authenticated using (true);

-- settings: Lese-Whitelist statt Vollzugriff. Secrets (Tokens/API-Keys) sind
-- damit für Client-Sessions unsichtbar — Server-Routen nutzen den
-- Service-Role-Client. Schreiben läuft ausschließlich über API-Routen (admin).
drop policy if exists "settings_authenticated_all" on public.settings;
drop policy if exists "settings_read_whitelist" on public.settings;
create policy "settings_read_whitelist" on public.settings
  for select to authenticated
  using (key in (
    'blotato_monthly_eur',
    'usd_eur_rate',
    'facebook_page_name',
    'facebook_page_id',
    'instagram_account_id',
    'brand_style_prompt',
    'posting_plan'
  ));
