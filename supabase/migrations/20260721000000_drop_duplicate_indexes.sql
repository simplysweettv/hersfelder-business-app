-- Remove redundant duplicate indexes on posts / publish_log.
-- These auto-named (*_idx) indexes duplicated the idx_* indexes created in
-- 20260624_init_full_schema.sql (identical btree definitions). Flagged by the
-- Supabase performance advisor. Applied live via migration drop_duplicate_indexes.
drop index if exists public.posts_status_idx;
drop index if exists public.posts_scheduled_at_idx;
drop index if exists public.publish_log_post_id_idx;
