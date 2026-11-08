-- Remove the Daily SO and stock-transaction subsystem.
-- Master Barang, WIP recipes, Menu recipes, and workspace_module_state are intentionally preserved.
-- Historical Daily SO documents and lines are intentionally deleted by dropping their tables.

begin;

drop table if exists public.daily_stock_count_lines;
drop table if exists public.daily_stock_counts;
drop table if exists public.inventory_transaction_lines;
drop table if exists public.inventory_transactions;

drop function if exists public.guard_daily_stock_count_close();
drop function if exists public.guard_inventory_transaction_post();
drop function if exists public.guard_inventory_stock_kind();

commit;
