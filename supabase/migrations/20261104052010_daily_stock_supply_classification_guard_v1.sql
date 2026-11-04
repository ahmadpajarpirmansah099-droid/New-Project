-- Keep supplies and regular materials separated by the existing Master Barang flag.
create or replace function public.guard_inventory_stock_kind()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  item_is_supply boolean;
begin
  if new.stock_kind in ('material', 'supply') then
    select i.is_supply
      into item_is_supply
    from public.items i
    where i.id = new.item_id
      and i.workspace_id = new.workspace_id
      and i.division_id = new.stock_division_id;

    if not found then
      raise exception 'Stock item is not available in the selected outlet and division.';
    end if;
    if new.stock_kind = 'supply' and item_is_supply is distinct from true then
      raise exception 'Only items marked as Supplies can use the supply stock category.';
    end if;
    if new.stock_kind = 'material' and item_is_supply is distinct from false then
      raise exception 'Items marked as Supplies cannot use the material stock category.';
    end if;
  end if;
  return new;
end;
$function$;

create trigger inventory_transaction_lines_stock_kind_guard
before insert or update of stock_kind, item_id, workspace_id, stock_division_id
on public.inventory_transaction_lines
for each row execute function public.guard_inventory_stock_kind();

create trigger daily_stock_count_lines_stock_kind_guard
before insert or update of stock_kind, item_id, workspace_id, stock_division_id
on public.daily_stock_count_lines
for each row execute function public.guard_inventory_stock_kind();

revoke all on function public.guard_inventory_stock_kind() from public, anon, authenticated;