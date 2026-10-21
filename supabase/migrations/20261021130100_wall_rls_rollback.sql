-- WS-wall21 step 2: ROLLBACK of 20261021130000_wall_rls_tighten.sql. NOT APPLIED; use only to undo.
-- Restores the rules exactly as listed in exports\wall_backup_20261021\policies.csv (21 Oct 2026).
-- The screen key cell is NOT restored here (its value never goes in a file): if old players must run
-- again, put the value back by hand from the backup (settings_rows.csv) after this script.

begin;

drop policy if exists admin_all_settings on public.settings;
drop policy if exists admin_all_content on public.content;
drop policy if exists admin_all_scenes on public.scenes;
drop policy if exists admin_all_rotation on public.rotation;
drop policy if exists admin_all_assign on public.assignments;
drop policy if exists admin_all_presets on public.rotation_presets;
create policy auth_all_settings on public.settings for all to authenticated using (true) with check (true);
create policy auth_all_content on public.content for all to authenticated using (true) with check (true);
create policy auth_all_scenes on public.scenes for all to authenticated using (true) with check (true);
create policy auth_all_rotation on public.rotation for all to authenticated using (true) with check (true);
create policy auth_all_assign on public.assignments for all to authenticated using (true) with check (true);
create policy auth_all_presets on public.rotation_presets for all to authenticated using (true) with check (true);

alter table public.settings drop constraint if exists settings_no_screen_key;

drop policy if exists media_admin_read on storage.objects;
drop policy if exists media_admin_write on storage.objects;
drop policy if exists media_admin_update on storage.objects;
drop policy if exists media_admin_delete on storage.objects;
create policy media_public_read on storage.objects for select to anon, authenticated using (bucket_id = 'media');
create policy media_auth_write on storage.objects for insert to authenticated with check (bucket_id = 'media');
create policy media_auth_update on storage.objects for update to authenticated using (bucket_id = 'media') with check (bucket_id = 'media');
create policy media_auth_delete on storage.objects for delete to authenticated using (bucket_id = 'media');

commit;
