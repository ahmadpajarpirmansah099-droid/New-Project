-- User Monitoring: private developer visibility, per-auth-session tracking, and retention.
-- This migration adds new tables only; it does not alter operational records.

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create table public.user_monitoring_sessions (
  id uuid primary key default gen_random_uuid(),
  auth_session_id uuid not null unique,
  user_id uuid references auth.users(id) on delete set null,
  user_email text not null,
  display_name text not null,
  role text not null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  workspace_name text,
  device_type text not null check (device_type in ('mobile','tablet','desktop')),
  browser text not null,
  operating_system text not null,
  status text not null default 'online' check (status in ('online','offline','logged_out')),
  logged_in_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index user_monitoring_sessions_user_idx
  on public.user_monitoring_sessions (user_id, logged_in_at desc);
create index user_monitoring_sessions_workspace_idx
  on public.user_monitoring_sessions (workspace_id, logged_in_at desc);
create index user_monitoring_sessions_status_seen_idx
  on public.user_monitoring_sessions (status, last_seen_at desc);

create table public.user_monitoring_activity (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in ('login_success','login_failed','login_error','logout')),
  user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  actor_name text,
  actor_role text,
  auth_session_id uuid,
  workspace_id uuid references public.workspaces(id) on delete set null,
  workspace_name text,
  attempted_email_hint text,
  source text not null default 'password',
  reason_code text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index user_monitoring_activity_time_idx
  on public.user_monitoring_activity (occurred_at desc);
create index user_monitoring_activity_workspace_time_idx
  on public.user_monitoring_activity (workspace_id, occurred_at desc);
create index user_monitoring_activity_user_time_idx
  on public.user_monitoring_activity (user_id, occurred_at desc);

alter table public.user_monitoring_sessions enable row level security;
alter table public.user_monitoring_activity enable row level security;

revoke all on public.user_monitoring_sessions from anon, authenticated;
revoke all on public.user_monitoring_activity from anon, authenticated;
grant select on public.user_monitoring_sessions to authenticated;
grant select on public.user_monitoring_activity to authenticated;
grant all on public.user_monitoring_sessions to service_role;
grant all on public.user_monitoring_activity to service_role;
grant usage, select on sequence public.user_monitoring_activity_id_seq to service_role;

create policy user_monitoring_sessions_developer_read
  on public.user_monitoring_sessions
  for select to authenticated
  using ((select public.is_current_user_developer()));

create policy user_monitoring_activity_developer_read
  on public.user_monitoring_activity
  for select to authenticated
  using ((select public.is_current_user_developer()));

create or replace function public.register_user_monitoring_session(
  p_device_type text,
  p_browser text,
  p_operating_system text,
  p_workspace_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_auth_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_email text;
  v_display_name text;
  v_role text;
  v_workspace_id uuid := p_workspace_id;
  v_workspace_name text;
  v_session_id uuid;
  v_is_new boolean := false;
begin
  if v_user_id is null or v_auth_session_id is null then
    raise exception 'Authenticated session is required';
  end if;

  if p_device_type not in ('mobile','tablet','desktop')
    or length(coalesce(p_browser,'')) = 0
    or length(coalesce(p_operating_system,'')) = 0
    or length(p_browser) > 80
    or length(p_operating_system) > 80 then
    raise exception 'Invalid device information';
  end if;

  select p.display_name, p.role, u.email
    into v_display_name, v_role, v_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = v_user_id;

  if not found or v_role not in ('developer','admin','service') then
    raise exception 'Profile access is not available';
  end if;

  if v_workspace_id is not null then
    select w.name into v_workspace_name
    from public.workspaces w
    where w.id = v_workspace_id
      and (
        v_role = 'developer'
        or exists (
          select 1 from public.workspace_memberships m
          where m.workspace_id = w.id and m.user_id = v_user_id
        )
      );
    if not found then
      raise exception 'Workspace access is not available';
    end if;
  elsif v_role <> 'developer' then
    select w.id, w.name into v_workspace_id, v_workspace_name
    from public.workspace_memberships m
    join public.workspaces w on w.id = m.workspace_id
    where m.user_id = v_user_id
    order by m.created_at
    limit 1;
  end if;

  insert into public.user_monitoring_sessions (
    auth_session_id, user_id, user_email, display_name, role,
    workspace_id, workspace_name, device_type, browser, operating_system,
    status, logged_in_at, last_seen_at, last_active_at, ended_at
  ) values (
    v_auth_session_id, v_user_id, v_email,
    coalesce(nullif(v_display_name,''), v_email), v_role,
    v_workspace_id, v_workspace_name, p_device_type, p_browser, p_operating_system,
    'online', now(), now(), now(), null
  )
  on conflict (auth_session_id) do update set
    user_id = excluded.user_id,
    user_email = excluded.user_email,
    display_name = excluded.display_name,
    role = excluded.role,
    workspace_id = excluded.workspace_id,
    workspace_name = excluded.workspace_name,
    device_type = excluded.device_type,
    browser = excluded.browser,
    operating_system = excluded.operating_system,
    status = 'online',
    last_seen_at = now(),
    last_active_at = now(),
    ended_at = null
  returning id, (xmax = 0) into v_session_id, v_is_new;

  if v_is_new then
    insert into public.user_monitoring_activity (
      event_type, user_id, actor_email, actor_name, actor_role,
      auth_session_id, workspace_id, workspace_name, source
    ) values (
      'login_success', v_user_id, v_email,
      coalesce(nullif(v_display_name,''), v_email), v_role,
      v_auth_session_id, v_workspace_id, v_workspace_name, 'password'
    );
  end if;

  return v_session_id;
end;
$function$;

create or replace function public.touch_user_monitoring_session()
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_auth_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_updated integer;
begin
  if auth.uid() is null or v_auth_session_id is null then
    return false;
  end if;

  update public.user_monitoring_sessions
  set last_seen_at = now(), last_active_at = now()
  where auth_session_id = v_auth_session_id
    and user_id = auth.uid()
    and status = 'online';

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$function$;

create or replace function public.end_user_monitoring_session()
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_auth_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_session public.user_monitoring_sessions%rowtype;
begin
  if auth.uid() is null or v_auth_session_id is null then
    return false;
  end if;

  update public.user_monitoring_sessions
  set status = 'logged_out', ended_at = now(), last_seen_at = now(), last_active_at = now()
  where auth_session_id = v_auth_session_id
    and user_id = auth.uid()
    and status <> 'logged_out'
  returning * into v_session;

  if not found then
    return false;
  end if;

  insert into public.user_monitoring_activity (
    event_type, user_id, actor_email, actor_name, actor_role,
    auth_session_id, workspace_id, workspace_name, source
  ) values (
    'logout', v_session.user_id, v_session.user_email, v_session.display_name,
    v_session.role, v_session.auth_session_id, v_session.workspace_id,
    v_session.workspace_name, 'password'
  );

  return true;
end;
$function$;

revoke all on function public.register_user_monitoring_session(text,text,text,uuid) from public, anon;
revoke all on function public.touch_user_monitoring_session() from public, anon;
revoke all on function public.end_user_monitoring_session() from public, anon;
grant execute on function public.register_user_monitoring_session(text,text,text,uuid) to authenticated;
grant execute on function public.touch_user_monitoring_session() to authenticated;
grant execute on function public.end_user_monitoring_session() to authenticated;

create policy user_monitoring_presence_write
  on realtime.messages
  for insert to authenticated
  with check (
    (select realtime.topic()) = 'user-monitoring:global'
    and extension = 'presence'
  );

create policy user_monitoring_presence_developer_read
  on realtime.messages
  for select to authenticated
  using (
    (select realtime.topic()) = 'user-monitoring:global'
    and extension = 'presence'
    and (select public.is_current_user_developer())
  );

do $cleanup$
begin
  if exists (select 1 from cron.job where jobname = 'user-monitoring-retention-daily') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'user-monitoring-retention-daily';
  end if;
end;
$cleanup$;

select cron.schedule(
  'user-monitoring-retention-daily',
  '17 18 * * *',
  $job$
    delete from public.user_monitoring_sessions
    where status in ('offline','logged_out')
      and coalesce(ended_at,last_seen_at) < now() - interval '7 days';

    delete from public.user_monitoring_activity
    where occurred_at < now() - interval '30 days';
  $job$
);
