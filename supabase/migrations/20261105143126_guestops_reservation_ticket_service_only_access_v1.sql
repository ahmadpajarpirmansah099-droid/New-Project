create or replace function public.next_guest_ticket(
  p_workspace_id uuid,
  p_service_date date
)
returns text
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  next_no integer;
begin
  if not public.has_workspace_role(p_workspace_id, array['service']) then
    raise exception 'Akses workspace ditolak';
  end if;

  insert into public.guest_counters(workspace_id, service_date, last_number)
  values (p_workspace_id, p_service_date, 1)
  on conflict (workspace_id, service_date)
  do update set last_number = public.guest_counters.last_number + 1
  returning last_number into next_no;

  return 'WL-' || lpad(next_no::text, 3, '0');
end;
$function$;

create or replace function public.next_reservation_code(
  p_workspace_id uuid,
  p_service_date date
)
returns text
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  next_no integer;
begin
  if not public.has_workspace_role(p_workspace_id, array['service']) then
    raise exception 'Akses workspace ditolak';
  end if;

  insert into public.reservation_counters(workspace_id, service_date, last_number)
  values (p_workspace_id, p_service_date, 1)
  on conflict (workspace_id, service_date)
  do update set last_number = public.reservation_counters.last_number + 1
  returning last_number into next_no;

  return 'RSV-' || lpad(next_no::text, 3, '0');
end;
$function$;
