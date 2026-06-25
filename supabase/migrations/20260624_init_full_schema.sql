-- ============================================================================
-- Hersfelder Business Suite — vollständiges Bootstrap-Schema
-- ============================================================================
-- Wird EINMAL in einem frischen Supabase-Projekt im SQL-Editor ausgeführt.
-- Idempotent: kann gefahrlos erneut laufen (if not exists / drop policy if exists).
--
-- Enthält: posts, post_briefs, settings, post_publications, publish_log,
-- RLS-Policies (interne Single-User-App) und den öffentlichen Storage-Bucket
-- "post-images".
--
-- Hinweis: settings muss NICHT befüllt werden — brand_style_prompt hat im Code
-- einen Fallback, openai_api_key + blotato_api_key kommen als ENV-Vars.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- posts — der zentrale Post-Datensatz
-- ---------------------------------------------------------------------------
create table if not exists public.posts (
  id           uuid primary key default gen_random_uuid(),
  title        text,
  image_url    text,
  caption      text,                 -- Multi-Plattform-Captions mit ---TRENNERN---
  status       text not null default 'pending',  -- pending → approved/scheduled → published → failed
  platforms    text[] not null default '{}',     -- ['instagram','facebook','tiktok','linkedin']
  scheduled_at timestamptz,
  published_at timestamptz,
  week_number  int,
  year         int,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_posts_status       on public.posts (status);
create index if not exists idx_posts_scheduled_at  on public.posts (scheduled_at);
create index if not exists idx_posts_week_year     on public.posts (week_number, year);

-- ---------------------------------------------------------------------------
-- post_briefs — das KI-Briefing hinter jedem Post
-- ---------------------------------------------------------------------------
create table if not exists public.post_briefs (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts (id) on delete cascade,
  theme       text,
  occasion    text,
  product     text,
  season      text,
  message     text,
  prompt_used text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_post_briefs_post on public.post_briefs (post_id);

-- ---------------------------------------------------------------------------
-- settings — Key/Value-Konfiguration (ENV-Vars haben im Code Vorrang)
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- post_publications — Per-Plattform-Status & Idempotenz-Schutz
-- Das unique(post_id, platform) verhindert Doppel-Posts beim Retry.
-- ---------------------------------------------------------------------------
create table if not exists public.post_publications (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.posts (id) on delete cascade,
  platform     text not null,
  status       text not null default 'pending',  -- pending | success | failed
  external_id  text,
  error        text,
  published_at timestamptz,
  updated_at   timestamptz not null default now(),
  unique (post_id, platform)
);

create index if not exists idx_post_publications_post on public.post_publications (post_id);

-- ---------------------------------------------------------------------------
-- publish_log — vollständige Debug-Historie jedes Publish-Versuchs
-- ---------------------------------------------------------------------------
create table if not exists public.publish_log (
  id               uuid primary key default gen_random_uuid(),
  post_id          uuid references public.posts (id) on delete cascade,
  platform         text,
  status           text,                -- success | failed | pending
  platform_post_id text,
  error_message    text,
  response         jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists idx_publish_log_post on public.publish_log (post_id);

-- ============================================================================
-- RLS — interne App mit genau einem eingeloggten Nutzer.
-- Cron schreibt mit Service-Role (umgeht RLS komplett). Eingeloggte Nutzer
-- dürfen die App-Tabellen lesen/schreiben.
-- ============================================================================
alter table public.posts             enable row level security;
alter table public.post_briefs       enable row level security;
alter table public.settings          enable row level security;
alter table public.post_publications enable row level security;
alter table public.publish_log       enable row level security;

drop policy if exists "posts_authenticated_all" on public.posts;
create policy "posts_authenticated_all" on public.posts
  for all to authenticated using (true) with check (true);

drop policy if exists "post_briefs_authenticated_all" on public.post_briefs;
create policy "post_briefs_authenticated_all" on public.post_briefs
  for all to authenticated using (true) with check (true);

drop policy if exists "settings_authenticated_all" on public.settings;
create policy "settings_authenticated_all" on public.settings
  for all to authenticated using (true) with check (true);

drop policy if exists "post_publications_authenticated_select" on public.post_publications;
create policy "post_publications_authenticated_select" on public.post_publications
  for select to authenticated using (true);

drop policy if exists "publish_log_authenticated_select" on public.publish_log;
create policy "publish_log_authenticated_select" on public.publish_log
  for select to authenticated using (true);

-- ============================================================================
-- Storage — öffentlicher Bucket "post-images" (Blotato zieht die Bild-URL).
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do update set public = true;

drop policy if exists "post_images_public_read" on storage.objects;
create policy "post_images_public_read" on storage.objects
  for select to public using (bucket_id = 'post-images');

drop policy if exists "post_images_authenticated_insert" on storage.objects;
create policy "post_images_authenticated_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'post-images');

drop policy if exists "post_images_authenticated_update" on storage.objects;
create policy "post_images_authenticated_update" on storage.objects
  for update to authenticated using (bucket_id = 'post-images');
