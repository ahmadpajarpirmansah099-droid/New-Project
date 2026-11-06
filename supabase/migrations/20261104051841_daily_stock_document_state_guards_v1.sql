-- Require complete source lines before posting or closing a stock document.
create or replace function public.guard_inventory_transaction_post()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if old.status <> 'draft' then
    raise exception 'Only draft inventory transactions can change state.';
  end if;

  if new.status = 'posted' then
    if new.posted_by is distinct from (select auth.uid()) or new.posted_at is null then
      raise exception 'Posting must be confirmed by the signed-in user.';
    end if;
    if not exists (
      select 1
      from public.inventory_transaction_lines l
      where l.transaction_id = old.id
        and l.workspace_id = old.workspace_id
        and l.transaction_division_id = old.division_id
    ) then
      raise exception 'An inventory transaction needs at least one stock movement line before posting.';
    end if;
  end if;

  return new;
end;
$function$;

create or replace function public.guard_daily_stock_count_close()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if old.status <> 'draft' then
    raise exception 'Only draft Daily SO documents can change state.';
  end if;

  if new.status = 'closed' then
    if new.closed_by is distinct from (select auth.uid()) or new.closed_at is null then
      raise exception 'Closing must be confirmed by the signed-in user.';
    end if;
    if not exists (
      select 1
      from public.daily_stock_count_lines l
      where l.count_id = old.id
        and l.workspace_id = old.workspace_id
        and l.count_division_id = old.division_id
    ) then
      raise exception 'A Daily SO needs at least one stock count line before closing.';
    end if;
    if exists (
      select 1
      from public.daily_stock_count_lines l
      where l.count_id = old.id
        and l.workspace_id = old.workspace_id
        and l.count_division_id = old.division_id
        and l.physical_closing_quantity is null
    ) then
      raise exception 'Every Daily SO line needs a physical closing quantity before closing.';
    end if;
  end if;

  return new;
end;
$function$;

create trigger inventory_transactions_guard_post
before update of status on public.inventory_transactions
for each row execute function public.guard_inventory_transaction_post();

create trigger daily_stock_counts_guard_close
before update of status on public.daily_stock_counts
for each row execute function public.guard_daily_stock_count_close();

revoke all on function public.guard_inventory_transaction_post() from public, anon, authenticated;
revoke all on function public.guard_daily_stock_count_close() from public, anon, authenticated;