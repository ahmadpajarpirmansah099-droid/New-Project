-- RLS does not protect TRUNCATE; expose only row-level CRUD to signed-in users.
revoke all on table
  public.inventory_transactions,
  public.inventory_transaction_lines,
  public.daily_stock_counts,
  public.daily_stock_count_lines
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.inventory_transactions,
  public.inventory_transaction_lines,
  public.daily_stock_counts,
  public.daily_stock_count_lines
to authenticated;