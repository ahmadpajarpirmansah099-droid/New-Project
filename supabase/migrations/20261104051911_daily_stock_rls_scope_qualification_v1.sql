-- Explicitly qualify parent-scope comparisons in line policies.
drop policy inventory_transaction_lines_insert_draft on public.inventory_transaction_lines;
create policy inventory_transaction_lines_insert_draft on public.inventory_transaction_lines for insert to authenticated
  with check (
    public.has_division_access(workspace_id, transaction_division_id)
    and public.has_division_access(workspace_id, stock_division_id)
    and exists (
      select 1 from public.inventory_transactions t
      where t.id = inventory_transaction_lines.transaction_id
        and t.workspace_id = inventory_transaction_lines.workspace_id
        and t.division_id = inventory_transaction_lines.transaction_division_id
        and t.status = 'draft'
    )
  );

drop policy inventory_transaction_lines_delete_draft on public.inventory_transaction_lines;
create policy inventory_transaction_lines_delete_draft on public.inventory_transaction_lines for delete to authenticated
  using (
    public.has_division_access(workspace_id, transaction_division_id)
    and public.has_division_access(workspace_id, stock_division_id)
    and exists (
      select 1 from public.inventory_transactions t
      where t.id = inventory_transaction_lines.transaction_id
        and t.workspace_id = inventory_transaction_lines.workspace_id
        and t.division_id = inventory_transaction_lines.transaction_division_id
        and t.status = 'draft'
    )
  );

drop policy daily_stock_count_lines_insert_draft on public.daily_stock_count_lines;
create policy daily_stock_count_lines_insert_draft on public.daily_stock_count_lines for insert to authenticated
  with check (
    public.has_division_access(workspace_id, count_division_id)
    and public.has_division_access(workspace_id, stock_division_id)
    and exists (
      select 1 from public.daily_stock_counts c
      where c.id = daily_stock_count_lines.count_id
        and c.workspace_id = daily_stock_count_lines.workspace_id
        and c.division_id = daily_stock_count_lines.count_division_id
        and c.status = 'draft'
    )
  );

drop policy daily_stock_count_lines_delete_draft on public.daily_stock_count_lines;
create policy daily_stock_count_lines_delete_draft on public.daily_stock_count_lines for delete to authenticated
  using (
    public.has_division_access(workspace_id, count_division_id)
    and public.has_division_access(workspace_id, stock_division_id)
    and exists (
      select 1 from public.daily_stock_counts c
      where c.id = daily_stock_count_lines.count_id
        and c.workspace_id = daily_stock_count_lines.workspace_id
        and c.division_id = daily_stock_count_lines.count_division_id
        and c.status = 'draft'
    )
  );