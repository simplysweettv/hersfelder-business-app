-- Per-Plattform-Veröffentlichungsstatus & Idempotenz-Schutz.
--
-- Das unique(post_id, platform) ist das eigentliche Sicherheitsnetz: jede
-- Plattform kann pro Post nur EINMAL erfolgreich sein. Beim Retry werden
-- bereits erfolgreiche Kanäle übersprungen → keine Doppel-Posts.

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

create index if not exists idx_post_publications_post
  on public.post_publications (post_id);

-- RLS: Cron schreibt mit Service-Role (umgeht RLS). Eingeloggte Nutzer dürfen
-- den Status in der Freigaben-UI lesen.
alter table public.post_publications enable row level security;

drop policy if exists "post_publications_select_authenticated" on public.post_publications;
create policy "post_publications_select_authenticated"
  on public.post_publications
  for select
  to authenticated
  using (true);
