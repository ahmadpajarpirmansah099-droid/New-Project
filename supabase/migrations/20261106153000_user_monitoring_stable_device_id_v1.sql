-- Stable browser device identifiers for User Monitoring.
-- Existing login sessions are preserved and receive individual legacy IDs.

alter table public.user_monitoring_sessions
  add column if not exists device_id uuid;

update public.user_monitoring_sessions
set device_id = gen_random_uuid()
where device_id is null;

alter table public.user_monitoring_sessions
  alter column device_id set not null;

create index if not exists user_monitoring_sessions_device_idx
  on public.user_monitoring_sessions (user_id, device_id, last_seen_at desc);

drop function if exists public.register_user_monitoring_session(text,text,text,uuid,uuid);

create function public.register_user_monitoring_session(
  p_device_type text,
  p_browser text,
  p_operating_system text,
  p_device_id uuid,
  p_workspace_id uuid
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

  if p_device_id is null
    or p_device_type not in ('mobile','tablet','desktop')
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
    auth_session_id, device_id, user_id, user_email, display_name, role,
    workspace_id, workspace_name, device_type, browser, operating_system,
    status, logged_in_at, last_seen_at, last_active_at, ended_at
  ) values (
    v_auth_session_id, p_device_id, v_user_id, v_email,
    coalesce(nullif(v_display_name,''), v_email), v_role,
    v_workspace_id, v_workspace_name, p_device_type, p_browser, p_operating_system,
    'online', now(), now(), now(), null
  )
  on conflict (auth_session_id) do update set
    device_id = excluded.device_id,
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

-- Keep the old signature working for clients that have not refreshed yet.
create or replace function public.register_user_monitoring_session(
  p_device_type text,
  p_browser text,
  p_operating_system text,
  p_workspace_id uuid default null
)
returns uuid
language sql
security definer
set search_path = ''
as $function$
  select public.register_user_monitoring_session(
    p_device_type,
    p_browser,
    p_operating_system,
    gen_random_uuid(),
    p_workspace_id
  );
$function$;

revoke all on function public.register_user_monitoring_session(text,text,text,uuid,uuid) from public, anon;
revoke all on function public.register_user_monitoring_session(text,text,text,uuid) from public, anon;
grant execute on function public.register_user_monitoring_session(text,text,text,uuid,uuid) to authenticated;
grant execute on function public.register_user_monitoring_session(text,text,text,uuid) to authenticated;
