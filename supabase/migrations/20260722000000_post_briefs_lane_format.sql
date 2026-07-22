-- Zwei-Säulen-System (Juli 2026): Lane (emotional/product), Konzept-Format
-- (E1-E10/P1-P10) und Render-Template je Brief nachhalten — Grundlage für
-- Format-Rotation und Analytics. Live angewandt als post_briefs_lane_format.
alter table public.post_briefs
  add column if not exists lane text,
  add column if not exists format_code text,
  add column if not exists template text;
