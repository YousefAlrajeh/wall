-- WS-wall21 phase 2: new objects only. NOT APPLIED. The lead takes it to the user before anything goes live.
-- Existing tables (settings, content, scenes, rotation, assignments, rotation_presets) are not touched.
-- Every new table: RLS on, nothing for anon. Only the server functions (service role) read or write them,
-- except screen_health, which signed-in console admins may read.

begin;

-- Console admins allowed to start the Microsoft sign-in and enrol screens (rows added by hand in the dashboard).
create table if not exists public.wall_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);

-- One device secret per screen PC; only its sha256 (64 hex) is stored.
create table if not exists public.wall_devices (
  screen text primary key check (screen ~ '^R[1-3]C[1-7]$'),
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  enrolled_at timestamptz not null default now(),
  revoked_at timestamptz,
  -- proof the PC kept its secret: page sessions that used it successfully (pbi-token "check")
  first_used_at timestamptz,
  last_used_at timestamptz,
  last_session text check (last_session is null or last_session ~ '^[0-9a-f]{16}$'),
  last_session_at timestamptz,
  sessions integer not null default 0
);

-- The latest checked figures snapshot (one row). Screens get it only through wall-feed.
create table if not exists public.wall_figures (
  id text primary key check (id = 'current'),
  version integer not null check (version > 0),
  data_as_of timestamptz not null,
  fetched_at timestamptz not null,
  pages jsonb not null,
  updated_at timestamptz not null default now(),
  constraint wall_figures_pages_size check (octet_length(pages::text) <= 65536)
);

-- One row per figures run: codes, counts and times only.
create table if not exists public.wall_figures_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  mode text check (mode in ('check','full')),
  result text not null check (result in ('SUCCESS','UNCHANGED','STOPPED')),
  reason text check (reason is null or reason ~ '^[A-Z0-9_]{1,40}$'),
  at jsonb,
  queries integer, "rows" integer, dropped integer, bytes integer, ms integer
);

-- A device sign-in in progress (at most one, about 15 minutes).
create table if not exists public.wall_reader_pending (
  id text primary key check (id = 'main'),
  device_code text not null,
  expires_at timestamptz not null,
  interval_s integer not null,
  started_by uuid
);

-- Screen heartbeat, written by wall-feed: fixed codes and numbers only, never free text.
create table if not exists public.screen_health (
  screen text primary key check (screen ~ '^R[1-3]C[1-7]$'),
  last_seen timestamptz not null,
  state text check (state in ('showing','loading','waiting','error','clear','stale','nodata')),
  error_code text check (error_code is null or error_code ~ '^[A-Z_]{1,32}$'),
  showing text check (showing is null or showing ~ '^[A-Za-z0-9_:.-]{1,64}$'),
  clock_offset_ms integer,
  clock_rtt_ms integer,
  feed_version integer,
  updated_at timestamptz not null default now()
);

alter table public.wall_admins enable row level security;
alter table public.wall_devices enable row level security;
alter table public.wall_figures enable row level security;
alter table public.wall_figures_runs enable row level security;
alter table public.wall_reader_pending enable row level security;
alter table public.screen_health enable row level security;

revoke all on public.wall_admins, public.wall_devices, public.wall_figures, public.wall_figures_runs,
  public.wall_reader_pending, public.screen_health from anon, authenticated, public;

-- Admins may read the health grid, nothing else.
grant select on public.screen_health to authenticated;
-- console admins = a row in wall_admins. Policies must use this security-definer function: the signed-in
-- user has no rights on wall_admins itself, so a direct sub-select there would never see a row.
create or replace function public.wall_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.wall_admins a where a.user_id = auth.uid());
$$;
revoke all on function public.wall_is_admin() from public;
grant execute on function public.wall_is_admin() to authenticated, anon;

create policy screen_health_admin_read on public.screen_health for select to authenticated
  using (public.wall_is_admin());

-- one successful use of a device secret in a page session (called by pbi-token, service role only)
create or replace function public.wall_device_used(p_screen text, p_session text) returns void
language sql security definer set search_path = '' as $$
  update public.wall_devices d
     set last_used_at = now(),
         first_used_at = coalesce(d.first_used_at, now()),
         sessions = d.sessions + case when d.last_session is distinct from p_session then 1 else 0 end,
         last_session_at = case when d.last_session is distinct from p_session then now() else d.last_session_at end,
         last_session = p_session
   where d.screen = p_screen and d.revoked_at is null and p_session ~ '^[0-9a-f]{16}$';
$$;
revoke all on function public.wall_device_used(text, text) from public, anon, authenticated;
grant execute on function public.wall_device_used(text, text) to service_role;

-- Shared wall clock: server time in ms, read-only, through the REST API (rpc/wall_now) so the screens'
-- 8 samples a minute do not count against the edge-function quota. Reveals only the time.
create or replace function public.wall_now() returns bigint
language sql stable security invoker set search_path = '' as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint;
$$;
revoke all on function public.wall_now() from public;
grant execute on function public.wall_now() to anon, authenticated, service_role;

-- wall-feed rate limit: calls per screen device per clock minute (counted by the server function only).
create table if not exists public.wall_feed_rate (
  screen text primary key check (screen ~ '^R[1-3]C[1-7]$'),
  window_start timestamptz not null,
  hits integer not null
);
alter table public.wall_feed_rate enable row level security;
revoke all on public.wall_feed_rate from anon, authenticated, public;

create or replace function public.wall_feed_hit(p_screen text, p_limit integer) returns boolean
language sql security definer set search_path = '' as $$
  insert into public.wall_feed_rate as r (screen, window_start, hits)
  values (p_screen, date_trunc('minute', now()), 1)
  on conflict (screen) do update
    set hits = case when r.window_start = excluded.window_start then r.hits + 1 else 1 end,
        window_start = excluded.window_start
  returning hits <= p_limit;
$$;
revoke all on function public.wall_feed_hit(text, integer) from public, anon, authenticated;
grant execute on function public.wall_feed_hit(text, integer) to service_role;

-- The refresh token of 'HMG Wall Reader' lives in Supabase Vault under the name 'wall_reader_refresh_token'.
-- These three functions are the only way to it, and only the service role may call them.
create or replace function public.wall_reader_token_get() returns text
language sql security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'wall_reader_refresh_token' limit 1;
$$;

create or replace function public.wall_reader_token_exists() returns boolean
language sql security definer set search_path = '' as $$
  select exists (select 1 from vault.secrets where name = 'wall_reader_refresh_token');
$$;

create or replace function public.wall_reader_token_set(new_token text) returns void
language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  if new_token is null or length(new_token) < 20 or length(new_token) > 8192 then
    raise exception 'bad value';
  end if;
  select id into sid from vault.secrets where name = 'wall_reader_refresh_token' limit 1;
  if sid is null then
    perform vault.create_secret(new_token, 'wall_reader_refresh_token', 'HMG Wall Reader refresh token');
  else
    perform vault.update_secret(sid, new_token);
  end if;
end;
$$;

revoke all on function public.wall_reader_token_get() from public, anon, authenticated;
revoke all on function public.wall_reader_token_exists() from public, anon, authenticated;
revoke all on function public.wall_reader_token_set(text) from public, anon, authenticated;
grant execute on function public.wall_reader_token_get() to service_role;
grant execute on function public.wall_reader_token_exists() to service_role;
grant execute on function public.wall_reader_token_set(text) to service_role;

commit;
