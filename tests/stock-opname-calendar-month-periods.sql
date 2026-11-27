-- End-to-end calendar-month period checks. Rollback only; never touches real data.
-- Run against a database with the baseline schema plus the 2026-11-20 migrations.
\set ON_ERROR_STOP on
begin;

select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',true);

insert into auth.users(id) values
 ('22222222-2222-2222-2222-222222222222')
 on conflict do nothing;
insert into public.workspaces(id,name) values
 ('11111111-1111-1111-1111-111111111111','Uji Kalender')
 on conflict do nothing;
insert into public.divisions(id,workspace_id,name,is_active) values
 ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','Dapur',true),
 ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','Bar',true),
 ('55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111','Gudang',true),
 ('66666666-6666-6666-6666-666666666666','11111111-1111-1111-1111-111111111111','Toko',true)
 on conflict do nothing;
insert into public.profiles(id,role) values
 ('22222222-2222-2222-2222-222222222222','admin')
 on conflict do nothing;
insert into public.workspace_memberships(workspace_id,user_id,role) values
 ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','division_admin')
 on conflict do nothing;
insert into public.workspace_division_memberships(workspace_id,user_id,division_id) values
 ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333'),
 ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','44444444-4444-4444-4444-444444444444'),
 ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','55555555-5555-5555-5555-555555555555'),
 ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','66666666-6666-6666-6666-666666666666')
 on conflict do nothing;
insert into public.stock_opname_scopes(division_id,workspace_id,enabled) values
 ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111',true),
 ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111',true),
 ('55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111',true),
 ('66666666-6666-6666-6666-666666666666','11111111-1111-1111-1111-111111111111',true)
 on conflict (division_id) do update set enabled=excluded.enabled;

insert into public.workspace_module_state(workspace_id,division_id,module_key,payload,updated_by)
select '11111111-1111-1111-1111-111111111111',d.id,'master_data:'||d.id,
 jsonb_build_object(
  'active_scope_id','scope-'||d.id,
  'masterItems',jsonb_build_array(jsonb_build_object(
   'id','a','nama_barang','Gula','status','active','scope_id','scope-'||d.id,
   'satuan_dasar','GR','konversi_satuan',jsonb_build_array(jsonb_build_object('unit','GR','factor',1)),
   'harga_per_satuan_dasar',10,'harga_beli_terakhir_per_satuan_dasar',10
  )),
  'wips','[]'::jsonb,'menus','[]'::jsonb,'wipRecipeLines','[]'::jsonb,'menuRecipeLines','[]'::jsonb
 ),'22222222-2222-2222-2222-222222222222'
from public.divisions d where d.workspace_id='11111111-1111-1111-1111-111111111111';

-- Dapur/Bar: delayed October close with a November receipt, then corrections.
select private.so_mutate('33333333-3333-3333-3333-333333333333',0,
 'aaaaaaa1-0000-0000-0000-000000000001','initial',
 jsonb_build_object('date','2026-10-01','counts',jsonb_build_object('m:a',jsonb_build_object('qty','10','unit','GR'))));

do $$ declare s jsonb; p jsonb;
begin
 select payload into s from public.stock_opname_state where division_id='33333333-3333-3333-3333-333333333333';
 p:=s->'periods'->0;
 if jsonb_array_length(s->'periods')<>1 or p->>'start'<>'2026-10-01' then
  raise exception 'Initial period must start on the first of its month: %',s->'periods';
 end if;
 if (p->'opening'->>'m:a')::numeric is distinct from 10 then
  raise exception 'Initial opening mismatch: %',p->'opening';
 end if;
end $$;

select private.so_mutate('33333333-3333-3333-3333-333333333333',1,
 'aaaaaaa1-0000-0000-0000-000000000002','save',
 jsonb_build_object('type','receipt','start','2026-11-02','end','2026-11-02',
  'lines',jsonb_build_array(jsonb_build_object('key','m:a','qty','5','unit','GR'))));

do $$ declare s jsonb; p jsonb; d jsonb;
begin
 select payload into s from public.stock_opname_state where division_id='33333333-3333-3333-3333-333333333333';
 if jsonb_array_length(s->'periods')<>2 then raise exception 'November period was not created: %',s->'periods'; end if;
 p:=s->'periods'->1;
 if p->>'start'<>'2026-12-01' and p->>'start'<>'2026-11-01' then raise exception 'Wrong month start: %',p->>'start'; end if;
 if p->>'opening_source'<>'provisional' or p->'opening'<>'{}'::jsonb then
  raise exception 'A month before the previous close must start with provisional zero opening: %',p;
 end if;
 d:=s->'documents'->0;
 if d->>'period_id'<>p->>'id' or (d->'postings'->0->>'qty')::numeric is distinct from 5 then
  raise exception 'November receipt must belong to the November period: %',d;
 end if;
end $$;

select private.so_mutate('33333333-3333-3333-3333-333333333333',2,
 'aaaaaaa1-0000-0000-0000-000000000003','close',
 jsonb_build_object('month','2026-10-01','date','2026-11-03',
  'counts',jsonb_build_object('m:a',jsonb_build_object('qty','12','unit','GR'))));

do $$ declare s jsonb; oct jsonb; nov jsonb; r jsonb;
begin
 select payload into s from public.stock_opname_state where division_id='33333333-3333-3333-3333-333333333333';
 oct:=s->'periods'->0;nov:=s->'periods'->1;
 if oct->>'status'<>'closed' or oct->>'counted_at'<>'2026-11-03' then
  raise exception 'October close metadata mismatch: %',oct;
 end if;
 if (oct->'normalized'->>'m:a')::numeric is distinct from 7 then
  raise exception 'October end-of-month quantity must subtract November movements: %',oct->'normalized';
 end if;
 r:=oct->'result'->0;
 if (r->>'system')::numeric is distinct from 10 or (r->>'physical')::numeric is distinct from 7 then
  raise exception 'October result must compare normalized physical with October system: %',r;
 end if;
 if (nov->'opening'->>'m:a')::numeric is distinct from 7 or nov->>'opening_source'<>'previous_close' then
  raise exception 'November opening must derive from the October close: %',nov;
 end if;
end $$;

select private.so_mutate('33333333-3333-3333-3333-333333333333',3,
 'aaaaaaa1-0000-0000-0000-000000000007','save',
 jsonb_build_object('id','aaaaaaa1-0000-0000-0000-000000000002','type','receipt','start','2026-11-02','end','2026-11-02',
  'lines',jsonb_build_array(jsonb_build_object('key','m:a','qty','8','unit','GR'))));

do $$ declare s jsonb; nov jsonb;
begin
 select payload into s from public.stock_opname_state where division_id='33333333-3333-3333-3333-333333333333';
 nov:=s->'periods'->1;
 if (nov->'opening'->>'m:a')::numeric is distinct from 4 then
  raise exception 'Editing a pre-count November movement must refresh the opening: %',nov->'opening';
 end if;
end $$;

select private.so_mutate('33333333-3333-3333-3333-333333333333',4,
 'aaaaaaa1-0000-0000-0000-000000000004','void',
 jsonb_build_object('id','aaaaaaa1-0000-0000-0000-000000000002'));

do $$ declare s jsonb; nov jsonb; d jsonb;
begin
 select payload into s from public.stock_opname_state where division_id='33333333-3333-3333-3333-333333333333';
 nov:=s->'periods'->1;d:=s->'documents'->0;
 if not coalesce((d->>'void')::boolean,false) then raise exception 'Void must keep the document and mark it void: %',d; end if;
 if (nov->'opening'->>'m:a')::numeric is distinct from 12 then
  raise exception 'Voiding a pre-count movement must restore the opening: %',nov->'opening';
 end if;
end $$;

select private.so_mutate('33333333-3333-3333-3333-333333333333',5,
 'aaaaaaa1-0000-0000-0000-000000000005','save',
 jsonb_build_object('type','receipt','start','2026-11-05','end','2026-11-05',
  'lines',jsonb_build_array(jsonb_build_object('key','m:a','qty','3','unit','GR'))));

select private.so_mutate('33333333-3333-3333-3333-333333333333',6,
 'aaaaaaa1-0000-0000-0000-000000000006','close',
 jsonb_build_object('month','2026-11-01','date','2026-11-20',
  'counts',jsonb_build_object('m:a',jsonb_build_object('qty','15','unit','GR'))));

do $$ declare s jsonb; nov jsonb; dec jsonb;
begin
 select payload into s from public.stock_opname_state where division_id='33333333-3333-3333-3333-333333333333';
 nov:=s->'periods'->1;dec:=s->'periods'->2;
 if nov->>'status'<>'closed' or nov->>'end'<>'2026-11-30' then raise exception 'November close mismatch: %',nov; end if;
 if (nov->'result'->0->>'physical')::numeric is distinct from 15 then raise exception 'In-month count must not be normalized twice: %',nov->'result'->0; end if;
 if dec->>'start'<>'2026-12-01' or (dec->'opening'->>'m:a')::numeric is distinct from 15 then
  raise exception 'December opening must follow the November physical count: %',dec;
 end if;
end $$;

-- Gudang/Toko: cross-division Move in an open November, then delayed October closes.
select private.so_mutate('55555555-5555-5555-5555-555555555555',0,
 'ccccccc1-0000-0000-0000-000000000001','initial',
 jsonb_build_object('date','2026-10-01','counts',jsonb_build_object('m:a',jsonb_build_object('qty','10','unit','GR'))));
select private.so_mutate('66666666-6666-6666-6666-666666666666',0,
 'ddddddd1-0000-0000-0000-000000000001','initial',
 jsonb_build_object('date','2026-10-01','counts',jsonb_build_object('m:a',jsonb_build_object('qty','20','unit','GR'))));

select private.so_mutate('55555555-5555-5555-5555-555555555555',1,
 'ccccccc1-0000-0000-0000-000000000002','save',
 jsonb_build_object('type','expense','category','Move','start','2026-11-02','end','2026-11-02',
  'target','66666666-6666-6666-6666-666666666666',
  'lines',jsonb_build_array(jsonb_build_object('key','m:a','qty','2','unit','GR')),
  'mapping',jsonb_build_array(jsonb_build_object('source','m:a','target','m:a'))));

do $$ declare s jsonb; d jsonb; t jsonb; mirror jsonb;
begin
 select payload into s from public.stock_opname_state where division_id='55555555-5555-5555-5555-555555555555';
 d:=s->'documents'->0;
 if d->>'category'<>'Move' or (d->'postings'->0->>'qty')::numeric is distinct from -2 then
  raise exception 'Move source posting mismatch: %',d;
 end if;
 select payload into t from public.stock_opname_state where division_id='66666666-6666-6666-6666-666666666666';
 mirror:=t->'documents'->0;
 if mirror->>'source_id'<>d->>'id' or (mirror->'postings'->0->>'qty')::numeric is distinct from 2 then
  raise exception 'Move mirror mismatch: %',mirror;
 end if;
 if (t->'periods'->1->>'opening_source')<>'provisional' then
  raise exception 'Target month must start provisional while November is open: %',t->'periods'->1;
 end if;
end $$;

select private.so_mutate('55555555-5555-5555-5555-555555555555',2,
 'ccccccc1-0000-0000-0000-000000000003','close',
 jsonb_build_object('month','2026-10-01','date','2026-11-03',
  'counts',jsonb_build_object('m:a',jsonb_build_object('qty','8','unit','GR'))));
select private.so_mutate('66666666-6666-6666-6666-666666666666',2,
 'ddddddd1-0000-0000-0000-000000000003','close',
 jsonb_build_object('month','2026-10-01','date','2026-11-03',
  'counts',jsonb_build_object('m:a',jsonb_build_object('qty','22','unit','GR'))));

do $$ declare a jsonb; b jsonb;
begin
 select payload into a from public.stock_opname_state where division_id='55555555-5555-5555-5555-555555555555';
 select payload into b from public.stock_opname_state where division_id='66666666-6666-6666-6666-666666666666';
 if (a->'periods'->1->'opening'->>'m:a')::numeric is distinct from 10 then
  raise exception 'Source November opening must undo the outgoing Move: %',a->'periods'->1;
 end if;
 if (b->'periods'->1->'opening'->>'m:a')::numeric is distinct from 20 then
  raise exception 'Target November opening must undo the incoming Move: %',b->'periods'->1;
 end if;
end $$;

-- A late Move must refresh the destination opening inside periods[target_idx].
select private.so_mutate('55555555-5555-5555-5555-555555555555',
 (public.stock_opname_read('55555555-5555-5555-5555-555555555555')->>'revision')::bigint,
 'ccccccc1-0000-0000-0000-000000000010','save',
 jsonb_build_object('type','expense','category','Move','start','2026-11-02','end','2026-11-02',
  'target','66666666-6666-6666-6666-666666666666',
  'lines',jsonb_build_array(jsonb_build_object('key','m:a','qty','1','unit','GR')),
  'mapping',jsonb_build_array(jsonb_build_object('source','m:a','target','m:a'))));

do $$ declare t jsonb; v jsonb;
begin
 select payload into t from public.stock_opname_state where division_id='66666666-6666-6666-6666-666666666666';
 if (t->'periods'->1->'opening'->>'m:a')::numeric is distinct from 19 then
  raise exception 'Late Move must refresh the target opening in its period: %',t->'periods'->1;
 end if;
 if t ? '1' or t ? '0' then
  raise exception 'Target opening must not be written to a top-level key: %',t;
 end if;
 v:=public.stock_opname_read('66666666-6666-6666-6666-666666666666');
 if (v->'balance'->>'m:a')::numeric is distinct from 22 then
  raise exception 'Late Move must not double-count the physical count: %',v->'balance';
 end if;
end $$;

select private.so_mutate('55555555-5555-5555-5555-555555555555',
 (public.stock_opname_read('55555555-5555-5555-5555-555555555555')->>'revision')::bigint,
 'ccccccc1-0000-0000-0000-000000000011','void',
 jsonb_build_object('id','ccccccc1-0000-0000-0000-000000000010'));

do $$ declare t jsonb; v jsonb;
begin
 select payload into t from public.stock_opname_state where division_id='66666666-6666-6666-6666-666666666666';
 if (t->'periods'->1->'opening'->>'m:a')::numeric is distinct from 20 then
  raise exception 'Voiding the late Move must restore the target opening: %',t->'periods'->1;
 end if;
 if t ? '1' or t ? '0' then
  raise exception 'Voiding the late Move left a top-level period key: %',t;
 end if;
 v:=public.stock_opname_read('66666666-6666-6666-6666-666666666666');
 if (v->'balance'->>'m:a')::numeric is distinct from 22 then
  raise exception 'Voiding the late Move must restore the target balance: %',v->'balance';
 end if;
end $$;

rollback;
