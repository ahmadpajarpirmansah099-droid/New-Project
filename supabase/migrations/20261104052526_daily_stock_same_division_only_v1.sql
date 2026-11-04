-- Enforce strict same-division stock scope for every ledger and Daily SO line.
-- RLS still controls which divisions a user can access; these checks prevent cross-division stock references even for multi-division users.
alter table public.inventory_transaction_lines
  add constraint inventory_transaction_lines_same_division_check
  check (stock_division_id = transaction_division_id);

alter table public.daily_stock_count_lines
  add constraint daily_stock_count_lines_same_division_check
  check (stock_division_id = count_division_id);
