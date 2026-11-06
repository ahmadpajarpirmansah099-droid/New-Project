-- Harden state transitions and prevent moving lines into finalized documents.
drop policy inventory_transactions_update_draft on public.inventory_transactions;
create policy inventory_transactions_update_draft on public.inventory_transactions for update to authenticated
  using (public.has_division_access(workspace_id, division_id) and status = 'draft')
  with check (
    public.has_division_access(workspace_id, division_id)
    and (status = 'draft' or (status = 'posted' and posted_by = (select auth.uid()) and posted_at is not null))
  );

drop policy inventory_transaction_lines_update_draft on public.inventory_transaction_lines;
create policy inventory_transaction_lines_update_draft on public.inventory_transaction_lines for update to authenticated
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
  )
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

drop policy daily_stock_counts_update_draft on public.daily_stock_counts;
create policy daily_stock_counts_update_draft on public.daily_stock_counts for update to authenticated
  using (public.has_division_access(workspace_id, division_id) and status = 'draft')
  with check (
    public.has_division_access(workspace_id, division_id)
    and (status = 'draft' or (status = 'closed' and closed_by = (select auth.uid()) and closed_at is not null))
  );

drop policy daily_stock_count_lines_update_draft on public.daily_stock_count_lines;
create policy daily_stock_count_lines_update_draft on public.daily_stock_count_lines for update to authenticated
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
  )
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

alter table public.daily_stock_count_lines
  add constraint daily_stock_count_lines_opening_nonnegative check (opening_quantity >= 0);
