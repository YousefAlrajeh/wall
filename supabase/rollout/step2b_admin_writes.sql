-- WS-wall21 rollout step 2b: writes only for console admins; media not listable. NOT APPLIED.
-- Run in the Supabase SQL editor right after step 2 (step2_foundation.sql) AND after every console
-- user's id is in public.wall_admins. Never through "supabase db push".
-- Safe for screens: players (old and new) never write; they only read the 5 player tables (kept)
-- and load media by public address (kept). The console (old and new) writes only while signed in,
-- so its users must be admins (proved by the harness: test_rls_order.js).
-- Undo: undo/undo_step2b_admin_writes.sql (restores today's rules from policies.csv exactly).

begin;

-- 1. writes only for admins (replaces "any signed-in user may do anything")
drop policy if exists auth_all_settings on public.settings;
drop policy if exists auth_all_content on public.content;
drop policy if exists auth_all_scenes on public.scenes;
drop policy if exists auth_all_rotation on public.rotation;
drop policy if exists auth_all_assign on public.assignments;
drop policy if exists auth_all_presets on public.rotation_presets;
create policy admin_all_settings on public.settings for all to authenticated using (public.wall_is_admin()) with check (public.wall_is_admin());
create policy admin_all_content on public.content for all to authenticated using (public.wall_is_admin()) with check (public.wall_is_admin());
create policy admin_all_scenes on public.scenes for all to authenticated using (public.wall_is_admin()) with check (public.wall_is_admin());
create policy admin_all_rotation on public.rotation for all to authenticated using (public.wall_is_admin()) with check (public.wall_is_admin());
create policy admin_all_assign on public.assignments for all to authenticated using (public.wall_is_admin()) with check (public.wall_is_admin());
create policy admin_all_presets on public.rotation_presets for all to authenticated using (public.wall_is_admin()) with check (public.wall_is_admin());
-- anon keeps reading only what players need (pub_read_* untouched); rotation_presets: console only.
-- A player tab in a browser that also holds a signed-in non-admin session reads as "authenticated":
create policy auth_read_settings on public.settings for select to authenticated using (true);
create policy auth_read_content on public.content for select to authenticated using (true);
create policy auth_read_scenes on public.scenes for select to authenticated using (true);
create policy auth_read_rotation on public.rotation for select to authenticated using (true);
create policy auth_read_assign on public.assignments for select to authenticated using (true);

-- 2. media: files stay public by address, the bucket cannot be listed, only admins change it
drop policy if exists media_public_read on storage.objects;
drop policy if exists media_auth_write on storage.objects;
drop policy if exists media_auth_update on storage.objects;
drop policy if exists media_auth_delete on storage.objects;
create policy media_admin_read on storage.objects for select to authenticated using (bucket_id = 'media' and public.wall_is_admin());
create policy media_admin_write on storage.objects for insert to authenticated with check (bucket_id = 'media' and public.wall_is_admin());
create policy media_admin_update on storage.objects for update to authenticated using (bucket_id = 'media' and public.wall_is_admin()) with check (bucket_id = 'media' and public.wall_is_admin());
create policy media_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'media' and public.wall_is_admin());

commit;

-- Check after: signed in as an admin, the console saves a setting and uploads an image; a public media
-- address still loads in a browser; screens unchanged. As anon (SQL editor; prints counts only):
--   begin; set local role anon; select count(*) as media_files_anon_can_list from storage.objects where bucket_id = 'media'; rollback;
--     expected 0 (the list is closed; files still load by their public address, which does not use these rules)
--   begin; set local role anon; select (select count(*) from public.settings) as settings_rows, (select count(*) from public.content) as content_rows; rollback;
--     expected the same counts as before step 2b (players still read their tables)
