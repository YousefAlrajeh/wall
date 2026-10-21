-- WS-wall21 UNDO of rollout step 2b (admin-only writes, media not listable). NOT APPLIED; only to undo.
-- Restores the rules exactly as listed in exports\wall_backup_20261021\policies.csv (21 Oct 2026).
-- Run in the Supabase SQL editor. Never through "supabase db push".

begin;

drop policy if exists auth_read_settings on public.settings;
drop policy if exists auth_read_content on public.content;
drop policy if exists auth_read_scenes on public.scenes;
drop policy if exists auth_read_rotation on public.rotation;
drop policy if exists auth_read_assign on public.assignments;
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

drop policy if exists media_admin_read on storage.objects;
drop policy if exists media_admin_write on storage.objects;
drop policy if exists media_admin_update on storage.objects;
drop policy if exists media_admin_delete on storage.objects;
create policy media_public_read on storage.objects for select to anon, authenticated using (bucket_id = 'media');
create policy media_auth_write on storage.objects for insert to authenticated with check (bucket_id = 'media');
create policy media_auth_update on storage.objects for update to authenticated using (bucket_id = 'media') with check (bucket_id = 'media');
create policy media_auth_delete on storage.objects for delete to authenticated using (bucket_id = 'media');

commit;
