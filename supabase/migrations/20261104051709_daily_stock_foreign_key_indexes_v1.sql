-- Cover foreign-key lookups for new inventory tables.
create index inventory_transaction_lines_header_fk_idx on public.inventory_transaction_lines (transaction_id, workspace_id, transaction_division_id);
create index inventory_transaction_lines_item_fk_idx on public.inventory_transaction_lines (workspace_id, stock_division_id, item_id);
create index inventory_transaction_lines_wip_fk_idx on public.inventory_transaction_lines (workspace_id, stock_division_id, wip_recipe_id);
create index daily_stock_count_lines_header_fk_idx on public.daily_stock_count_lines (count_id, workspace_id, count_division_id);
create index daily_stock_count_lines_item_fk_idx on public.daily_stock_count_lines (workspace_id, stock_division_id, item_id);
create index daily_stock_count_lines_wip_fk_idx on public.daily_stock_count_lines (workspace_id, stock_division_id, wip_recipe_id);
create index inventory_transactions_created_by_idx on public.inventory_transactions (created_by);
create index inventory_transactions_posted_by_idx on public.inventory_transactions (posted_by);
create index daily_stock_counts_created_by_idx on public.daily_stock_counts (created_by);
create index daily_stock_counts_closed_by_idx on public.daily_stock_counts (closed_by);
