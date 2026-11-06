-- Daily SO stock IDs resolve against the existing division-scoped workspace_module_state JSON catalog.
alter table public.inventory_transaction_lines drop constraint inventory_transaction_lines_item_fk, drop constraint inventory_transaction_lines_wip_fk;
alter table public.daily_stock_count_lines drop constraint daily_stock_count_lines_item_fk, drop constraint daily_stock_count_lines_wip_fk;
drop index if exists public.inventory_transaction_lines_item_fk_idx;
drop index if exists public.inventory_transaction_lines_wip_fk_idx;
drop index if exists public.daily_stock_count_lines_item_fk_idx;
drop index if exists public.daily_stock_count_lines_wip_fk_idx;
drop index if exists public.items_workspace_division_id_uidx;
drop index if exists public.wip_recipes_workspace_division_id_uidx;

create or replace function public.guard_inventory_stock_kind()
returns trigger language plpgsql set search_path = public, pg_temp as $function$
declare catalog_payload jsonb; item_is_supply boolean; catalog_item_found boolean := false;
begin
  select s.payload into catalog_payload from public.workspace_module_state s
  where s.workspace_id = new.workspace_id and s.division_id = new.stock_division_id
    and s.module_key = 'master_data:' || new.stock_division_id::text;
  if not found or catalog_payload is null then raise exception 'Master Data catalog is not available for the selected outlet and division.'; end if;
  if new.stock_kind in ('material','supply') then
    select coalesce((entry->>'is_supply')::boolean,false) into item_is_supply
    from jsonb_array_elements(coalesce(catalog_payload->'masterItems','[]'::jsonb)) as entry
    where entry->>'id' = new.item_id::text limit 1;
    catalog_item_found := found;
    if not catalog_item_found then raise exception 'Master Barang item was not found in the selected division.'; end if;
    if new.stock_kind = 'supply' and item_is_supply is distinct from true then raise exception 'Only items marked as Supplies can use the supply stock category.'; end if;
    if new.stock_kind = 'material' and item_is_supply is distinct from false then raise exception 'Items marked as Supplies cannot use the material stock category.'; end if;
  elsif new.stock_kind = 'wip' then
    if not exists (select 1 from jsonb_array_elements(coalesce(catalog_payload->'wips','[]'::jsonb)) as entry where entry->>'id' = new.wip_recipe_id::text) then
      raise exception 'WIP was not found in the selected division.';
    end if;
  end if;
  return new;
end;
$function$;
comment on column public.inventory_transaction_lines.item_id is 'UUID from the division-scoped Master Data JSON catalog; historical references are retained without FK to normalized tables.';
comment on column public.inventory_transaction_lines.wip_recipe_id is 'UUID from the division-scoped WIP JSON catalog; historical references are retained without FK to normalized tables.';
comment on column public.daily_stock_count_lines.item_id is 'UUID from the division-scoped Master Data JSON catalog; historical references are retained without FK to normalized tables.';
comment on column public.daily_stock_count_lines.wip_recipe_id is 'UUID from the division-scoped WIP JSON catalog; historical references are retained without FK to normalized tables.';