-- Run after schema.sql inside BEGIN, then ROLLBACK. Never install these fixtures.
do $$
declare
 u uuid; w uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); t uuid:=gen_random_uuid();
 c jsonb; counts jsonb:='{"m:a":{"qty":"100","unit":"ML"}}';
 v jsonb; before_source jsonb; before_target jsonb; req uuid; move_id text; tx_day text:=((now() at time zone 'Asia/Jakarta')::date-1)::text;
begin
 select id into u from public.profiles where role='admin' limit 1;
 if u is null then raise exception 'No test administrator available';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into public.workspaces(id,name,created_by) values(w,'Stock Opname regression fixture',u);
 insert into public.divisions(id,workspace_id,name,is_active) values(d,w,'Bar',true),(t,w,'Kitchen',true);
 insert into public.workspace_memberships(workspace_id,user_id,role) values(w,u,'division_admin');
 insert into public.workspace_division_memberships(workspace_id,user_id,division_id) values(w,u,d),(w,u,t);
 insert into public.stock_opname_scopes(division_id,workspace_id,enabled) values(d,w,true),(t,w,true);
 c:='{"active_scope_id":"test","masterItems":[{"id":"a","scope_id":"test","status":"active","nama_barang":"Milk","satuan_dasar":"ML","konversi_satuan":[{"unit":"ML","factor":1}],"harga_per_satuan_dasar":2}],"wips":[],"menus":[],"wipRecipeLines":[],"menuRecipeLines":[]}';
 insert into public.workspace_module_state(workspace_id,division_id,module_key,payload) values(w,d,'master_data:'||d,c),(w,t,'master_data:'||t,c);
 v:=public.stock_opname_write(d,0,gen_random_uuid(),'initial',jsonb_build_object('date',tx_day,'counts',counts));
 perform public.stock_opname_write(t,0,gen_random_uuid(),'initial',jsonb_build_object('date',tx_day,'counts',counts));

 -- A cancelled transfer must not be reversed again after both periods roll over.
 req:=gen_random_uuid();move_id:=req::text;
 v:=public.stock_opname_write(d,(v->>'revision')::bigint,req,'save',jsonb_build_object('type','expense','category','Move','target',t,'mapping','[{"source":"m:a","target":"m:a"}]'::jsonb,'start',tx_day,'end',tx_day,'lines','[{"key":"m:a","qty":"10","unit":"ML"}]'::jsonb));
 req:=gen_random_uuid();
 v:=public.stock_opname_write(d,(v->>'revision')::bigint,req,'void',jsonb_build_object('id',move_id));
 -- An acknowledged cancellation may be safely retried with the same request.
 before_source:=v;before_target:=public.stock_opname_read(t);
 v:=public.stock_opname_write(d,0,req,'void',jsonb_build_object('id',move_id));
 if v is distinct from before_source or public.stock_opname_read(t) is distinct from before_target then raise exception 'Cancellation retry changed stock';end if;
 v:=public.stock_opname_write(d,(v->>'revision')::bigint,gen_random_uuid(),'close',jsonb_build_object('date',tx_day,'counts',counts));
 v:=public.stock_opname_write(d,(v->>'revision')::bigint,gen_random_uuid(),'activate','{}');
 perform public.stock_opname_write(t,(public.stock_opname_read(t)->>'revision')::bigint,gen_random_uuid(),'close',jsonb_build_object('date',tx_day,'counts',counts));
 perform public.stock_opname_write(t,(public.stock_opname_read(t)->>'revision')::bigint,gen_random_uuid(),'activate','{}');
 before_source:=v;before_target:=public.stock_opname_read(t);req:=gen_random_uuid();
 begin
  perform public.stock_opname_write(d,(v->>'revision')::bigint,req,'adjust_move',jsonb_build_object('id',move_id));
  raise exception 'Regression: cancelled Move accepted an adjustment';
 exception when others then if sqlerrm not like 'Transaksi sudah dibatalkan%' then raise;end if;end;
 if public.stock_opname_read(d) is distinct from before_source or public.stock_opname_read(t) is distinct from before_target or exists(select 1 from public.stock_opname_requests where request_id=req) then raise exception 'Rejected adjustment changed stock or request history';end if;

 -- An invalid destination must reject the entire operation before either stock changes.
 req:=gen_random_uuid();
 begin
  perform public.stock_opname_write(d,(v->>'revision')::bigint,req,'save',jsonb_build_object('type','expense','category','Move','start',tx_day,'end',tx_day,'lines','[{"key":"m:a","qty":"10","unit":"ML"}]'::jsonb));
  raise exception 'Regression: Move without destination was posted';
 exception when others then if sqlerrm not like 'Pilih tujuan Move%' then raise;end if;end;
 if public.stock_opname_read(d) is distinct from before_source or public.stock_opname_read(t) is distinct from before_target or exists(select 1 from public.stock_opname_requests where request_id=req) then raise exception 'Rejected Move changed stock or request history';end if;

 -- Only expenses may carry expense categories, even with a stale/malformed client.
 v:=public.stock_opname_write(d,(v->>'revision')::bigint,gen_random_uuid(),'save',jsonb_build_object('type','receipt','category','Move','target',t,'mapping','[{"source":"m:a","target":"m:a"}]'::jsonb,'start',tx_day,'end',tx_day,'lines','[{"key":"m:a","qty":"5","unit":"ML"}]'::jsonb));
 if v->'state'->'documents'->-1->>'category' is not null or (v->'balance'->>'m:a')::numeric<>105 or public.stock_opname_read(t) is distinct from before_target then raise exception 'Non-expense category triggered a Move';end if;
 -- Legacy non-expense categories must not pollute newly calculated movement totals.
 update public.stock_opname_state set payload=jsonb_set(payload,'{documents,1,category}','"Waste"') where division_id=d;
 v:=public.stock_opname_write(d,(v->>'revision')::bigint,gen_random_uuid(),'save',jsonb_build_object('type','expense','category','QC','start',tx_day,'end',tx_day,'lines','[{"key":"m:a","qty":"2","unit":"ML"}]'::jsonb));
 v:=public.stock_opname_write(d,(v->>'revision')::bigint,gen_random_uuid(),'close',jsonb_build_object('date',tx_day,'counts','{"m:a":{"qty":"103","unit":"ML"}}'::jsonb));
 c:=v->'state'->'periods'->-1->'result'->0;
 if (c->'movements'->>'receipt')::numeric is distinct from 5 or (c->'movements'->>'QC')::numeric is distinct from -2 or c->'movements' ? 'Waste' or (c->>'variance')::numeric is distinct from 0 then raise exception 'Receipt/expense movement grouping is incorrect';end if;
 raise notice 'Stock Opname regression scenarios passed';
end $$;
