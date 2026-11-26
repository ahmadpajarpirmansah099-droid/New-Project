-- Run after the baseline, calendar-month migrations, and invoice-baseline migration.
-- All principals and records below are disposable; nothing survives rollback.
\set ON_ERROR_STOP on
begin;
do $$
declare
 u uuid:=gen_random_uuid(); w uuid:=gen_random_uuid(); d uuid;
 a uuid; b uuid; req uuid; optional_id uuid; v jsonb; before_retry jsonb; snapshot_a jsonb;
 scenario text; day date:=(date_trunc('month',now() at time zone 'Asia/Jakarta')-interval '1 month')::date;
 actual numeric; expected numeric; first_id uuid; last_id uuid;
begin
 insert into auth.users(id) values(u);
 insert into public.profiles(id,role) values(u,'admin');
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into public.workspaces(id,name,created_by) values(w,'Invoice rollback fixture',u);
 insert into public.workspace_memberships(workspace_id,user_id,role) values(w,u,'division_admin');

 foreach scenario in array array['forward','reverse','remove_invoice','legacy','legacy_remove_invoice','backdated','new_cycle','optional_receipt'] loop
  d:=gen_random_uuid(); a:=gen_random_uuid(); b:=gen_random_uuid(); expected:=50;
  insert into public.divisions(id,workspace_id,name,is_active) values(d,w,scenario,true);
  insert into public.workspace_division_memberships(workspace_id,user_id,division_id) values(w,u,d);
  insert into public.stock_opname_scopes(division_id,workspace_id,enabled) values(d,w,true);
  insert into public.workspace_module_state(workspace_id,division_id,module_key,payload)
  values(w,d,'master_data:'||d,'{
   "active_scope_id":"test","masterItems":[{
    "id":"a","scope_id":"test","status":"active","nama_barang":"Susu","satuan_dasar":"ML",
    "konversi_satuan":[{"unit":"ML","factor":1},{"unit":"BOX","factor":100}],
    "harga_per_satuan_dasar":50,"harga_beli_terakhir_per_satuan_dasar":null
   }],"wips":[],"menus":[],"wipRecipeLines":[],"menuRecipeLines":[]
  }');

  execute 'set local role authenticated';
  v:=public.stock_opname_write(d,0,gen_random_uuid(),'initial',
   jsonb_build_object('date',day,'counts','{"m:a":{"qty":"1000","unit":"ML"}}'::jsonb));
  if scenario='optional_receipt' then
   optional_id:=gen_random_uuid();
   v:=public.stock_opname_write(d,(v->>'revision')::bigint,optional_id,'save',
    jsonb_build_object('type','receipt','start',day,'end',day,'lines','[{"key":"m:a","qty":"1","unit":"ML"}]'::jsonb));
   execute 'reset role';
   update public.workspace_module_state set payload=jsonb_set(payload,'{masterItems,0,harga_per_satuan_dasar}','75')
    where division_id=d and module_key='master_data:'||d;
   execute 'set local role authenticated';
   expected:=75;
  end if;
  v:=public.stock_opname_write(d,(v->>'revision')::bigint,a,'save',
   jsonb_build_object('type','receipt','start',day+1,'end',day+1,
    'lines','[{"key":"m:a","qty":"2","unit":"BOX","invoice_total":"20000"}]'::jsonb));
  select value->'catalog_snapshot' into snapshot_a from jsonb_array_elements(v->'state'->'documents') value where value->>'id'=a::text;
  v:=public.stock_opname_write(d,(v->>'revision')::bigint,b,'save',
   jsonb_build_object('type','receipt','start',case when scenario='backdated' then day else day+2 end,
    'end',case when scenario='backdated' then day else day+2 end,
    'lines','[{"key":"m:a","qty":"1","unit":"ML","invoice_total":"200"}]'::jsonb));

  if scenario in ('legacy','legacy_remove_invoice') then
   -- Emulate records written before the baseline field existed.
   execute 'reset role';
   update public.stock_opname_state set payload=payload-'invoice_base_prices' where division_id=d;
   execute 'set local role authenticated';
  end if;
  first_id:=case when scenario='reverse' then b else a end;
  last_id:=case when scenario='reverse' then a else b end;
  if scenario in ('remove_invoice','legacy_remove_invoice') then
   v:=public.stock_opname_write(d,(v->>'revision')::bigint,gen_random_uuid(),'save',
    jsonb_build_object('id',a,'type','receipt','start',day+1,'end',day+1,
     'lines','[{"key":"m:a","qty":"2","unit":"BOX","invoice_total":""}]'::jsonb));
  else
   v:=public.stock_opname_write(d,(v->>'revision')::bigint,gen_random_uuid(),'void',jsonb_build_object('id',first_id));
  end if;
  select (value->>'price')::numeric into actual from jsonb_array_elements(v->'catalog') value where value->>'key'='m:a';
  if actual is distinct from (case when scenario='reverse' then 100 else 200 end) then
   raise exception 'Surviving invoice price mismatch (%): %',scenario,actual;
  end if;

  req:=gen_random_uuid();
  v:=public.stock_opname_write(d,(v->>'revision')::bigint,req,'void',jsonb_build_object('id',last_id));
  select (value->>'price')::numeric into actual from jsonb_array_elements(v->'catalog') value where value->>'key'='m:a';
  if actual is distinct from expected then
   raise exception 'Original price not restored (%): expected %, got %',scenario,expected,actual;
  end if;
  if snapshot_a is distinct from (
   select value->'catalog_snapshot' from jsonb_array_elements(v->'state'->'documents') value where value->>'id'=a::text
  ) then raise exception 'Invoice snapshot was rewritten (%)',scenario; end if;
  before_retry:=v;
  v:=public.stock_opname_write(d,0,req,'void',jsonb_build_object('id',last_id));
  if v is distinct from before_retry then raise exception 'Cancellation retry changed state (%)',scenario; end if;

  if scenario='new_cycle' then
   execute 'reset role';
   update public.workspace_module_state set payload=jsonb_set(
    jsonb_set(payload,'{masterItems,0,harga_per_satuan_dasar}','75'),
    '{masterItems,0,harga_beli_terakhir_per_satuan_dasar}','null')
    where division_id=d and module_key='master_data:'||d;
   execute 'set local role authenticated';
   req:=gen_random_uuid();
   v:=public.stock_opname_write(d,(v->>'revision')::bigint,req,'save',
    jsonb_build_object('type','receipt','start',day+3,'end',day+3,
     'lines','[{"key":"m:a","qty":"1","unit":"ML","invoice_total":"300"}]'::jsonb));
   v:=public.stock_opname_write(d,(v->>'revision')::bigint,gen_random_uuid(),'void',jsonb_build_object('id',req));
   select (value->>'price')::numeric into actual from jsonb_array_elements(v->'catalog') value where value->>'key'='m:a';
   if actual is distinct from 75 then raise exception 'New invoice cycle discarded the manual price: %',actual; end if;
  end if;
  if scenario='optional_receipt' then
   execute 'reset role';
   update public.workspace_module_state set payload=jsonb_set(
    jsonb_set(payload,'{masterItems,0,harga_per_satuan_dasar}','90'),
    '{masterItems,0,harga_beli_terakhir_per_satuan_dasar}','null')
    where division_id=d and module_key='master_data:'||d;
   execute 'set local role authenticated';
   v:=public.stock_opname_write(d,(v->>'revision')::bigint,gen_random_uuid(),'void',jsonb_build_object('id',optional_id));
   select (value->>'price')::numeric into actual from jsonb_array_elements(v->'catalog') value where value->>'key'='m:a';
   if actual is distinct from 90 then raise exception 'Non-invoice cancellation changed the manual price: %',actual; end if;
  end if;
  execute 'reset role';
  raise notice 'Invoice cancellation scenario passed: %',scenario;
 end loop;
end $$;
rollback;
