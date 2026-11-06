-- Daily Stock Opname and inventory ledger foundation.
-- Workspace currently represents an outlet; every row is also division-scoped.

create unique index if not exists divisions_workspace_id_id_uidx on public.divisions (workspace_id, id);
create unique index if not exists items_workspace_division_id_uidx on public.items (workspace_id, division_id, id);
create unique index if not exists wip_recipes_workspace_division_id_uidx on public.wip_recipes (workspace_id, division_id, id);

create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  division_id uuid not null,
  transaction_date date not null default current_date,
  transaction_type text not null check (transaction_type in ('opening','purchase','expense','wip_production','wip_usage','sale','supply_purchase','supply_usage','waste','adjustment','transfer_in','transfer_out')),
  status text not null default 'draft' check (status in ('draft','posted','void')),
  reference_code text,
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  posted_by uuid references auth.users(id) on delete restrict,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_transactions_workspace_division_fk foreign key (workspace_id, division_id) references public.divisions (workspace_id, id) on delete restrict,
  constraint inventory_transactions_id_scope_uidx unique (id, workspace_id, division_id),
  constraint inventory_transactions_post_state_check check (
    (status = 'posted' and posted_at is not null and posted_by is not null)
    or (status <> 'posted' and posted_at is null and posted_by is null)
  )
);

create table public.inventory_transaction_lines (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null,
  workspace_id uuid not null,
  transaction_division_id uuid not null,
  stock_division_id uuid not null,
  stock_kind text not null check (stock_kind in ('material','supply','wip')),
  item_id uuid,
  wip_recipe_id uuid,
  direction text not null check (direction in ('in','out')),
  quantity numeric(20,6) not null check (quantity > 0),
  unit_name_snapshot text not null,
  factor_to_base_snapshot numeric(20,8) not null default 1 check (factor_to_base_snapshot > 0),
  base_quantity numeric(24,8) generated always as (quantity * factor_to_base_snapshot) stored,
  unit_cost_snapshot numeric(20,6) check (unit_cost_snapshot is null or unit_cost_snapshot >= 0),
  notes text,
  created_at timestamptz not null default now(),
  constraint inventory_transaction_lines_target_check check (
    (stock_kind in ('material','supply') and item_id is not null and wip_recipe_id is null)
    or (stock_kind = 'wip' and wip_recipe_id is not null and item_id is null)
  ),
  constraint inventory_transaction_lines_header_fk foreign key (transaction_id, workspace_id, transaction_division_id)
    references public.inventory_transactions (id, workspace_id, division_id) on delete cascade,
  constraint inventory_transaction_lines_stock_division_fk foreign key (workspace_id, stock_division_id)
    references public.divisions (workspace_id, id) on delete restrict,
  constraint inventory_transaction_lines_item_fk foreign key (workspace_id, stock_division_id, item_id)
    references public.items (workspace_id, division_id, id) on delete restrict,
  constraint inventory_transaction_lines_wip_fk foreign key (workspace_id, stock_division_id, wip_recipe_id)
    references public.wip_recipes (workspace_id, division_id, id) on delete restrict
);

create table public.daily_stock_counts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  division_id uuid not null,
  stock_date date not null,
  status text not null default 'draft' check (status in ('draft','closed')),
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  closed_by uuid references auth.users(id) on delete restrict,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_stock_counts_workspace_division_fk foreign key (workspace_id, division_id)
    references public.divisions (workspace_id, id) on delete restrict,
  constraint daily_stock_counts_scope_date_key unique (workspace_id, division_id, stock_date),
  constraint daily_stock_counts_id_scope_uidx unique (id, workspace_id, division_id),
  constraint daily_stock_counts_close_state_check check (
    (status = 'draft' and closed_at is null and closed_by is null)
    or (status = 'closed' and closed_at is not null and closed_by is not null)
  )
);

create table public.daily_stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null,
  workspace_id uuid not null,
  count_division_id uuid not null,
  stock_division_id uuid not null,
  stock_kind text not null check (stock_kind in ('material','supply','wip')),
  item_id uuid,
  wip_recipe_id uuid,
  unit_name_snapshot text not null,
  opening_quantity numeric(24,8) not null default 0,
  inbound_quantity numeric(24,8) not null default 0 check (inbound_quantity >= 0),
  outbound_quantity numeric(24,8) not null default 0 check (outbound_quantity >= 0),
  expected_closing_quantity numeric(24,8) generated always as (opening_quantity + inbound_quantity - outbound_quantity) stored,
  physical_closing_quantity numeric(24,8) check (physical_closing_quantity is null or physical_closing_quantity >= 0),
  variance_quantity numeric(24,8) generated always as (physical_closing_quantity - (opening_quantity + inbound_quantity - outbound_quantity)) stored,
  unit_cost_snapshot numeric(20,6) check (unit_cost_snapshot is null or unit_cost_snapshot >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_stock_count_lines_target_check check (
    (stock_kind in ('material','supply') and item_id is not null and wip_recipe_id is null)
    or (stock_kind = 'wip' and wip_recipe_id is not null and item_id is null)
  ),
  constraint daily_stock_count_lines_header_fk foreign key (count_id, workspace_id, count_division_id)
    references public.daily_stock_counts (id, workspace_id, division_id) on delete cascade,
  constraint daily_stock_count_lines_stock_division_fk foreign key (workspace_id, stock_division_id)
    references public.divisions (workspace_id, id) on delete restrict,
  constraint daily_stock_count_lines_item_fk foreign key (workspace_id, stock_division_id, item_id)
    references public.items (workspace_id, division_id, id) on delete restrict,
  constraint daily_stock_count_lines_wip_fk foreign key (workspace_id, stock_division_id, wip_recipe_id)
    references public.wip_recipes (workspace_id, division_id, id) on delete restrict
);

create index inventory_transactions_scope_date_idx on public.inventory_transactions (workspace_id, division_id, transaction_date desc);
create index inventory_transaction_lines_transaction_idx on public.inventory_transaction_lines (transaction_id);
create index inventory_transaction_lines_stock_idx on public.inventory_transaction_lines (workspace_id, stock_division_id, stock_kind, item_id, wip_recipe_id);
create index daily_stock_counts_scope_date_idx on public.daily_stock_counts (workspace_id, division_id, stock_date desc);
create index daily_stock_count_lines_count_idx on public.daily_stock_count_lines (count_id);
create index daily_stock_count_lines_stock_idx on public.daily_stock_count_lines (workspace_id, stock_division_id, stock_kind, item_id, wip_recipe_id);

alter table public.inventory_transactions enable row level security;
alter table public.inventory_transaction_lines enable row level security;
alter table public.daily_stock_counts enable row level security;
alter table public.daily_stock_count_lines enable row level security;

grant select, insert, update, delete on public.inventory_transactions to authenticated;
grant select, insert, update, delete on public.inventory_transaction_lines to authenticated;
grant select, insert, update, delete on public.daily_stock_counts to authenticated;
grant select, insert, update, delete on public.daily_stock_count_lines to authenticated;

create policy inventory_transactions_read on public.inventory_transactions for select to authenticated
  using (public.has_division_access(workspace_id, division_id));
create policy inventory_transactions_insert on public.inventory_transactions for insert to authenticated
  with check (public.has_division_access(workspace_id, division_id) and created_by = (select auth.uid()) and status = 'draft');
create policy inventory_transactions_update_draft on public.inventory_transactions for update to authenticated
  using (public.has_division_access(workspace_id, division_id) and status = 'draft')
  with check (public.has_division_access(workspace_id, division_id));
create policy inventory_transactions_delete_draft on public.inventory_transactions for delete to authenticated
  using (public.has_division_access(workspace_id, division_id) and status = 'draft');

create policy inventory_transaction_lines_read on public.inventory_transaction_lines for select to authenticated
  using (public.has_division_access(workspace_id, transaction_division_id) and public.has_division_access(workspace_id, stock_division_id));
create policy inventory_transaction_lines_insert_draft on public.inventory_transaction_lines for insert to authenticated
  with check (
    public.has_division_access(workspace_id, transaction_division_id)
    and public.has_division_access(workspace_id, stock_division_id)
    and exists (select 1 from public.inventory_transactions t where t.id = transaction_id and t.workspace_id = workspace_id and t.division_id = transaction_division_id and t.status = 'draft')
  );
create policy inventory_transaction_lines_update_draft on public.inventory_transaction_lines for update to authenticated
  using (
    public.has_division_access(workspace_id, transaction_division_id)
    and public.has_division_access(workspace_id, stock_division_id)
    and exists (select 1 from public.inventory_transactions t where t.id = transaction_id and t.workspace_id = workspace_id and t.division_id = transaction_division_id and t.status = 'draft')
  )
  with check (public.has_division_access(workspace_id, transaction_division_id) and public.has_division_access(workspace_id, stock_division_id));
create policy inventory_transaction_lines_delete_draft on public.inventory_transaction_lines for delete to authenticated
  using (
    public.has_division_access(workspace_id, transaction_division_id)
    and public.has_division_access(workspace_id, stock_division_id)
    and exists (select 1 from public.inventory_transactions t where t.id = transaction_id and t.workspace_id = workspace_id and t.division_id = transaction_division_id and t.status = 'draft')
  );

create policy daily_stock_counts_read on public.daily_stock_counts for select to authenticated
  using (public.has_division_access(workspace_id, division_id));
create policy daily_stock_counts_insert on public.daily_stock_counts for insert to authenticated
  with check (public.has_division_access(workspace_id, division_id) and created_by = (select auth.uid()) and status = 'draft');
create policy daily_stock_counts_update_draft on public.daily_stock_counts for update to authenticated
  using (public.has_division_access(workspace_id, division_id) and status = 'draft')
  with check (public.has_division_access(workspace_id, division_id) and status in ('draft','closed'));
create policy daily_stock_counts_delete_draft on public.daily_stock_counts for delete to authenticated
  using (public.has_division_access(workspace_id, division_id) and status = 'draft');

create policy daily_stock_count_lines_read on public.daily_stock_count_lines for select to authenticated
  using (public.has_division_access(workspace_id, count_division_id) and public.has_division_access(workspace_id, stock_division_id));
create policy daily_stock_count_lines_insert_draft on public.daily_stock_count_lines for insert to authenticated
  with check (
    public.has_division_access(workspace_id, count_division_id)
    and public.has_division_access(workspace_id, stock_division_id)
    and exists (select 1 from public.daily_stock_counts c where c.id = count_id and c.workspace_id = workspace_id and c.division_id = count_division_id and c.status = 'draft')
  );
create policy daily_stock_count_lines_update_draft on public.daily_stock_count_lines for update to authenticated
  using (
    public.has_division_access(workspace_id, count_division_id)
    and public.has_division_access(workspace_id, stock_division_id)
    and exists (select 1 from public.daily_stock_counts c where c.id = count_id and c.workspace_id = workspace_id and c.division_id = count_division_id and c.status = 'draft')
  )
  with check (public.has_division_access(workspace_id, count_division_id) and public.has_division_access(workspace_id, stock_division_id));
create policy daily_stock_count_lines_delete_draft on public.daily_stock_count_lines for delete to authenticated
  using (
    public.has_division_access(workspace_id, count_division_id)
    and public.has_division_access(workspace_id, stock_division_id)
    and exists (select 1 from public.daily_stock_counts c where c.id = count_id and c.workspace_id = workspace_id and c.division_id = count_division_id and c.status = 'draft')
  );

comment on table public.inventory_transactions is 'Outlet/division-scoped stock transaction headers. Posted transactions are immutable through row policies.';
comment on table public.inventory_transaction_lines is 'Stock movement lines. Quantity is converted using a saved factor snapshot; cross-division movement requires access to both divisions.';
comment on table public.daily_stock_counts is 'One Daily SO per outlet, division, and date. Closed counts are immutable through row policies.';
comment on table public.daily_stock_count_lines is 'Daily SO line snapshots. Expected and variance quantities are generated from saved quantities.';
