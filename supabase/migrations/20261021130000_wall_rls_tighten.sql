-- WS-wall21 step 2: tighten access (D-232 backup findings). NOT APPLIED.
-- Apply ONLY at rollout step 7 (handoff "Rollout plan"): after every screen runs the new player and is
-- enrolled, and after WALL_REQUIRE_DEVICE=1. Old players compare the key with settings.screen_key and
-- would show "Access key missing or wrong" once it is emptied here.
-- Needs 20261021120000_wall_v2_foundation.sql first (wall_admins) and at least one admin row in it.
-- Today (policies.csv): anon reads the 5 player tables incl. settings.screen_key; any signed-in user
-- may do anything on all 6 tables and on media; media objects can be listed by anyone.
-- Rollback: 20261021130100_wall_rls_rollback.sql.

begin;

-- console admins = a row in wall_admins (user id; private table, not in the repo)
create or replace function public.wall_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.wall_admins a where a.user_id = auth.uid());
$$;
revoke all on function public.wall_is_admin() from public;
grant execute on function public.wall_is_admin() to authenticated, anon;

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
-- anon keeps reading only what players need: pub_read_settings, pub_read_content, pub_read_scenes,
-- pub_read_rotation, pub_read_assign stay as they are; rotation_presets has no anon read (console only).

-- 2. the screen key leaves the public table. Its value is unchanged (D-212): the functions read it from
--    the secret SCREEN_KEY, the screen links keep it. The backup in exports\wall_backup_20261021 keeps
--    the old cell for rollback.
alter table public.settings alter column screen_key drop not null;
update public.settings set screen_key = null where screen_key is not null;
alter table public.settings add constraint settings_no_screen_key check (screen_key is null);
-- (no column revoke: with table-level SELECT for anon it would have no effect; the empty cell + check is the protection)

-- 3. media: files stay public by address (players load them), but nobody can list the bucket
--    and only admins can upload, change or delete
drop policy if exists media_public_read on storage.objects;
drop policy if exists media_auth_write on storage.objects;
drop policy if exists media_auth_update on storage.objects;
drop policy if exists media_auth_delete on storage.objects;
create policy media_admin_read on storage.objects for select to authenticated using (bucket_id = 'media' and public.wall_is_admin());
create policy media_admin_write on storage.objects for insert to authenticated with check (bucket_id = 'media' and public.wall_is_admin());
create policy media_admin_update on storage.objects for update to authenticated using (bucket_id = 'media' and public.wall_is_admin()) with check (bucket_id = 'media' and public.wall_is_admin());
create policy media_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'media' and public.wall_is_admin());

-- 4. the token function's own table stays as it is: RLS on, no policies (service role only)

commit;

-- After applying, check (as anon): select from settings gives screen_key null; storage list of media
-- is empty; a public media address still loads. As a signed-in non-admin: any insert/update fails.
