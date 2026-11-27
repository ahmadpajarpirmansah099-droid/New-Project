-- A material base unit is locked once Stock Opname has an opening or posting.
-- Conversion edits and items without stock stay free. Rollback only.
-- Run against a database with the baseline schema plus the 2026-11-20 migrations.
\set ON_ERROR_STOP on
begin;

select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',true);

insert into auth.users(id) values
 ('33333333-3333-3333-3333-333333333333')
 on conflict do nothing;
insert into public.workspaces(id,name) values
 ('77777777-7777-7777-7777-777777777777','Uji Satuan')
 on conflict do nothing;
insert into public.divisions(id,workspace_id,name,is_active) values
 ('88888888-8888-8888-8888-888888888888','77777777-7777-7777-7777-777777777777','Bar',true)
 on conflict do nothing;
insert into public.profiles(id,role) values
 ('33333333-3333-3333-3333-333333333333','admin')
 on conflict do nothing;
insert into public.workspace_memberships(workspace_id,user_id,role) values
 ('77777777-7777-7777-7777-777777777777','33333333-3333-3333-3333-333333333333','division_admin')
 on conflict do nothing;
insert into public.workspace_division_memberships(workspace_id,user_id,division_id) values
 ('77777777-7777-7777-7777-777777777777','33333333-3333-3333-3333-333333333333','88888888-8888-8888-8888-888888888888')
 on conflict do nothing;
insert into public.stock_opname_scopes(division_id,workspace_id,enabled) values
 ('88888888-8888-8888-8888-888888888888','77777777-7777-7777-7777-777777777777',true)
 on conflict (division_id) do update set enabled=excluded.enabled;

insert into public.workspace_module_state(workspace_id,division_id,module_key,payload,updated_by) values
 ('77777777-7777-7777-7777-777777777777','88888888-8888-8888-8888-888888888888',
  'master_data:88888888-8888-8888-8888-888888888888',
  jsonb_build_object(
   'active_scope_id','scope-a',
   'masterItems',jsonb_build_array(jsonb_build_object(
    'id','a','nama_barang','Gula','status','active','scope_id','scope-a',
    'satuan_dasar','GR','konversi_satuan',jsonb_build_array(jsonb_build_object('unit','GR','factor',1)),
    'harga_per_satuan_dasar',10,'harga_beli_terakhir_per_satuan_dasar',10
   )),
   'wips','[]'::jsonb,'menus','[]'::jsonb,'wipRecipeLines','[]'::jsonb,'menuRecipeLines','[]'::jsonb
  ),
  '33333333-3333-3333-3333-333333333333');

select private.so_mutate('88888888-8888-8888-8888-888888888888',0,
 'bbbbbbb1-0000-0000-0000-000000000001','initial',
 jsonb_build_object('date','2026-10-01','counts',jsonb_build_object('m:a',jsonb_build_object('qty','100','unit','GR'))));

do $$ declare p jsonb;
begin
 -- A stocked item cannot change its base unit.
 begin
  update public.workspace_module_state
  set payload=jsonb_set(payload,'{masterItems,0,satuan_dasar}','"KG"')
  where division_id='88888888-8888-8888-8888-888888888888'
    and module_key='master_data:88888888-8888-8888-8888-888888888888';
  raise exception 'Regression: base unit changed after Stock Opname';
 exception when others then
  if sqlerrm not like 'Satuan dasar%' then raise; end if;
 end;
 select payload into p from public.workspace_module_state
 where division_id='88888888-8888-8888-8888-888888888888'
   and module_key='master_data:88888888-8888-8888-8888-888888888888';
 if p->'masterItems'->0->>'satuan_dasar'<>'GR' then
  raise exception 'Rejected base-unit change was not rolled back: %',p->'masterItems'->0;
 end if;

 -- The same item keeps ordinary purchase-unit conversions editable.
 update public.workspace_module_state
 set payload=jsonb_set(payload,'{masterItems,0,konversi_satuan}',
  '[{"unit":"GR","factor":1},{"unit":"KG","factor":1000}]'::jsonb)
 where division_id='88888888-8888-8888-8888-888888888888'
   and module_key='master_data:88888888-8888-8888-8888-888888888888';
 select payload into p from public.workspace_module_state
 where division_id='88888888-8888-8888-8888-888888888888'
   and module_key='master_data:88888888-8888-8888-8888-888888888888';
 if p->'masterItems'->0->'konversi_satuan'->1->>'unit'<>'KG' then
  raise exception 'Purchase-unit conversion was blocked: %',p->'masterItems'->0;
 end if;

 -- An item with no Stock Opname reference can still change its base unit.
 update public.workspace_module_state
 set payload=jsonb_set(payload,'{masterItems}',(payload->'masterItems')||jsonb_build_array(
  jsonb_build_object(
   'id','b','nama_barang','Kotak','status','active','scope_id','scope-a',
   'satuan_dasar','PCS','konversi_satuan',jsonb_build_array(jsonb_build_object('unit','PCS','factor',1)),
   'harga_per_satuan_dasar',1000
  )))
 where division_id='88888888-8888-8888-8888-888888888888'
   and module_key='master_data:88888888-8888-8888-8888-888888888888';
 update public.workspace_module_state
 set payload=jsonb_set(payload,'{masterItems,1,satuan_dasar}','"UNIT"')
 where division_id='88888888-8888-8888-8888-888888888888'
   and module_key='master_data:88888888-8888-8888-8888-888888888888';
 select payload into p from public.workspace_module_state
 where division_id='88888888-8888-8888-8888-888888888888'
   and module_key='master_data:88888888-8888-8888-8888-888888888888';
 if p->'masterItems'->1->>'satuan_dasar'<>'UNIT' then
  raise exception 'Unstocked item base unit was blocked: %',p->'masterItems'->1;
 end if;
 raise notice 'Master item base-unit guard scenarios passed';
end $$;

rollback;
