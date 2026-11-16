create table if not exists public.reservation_edit_history (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 reservation_id uuid not null references public.reservations(id) on delete cascade,
 before_data jsonb not null, after_data jsonb not null, edited_by uuid,
 edited_at timestamptz not null default clock_timestamp()
);
create index if not exists reservation_edit_history_workspace_reservation_idx
 on public.reservation_edit_history(workspace_id,reservation_id,edited_at desc);
alter table public.reservation_edit_history enable row level security;
drop policy if exists reservation_edit_history_service_read on public.reservation_edit_history;
create policy reservation_edit_history_service_read on public.reservation_edit_history
 for select to authenticated using (public.has_workspace_role(workspace_id,array['service']::text[]));
revoke all on public.reservation_edit_history from public,anon,authenticated;
grant select on public.reservation_edit_history to authenticated;
create or replace function public.log_reservation_edit()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare old_data jsonb; new_data jsonb;
begin
 old_data:=jsonb_build_object('guest_name',old.guest_name,'pack',old.pack,'reservation_date',old.reservation_date,'reservation_time',old.reservation_time,'phone',old.phone,'smoking',old.smoking,'note',old.note);
 new_data:=jsonb_build_object('guest_name',new.guest_name,'pack',new.pack,'reservation_date',new.reservation_date,'reservation_time',new.reservation_time,'phone',new.phone,'smoking',new.smoking,'note',new.note);
 if old_data is distinct from new_data then
  insert into public.reservation_edit_history(workspace_id,reservation_id,before_data,after_data,edited_by,edited_at)
  values(new.workspace_id,new.id,old_data,new_data,auth.uid(),clock_timestamp());
 end if;
 return new;
end;
$function$;
drop trigger if exists reservations_edit_history on public.reservations;
create trigger reservations_edit_history after update of guest_name,pack,reservation_date,reservation_time,phone,smoking,note
 on public.reservations for each row execute function public.log_reservation_edit();
revoke all on function public.log_reservation_edit() from public,anon,authenticated;
