-- Run after schema.sql inside BEGIN, then ROLLBACK. No fixture survives.
do $$
declare
 u uuid;w uuid:=gen_random_uuid();d uuid:=gen_random_uuid();t uuid:=gen_random_uuid();c jsonb;
 v jsonb;req uuid;docid text;moveid text;rev bigint;start_day text:=((now() at time zone 'Asia/Jakarta')::date-10)::text;
 day text:=((now() at time zone 'Asia/Jakarta')::date-1)::text; n int:=0;
begin
 select id into u from public.profiles where role='admin' limit 1;
 if u is null then raise exception 'No test administrator available';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into public.workspaces(id,name,created_by) values(w,'Stock Opname rollback fixture',u);
 insert into public.divisions(id,workspace_id,name,is_active) values(d,w,'Bar',true),(t,w,'Kitchen',true);
 insert into public.workspace_memberships(workspace_id,user_id,role) values(w,u,'division_admin');
 insert into public.workspace_division_memberships(workspace_id,user_id,division_id) values(w,u,d),(w,u,t);
 insert into public.stock_opname_scopes(division_id,workspace_id,enabled) values(d,w,true),(t,w,true);
 c:='{"active_scope_id":"test","schema_version":1,"masterItems":[{"id":"a","scope_id":"test","status":"active","nama_barang":"Milk","satuan_dasar":"ML","konversi_satuan":[{"unit":"ML","factor":1},{"unit":"BOX","factor":100}],"harga_per_satuan_dasar":2},{"id":"b","scope_id":"test","status":"active","nama_barang":"Sugar","satuan_dasar":"GR","konversi_satuan":[{"unit":"GR","factor":1}],"harga_per_satuan_dasar":3}],"wips":[{"id":"x","scope_id":"test","status":"active","nama_wip":"Mix","satuan_hasil":"ML","hasil_per_batch":100}],"wipRecipeLines":[{"wip_id":"x","component_type":"material","item_id":"a","qty_input":10,"unit_input":"ML"}],"menus":[{"id":"coffee","scope_id":"test","status":"active","nama_menu":"Coffee"}],"menuRecipeLines":[{"menu_id":"coffee","component_type":"wip","component_wip_id":"x","qty_input":5,"unit_input":"ML"},{"menu_id":"coffee","component_type":"material","item_id":"b","qty_input":2,"unit_input":"GR"}]}'::jsonb;
 insert into public.workspace_module_state(workspace_id,division_id,module_key,payload) values(w,d,'master_data:'||d,c),(w,t,'master_data:'||t,c);
 v:=public.stock_opname_write(d,0,gen_random_uuid(),'initial',jsonb_build_object('date',start_day,'counts','{"m:a":{"qty":"1000","unit":"ML"},"m:b":{"qty":"1000","unit":"GR"},"w:x":{"qty":"100","unit":"ML"}}'::jsonb));
 perform public.stock_opname_write(t,0,gen_random_uuid(),'initial',jsonb_build_object('date',start_day,'counts','{"m:a":{"qty":"1000","unit":"ML"},"m:b":{"qty":"1000","unit":"GR"},"w:x":{"qty":"100","unit":"ML"}}'::jsonb));
 req:=gen_random_uuid();v:=public.stock_opname_write(d,(v->>'revision')::bigint,req,'save',jsonb_build_object('type','production','category','Waste','start',day,'end',day,'lines','[{"key":"w:x","qty":"2"}]'::jsonb));
 if (v->'balance'->>'m:a')::numeric<>980 or (v->'balance'->>'w:x')::numeric<>300 then raise exception 'Production calculation failed';end if;n:=n+1;
 rev:=(v->>'revision')::bigint;v:=public.stock_opname_write(d,0,req,'save',jsonb_build_object('type','production','category','Waste','start',day,'end',day,'lines','[{"key":"w:x","qty":"2"}]'::jsonb));
 if (v->>'revision')::bigint<>rev then raise exception 'Request retry duplicated';end if;n:=n+1;
 v:=public.stock_opname_write(d,rev,gen_random_uuid(),'save',jsonb_build_object('type','sales','category','Waste','start',day,'end',day,'lines','[{"key":"s:coffee","qty":"10"}]'::jsonb));
 if (v->'balance'->>'m:a')::numeric<>980 or (v->'balance'->>'w:x')::numeric<>250 or (v->'balance'->>'m:b')::numeric<>980 then raise exception 'Sales double-consumed WIP ingredients';end if;n:=n+1;
 begin perform public.stock_opname_write(d,(v->>'revision')::bigint,gen_random_uuid(),'save',jsonb_build_object('type','sales','category','Waste','start',day,'end',day,'lines','[{"key":"s:coffee","qty":"1"}]'::jsonb));raise exception 'Expected overlap failure';exception when others then if sqlerrm not like 'SALES_OVERLAP:%' then raise;end if;end;n:=n+1;
 v:=public.stock_opname_write(d,(v->>'revision')::bigint,gen_random_uuid(),'save',jsonb_build_object('type','receipt','category','Waste','start',day,'end',day,'lines','[{"key":"m:a","qty":"2","unit":"BOX","invoice_total":"1000"}]'::jsonb));
 if (v->'balance'->>'m:a')::numeric<>1180 then raise exception 'Receipt conversion failed';end if;
 if (private.so_catalog(d)->'masterItems'->0->>'harga_per_satuan_dasar')::numeric<>5 then raise exception 'Invoice price update failed';end if;n:=n+1;
 v:=public.stock_opname_write(d,(v->>'revision')::bigint,gen_random_uuid(),'save',jsonb_build_object('type','expense','category','Waste','start',day,'end',day,'lines','[{"key":"w:x","qty":"10","unit":"ML"}]'::jsonb));
 if (v->'balance'->>'w:x')::numeric<>240 then raise exception 'WIP waste failed';end if;n:=n+1;
 req:=gen_random_uuid();moveid:=req::text;v:=public.stock_opname_write(d,(v->>'revision')::bigint,req,'save',jsonb_build_object('type','expense','category','Move','target',t,'mapping','[{"source":"m:b","target":"m:b"}]'::jsonb,'start',day,'end',day,'lines','[{"key":"m:b","qty":"20","unit":"GR"}]'::jsonb));
 if (v->'balance'->>'m:b')::numeric<>960 or (public.stock_opname_read(t)->'balance'->>'m:b')::numeric<>1020 then raise exception 'Move not balanced';end if;n:=n+1;
 begin perform public.stock_opname_write(d,0,gen_random_uuid(),'close','{}');raise exception 'Expected revision error';exception when others then if sqlerrm not like 'Data berubah%' then raise;end if;end;n:=n+1;
 begin perform public.stock_opname_write(d,(v->>'revision')::bigint,gen_random_uuid(),'close',jsonb_build_object('date',day,'counts','{}'::jsonb));raise exception 'Expected incomplete count error';exception when others then if sqlerrm not like 'Jumlah/harga%' then raise;end if;end;n:=n+1;
 v:=public.stock_opname_write(d,(v->>'revision')::bigint,gen_random_uuid(),'close',jsonb_build_object('date',day,'counts','{"m:a":{"qty":"1170","unit":"ML"},"m:b":{"qty":"960","unit":"GR"},"w:x":{"qty":"240","unit":"ML"}}'::jsonb));
 if (v->'state'->'periods'->0->'result'->0->>'variance_value')::numeric<>-50 then raise exception 'Variance price failed';end if;n:=n+1;
 -- Non-expense categories from older clients must not become Waste movements.
 if exists(select 1 from jsonb_array_elements(v->'state'->'documents') doc where doc->>'type' in ('production','sales','receipt') and doc->>'category' is not null) then raise exception 'Non-expense saved an expense category';end if;
 if (v->'state'->'periods'->0->'result'->0->'movements'->>'production')::numeric is distinct from -20 or (v->'state'->'periods'->0->'result'->0->'movements'->>'receipt')::numeric is distinct from 200 or (v->'state'->'periods'->0->'result'->2->'movements'->>'sales')::numeric is distinct from -50 then raise exception 'Movement types were not preserved';end if;n:=n+1;
 begin perform public.stock_opname_write(d,(v->>'revision')::bigint,gen_random_uuid(),'save','{}');raise exception 'Expected inactive opening error';exception when others then if sqlerrm not like 'Stock Awal belum aktif%' then raise;end if;end;n:=n+1;
 v:=public.stock_opname_write(d,(v->>'revision')::bigint,gen_random_uuid(),'activate','{}');
 if (v->'balance'->>'m:a')::numeric<>1170 or (v->'balance'->>'w:x')::numeric<>240 then raise exception 'Previous transactions counted twice';end if;n:=n+1;
 v:=public.stock_opname_write(d,(v->>'revision')::bigint,gen_random_uuid(),'reopen','{}');
 if v->'state'->'periods'->1->>'status'<>'held' or v->'state'->'periods'->0->>'status'<>'reopened' then raise exception 'Reopen chain failed';end if;n:=n+1;
 begin perform public.stock_opname_write(d,(v->>'revision')::bigint,gen_random_uuid(),'adjust_move',jsonb_build_object('id',moveid));raise exception 'Expected active-period adjustment guard';exception when others then if sqlerrm not like 'Penyesuaian Move hanya boleh%' then raise;end if;end;n:=n+1;
 v:=public.stock_opname_write(d,(v->>'revision')::bigint,gen_random_uuid(),'close',jsonb_build_object('date',day,'counts','{"m:a":{"qty":"1160","unit":"ML"},"m:b":{"qty":"960","unit":"GR"},"w:x":{"qty":"240","unit":"ML"}}'::jsonb));
 v:=public.stock_opname_write(d,(v->>'revision')::bigint,gen_random_uuid(),'reactivate','{}');
 if (v->'balance'->>'m:a')::numeric<>1160 then raise exception 'Reconfirmed opening mismatch';end if;n:=n+1;

 -- Close destination then reverse original Move in the current periods.
 rev:=(public.stock_opname_read(t)->>'revision')::bigint;
 perform public.stock_opname_write(t,rev,gen_random_uuid(),'close',jsonb_build_object('date',day,'counts','{"m:a":{"qty":"1000","unit":"ML"},"m:b":{"qty":"1020","unit":"GR"},"w:x":{"qty":"100","unit":"ML"}}'::jsonb));
 rev:=(public.stock_opname_read(t)->>'revision')::bigint;
 perform public.stock_opname_write(t,rev,gen_random_uuid(),'activate','{}');
 v:=public.stock_opname_write(d,(v->>'revision')::bigint,gen_random_uuid(),'adjust_move',jsonb_build_object('id',moveid));
 if (v->'balance'->>'m:b')::numeric<>980 or (public.stock_opname_read(t)->'balance'->>'m:b')::numeric<>1000 then raise exception 'Linked adjustment failed';end if;n:=n+1;
 -- Negative balance remains valid and visible.
 v:=public.stock_opname_write(d,(v->>'revision')::bigint,gen_random_uuid(),'save',jsonb_build_object('type','expense','category','QC','start',day,'end',day,'lines','[{"key":"m:b","qty":"2000","unit":"GR"}]'::jsonb));
 if (v->'balance'->>'m:b')::numeric<>-1020 then raise exception 'Negative balance was hidden';end if;n:=n+1;

 -- A saved recipe does not change retroactively when the master recipe changes.
 if (v->'state'->'documents'->0->'postings'->0->>'qty')::numeric<>-20 then raise exception 'Historical recipe snapshot changed';end if;n:=n+1;
 -- Sales crossing an opname cutoff is blocked, even with fully entered counts.
 v:=public.stock_opname_write(d,(v->>'revision')::bigint,gen_random_uuid(),'save',jsonb_build_object('type','sales','category','Waste','start',day,'end',(now() at time zone 'Asia/Jakarta')::date,'lines','[{"key":"s:coffee","qty":"1"}]'::jsonb));
 begin perform public.stock_opname_write(d,(v->>'revision')::bigint,gen_random_uuid(),'close',jsonb_build_object('date',day));raise exception 'Expected crossing Sales failure';exception when others then if sqlerrm not like 'Rentang Sales melewati%' then raise;end if;end;n:=n+1;
 update public.stock_opname_scopes set enabled=false where division_id=t;
 begin perform public.stock_opname_read(t);raise exception 'Expected disabled scope denial';exception when others then if sqlerrm not like 'Akses Stock Opname%' then raise;end if;end;n:=n+1;
 update public.stock_opname_scopes set enabled=true where division_id=t;
 -- Execute public wrapper as actual authenticated database role; direct writes forbidden.
 execute 'set local role authenticated';
 perform public.stock_opname_read(d);
 begin update public.stock_opname_state set revision=0 where division_id=d;raise exception 'Expected direct write permission denial';exception when insufficient_privilege then null;end;n:=n+1;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.stock_opname_read(d);raise exception 'Expected denied access';exception when others then if sqlerrm not like 'Akses Stock Opname%' then raise;end if;end;n:=n+1;
 raise notice 'Stock Opname database checks passed: %',n;
end $$;
