-- Daily auto-close at 00:00 Asia/Jakarta (17:00 UTC; cron.timezone is GMT).

alter table public.guests
  drop constraint if exists guests_status_check;
alter table public.guests
  add constraint guests_status_check
  check (status = any (array['waiting','called','seated','done','missed','cancelled']::text[]));

create or replace function private.enforce_guest_record_identity()
returns trigger language plpgsql set search_path = ''
as $function$
declare actor_id uuid := auth.uid();
begin
  if new.status = 'missed'
     and pg_catalog.current_setting('app.guestops_auto_close', true) is distinct from 'true' then
    raise exception using errcode = '42501',
      message = 'Status Lupa diselesaikan hanya boleh ditetapkan oleh reset otomatis.';
  end if;
  if tg_op = 'INSERT' then
    if actor_id is not null then new.created_by := actor_id; end if;
  else
    if new.id is distinct from old.id then
      raise exception using errcode = '42501', message = 'Guest Operations record IDs cannot be changed.';
    end if;
    if new.created_by is distinct from old.created_by then
      raise exception using errcode = '42501', message = 'The original creator identity cannot be changed.';
    end if;
    if new.workspace_id is distinct from old.workspace_id then
      raise exception using errcode = '42501', message = 'A Guest Operations record cannot be moved to another workspace.';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.log_guest_status_change()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    insert into public.guest_status_history(workspace_id, guest_id, status, label, detail, changed_by)
    values (new.workspace_id, new.id, new.status, 'Terdaftar', new.pack::text || ' pack', auth.uid());
  elsif old.status is distinct from new.status then
    insert into public.guest_status_history(workspace_id, guest_id, status, label, detail, reason, changed_by)
    values (
      new.workspace_id, new.id, new.status,
      case new.status
        when 'called' then 'Dipanggil'
        when 'seated' then 'Duduk'
        when 'done' then 'Selesai'
        when 'missed' then 'Lupa diselesaikan'
        when 'cancelled' then 'Dibatalkan'
        else 'Menunggu'
      end,
      case when new.status = 'missed' then 'Otomatis ditutup saat reset operasional 00:00 WIB' else null end,
      case when new.status = 'missed' then 'Antrean belum diselesaikan sampai pergantian tanggal.' else null end,
      auth.uid()
    );
  end if;
  return new;
end;
$function$;

create or replace function private.auto_close_unresolved_guest_waitlist()
returns integer language plpgsql security definer set search_path = ''
as $function$
declare jakarta_today date; affected integer;
begin
  jakarta_today := (pg_catalog.now() at time zone 'Asia/Jakarta')::date;
  perform pg_catalog.set_config('app.guestops_auto_close', 'true', true);
  update public.guests
  set status = 'missed',
      resolved_at = coalesce(resolved_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
  where service_date < jakarta_today
    and status in ('waiting', 'called');
  get diagnostics affected = row_count;
  return affected;
end;
$function$;

revoke all on function private.auto_close_unresolved_guest_waitlist() from public, anon, authenticated;
grant execute on function private.auto_close_unresolved_guest_waitlist() to postgres;

select cron.schedule(
  'guestops-auto-close-unresolved-wl',
  '0 17 * * *',
  'select private.auto_close_unresolved_guest_waitlist();'
);
