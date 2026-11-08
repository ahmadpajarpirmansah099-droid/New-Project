-- Remove the complete Daily SO and inventory transaction subsystem.
-- Master Barang, WIP, WIP recipes, Menu, and workspace_module_state are intentionally retained.
-- Historical migration files remain unchanged; this is an additive teardown migration.

begin;

drop table if exists public.daily_stock_count_lines;
drop table if exists public.daily_stock_counts;
drop table if exists public.inventory_transaction_lines;
drop table if exists public.inventory_transactions;

drop function if exists public.guard_daily_stock_count_close();
drop function if exists public.guard_inventory_transaction_post();
drop function if exists public.guard_inventory_stock_kind();

commit;
