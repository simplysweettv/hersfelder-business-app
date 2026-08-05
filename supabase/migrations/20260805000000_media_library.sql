-- ---------------------------------------------------------------------------
-- Bildbibliothek (August 2026)
--
-- Echte Schützenbilder aus dem Verein/Betrieb hochladen und in der Pipeline
-- verwenden — entweder DIREKT als Foto im Post oder als visuelle REFERENZ,
-- an der sich gpt-image-1 beim Erzeugen einer neuen Szene orientiert.
--
-- Warum eine eigene Tabelle statt nur Storage: Ohne Beschreibung („was ist
-- drauf") kann weder die Konzept-KI noch der Bild-Prompt etwas mit dem Foto
-- anfangen. Außerdem brauchen wir Rotation (times_used/last_used_at), damit
-- nicht immer dasselbe Motiv im Feed landet.
-- ---------------------------------------------------------------------------

create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  public_url text not null,
  title text,
  -- Motivbeschreibung; fließt in die Foto-Prompts und die Konzept-Auswahl ein.
  description text,
  -- Für welche Säule taugt das Motiv?
  lane text not null default 'both' check (lane in ('emotional', 'product', 'both')),
  -- Wie darf das Bild genutzt werden?
  --   photo     = direkt als Foto im Post
  --   reference = nur als Stil-/Look-Vorlage für die KI
  --   both      = beides
  usage text not null default 'both' check (usage in ('photo', 'reference', 'both')),
  active boolean not null default true,
  mime text,
  bytes integer,
  width integer,
  height integer,
  uploaded_by uuid,
  times_used integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists media_assets_pick_idx
  on media_assets (active, usage, lane, last_used_at nulls first);

alter table media_assets enable row level security;

-- Die App hat genau einen Nutzerkreis (Andreas + Kollege). Wer angemeldet ist,
-- darf die Bibliothek pflegen; der Service-Role-Client (Cron) umgeht RLS ohnehin.
drop policy if exists media_assets_authenticated_all on media_assets;
create policy media_assets_authenticated_all on media_assets
  for all to authenticated using (true) with check (true);

-- Herkunft des Fotos am Post festhalten: 'ai' | 'ai-reference' | 'library'
alter table post_briefs add column if not exists photo_source text;
alter table post_briefs add column if not exists media_asset_ids uuid[];

-- ---------------------------------------------------------------------------
-- Storage-Bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media-library',
  'media-library',
  true,
  20971520, -- 20 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists media_library_public_read on storage.objects;
create policy media_library_public_read on storage.objects
  for select using (bucket_id = 'media-library');

drop policy if exists media_library_authenticated_insert on storage.objects;
create policy media_library_authenticated_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'media-library');

drop policy if exists media_library_authenticated_update on storage.objects;
create policy media_library_authenticated_update on storage.objects
  for update to authenticated using (bucket_id = 'media-library');

drop policy if exists media_library_authenticated_delete on storage.objects;
create policy media_library_authenticated_delete on storage.objects
  for delete to authenticated using (bucket_id = 'media-library');

-- ---------------------------------------------------------------------------
-- Lese-Whitelist der settings um den Bibliotheks-Schalter erweitern
-- (kein Secret — die Einstellungsseite liest ihn direkt im Browser).
-- ---------------------------------------------------------------------------

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
    'posting_plan',
    'media_usage_mode'
  ));
