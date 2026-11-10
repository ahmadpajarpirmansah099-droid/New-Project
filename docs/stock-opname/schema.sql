-- Stock Opname phase one. Apply as one reviewed migration.
-- Inventory writes are RPC-only; master data remains the existing catalog.
create table public.stock_opname_scopes (
 division_id uuid primary key references public.divisions(id),
 workspace_id uuid not null references public.workspaces(id),
 enabled boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.stock_opname_state (
 division_id uuid primary key references public.stock_opname_scopes(division_id),
 payload jsonb not null default '{"periods":[],"documents":[]}',
 revision bigint not null default 0,
 updated_at timestamptz not null default now()
);
create table public.stock_opname_requests (
 request_id uuid primary key,
 actor_id uuid not null references auth.users(id),
 division_id uuid not null references public.stock_opname_scopes(division_id),
 action text not null,
 payload_hash text not null,
 created_at timestamptz not null default now()
);
create index stock_opname_scopes_workspace_idx on public.stock_opname_scopes(workspace_id);
create index stock_opname_requests_actor_idx on public.stock_opname_requests(actor_id);
create index stock_opname_requests_division_idx on public.stock_opname_requests(division_id);
alter table public.stock_opname_scopes enable row level security;
alter table public.stock_opname_state enable row level security;
alter table public.stock_opname_requests enable row level security;
revoke all on public.stock_opname_scopes,public.stock_opname_state,public.stock_opname_requests from public,anon,authenticated;

create function private.so_allowed(d uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists (
  select 1 from public.stock_opname_scopes s
  join public.divisions dv on dv.id=s.division_id and dv.workspace_id=s.workspace_id
  join public.workspace_memberships m on m.workspace_id=s.workspace_id and m.user_id=auth.uid()
  join public.profiles p on p.id=m.user_id
  where s.division_id=d and s.enabled and dv.is_active and p.role='admin' and m.role='division_admin'
  and exists(select 1 from public.workspace_division_memberships dm where dm.workspace_id=s.workspace_id and dm.division_id=d and dm.user_id=auth.uid())
 );
$$;
revoke all on function private.so_allowed(uuid) from public,anon;
grant execute on function private.so_allowed(uuid) to authenticated;
grant select on public.stock_opname_scopes,public.stock_opname_state to authenticated;
create policy so_scope_read on public.stock_opname_scopes for select to authenticated using (private.so_allowed(division_id) or public.is_current_user_developer());
create policy so_state_read on public.stock_opname_state for select to authenticated using (private.so_allowed(division_id));
-- RPC helpers are internal. All public entry points below are invoker wrappers.
create function private.so_number(v text, positive boolean default false) returns numeric
language plpgsql immutable set search_path='' as $$
declare n numeric;
begin
 if v is null or v !~ '^[0-9]+([.][0-9]+)?$' then raise exception 'Jumlah/harga harus berupa angka nonnegatif.'; end if;
 n:=v::numeric;
 if n>1000000000000 or (positive and n<=0) then raise exception 'Jumlah di luar batas.'; end if;
 return n;
end $$;
create function private.so_item(c jsonb,k text, trail text[] default '{}') returns jsonb
language plpgsql immutable set search_path='' as $$
declare x jsonb; l jsonb; part jsonb; qty numeric; cost numeric:=0; parts jsonb:='[]'; unit text; f numeric; price numeric;
begin
 if k=any(trail) or cardinality(trail)>20 then raise exception 'Siklus resep WIP.'; end if;
 if left(k,2)='m:' then
  select value into x from jsonb_array_elements(coalesce(c->'masterItems','[]')) where value->>'id'=substr(k,3) and value->>'status'='active' and value->>'scope_id'=c->>'active_scope_id';
  if x is null then raise exception 'Bahan tidak tersedia/nonaktif: %',k; end if;
  price:=private.so_number(coalesce(x->>'harga_beli_terakhir_per_satuan_dasar',x->>'harga_per_satuan_dasar'));
  return jsonb_build_object('key',k,'name',x->>'nama_barang','unit',x->>'satuan_dasar','units',x->'konversi_satuan','price',price,'kind','material','parts','[]'::jsonb);
 end if;
 if left(k,2)='w:' then
  select value into x from jsonb_array_elements(coalesce(c->'wips','[]')) where value->>'id'=substr(k,3) and value->>'status'='active' and value->>'scope_id'=c->>'active_scope_id';
 else
  select value into x from jsonb_array_elements(coalesce(c->'menus','[]')) where value->>'id'=substr(k,3) and value->>'status'='active' and value->>'scope_id'=c->>'active_scope_id';
 end if;
 if x is null then raise exception 'Menu/WIP tidak tersedia: %',k; end if;
 for l in select value from jsonb_array_elements(case when left(k,2)='w:' then coalesce(c->'wipRecipeLines','[]') else coalesce(c->'menuRecipeLines','[]') end) where value->>(case when left(k,2)='w:' then 'wip_id' else 'menu_id' end)=substr(k,3)
 loop
  part:=private.so_item(c,case when l->>'component_type'='material' then 'm:'||(l->>'item_id') else 'w:'||(l->>'component_wip_id') end,trail||k);
  select (value->>'factor')::numeric into f from jsonb_array_elements(part->'units') where upper(value->>'unit')=upper(l->>'unit_input');
  if f is null or f<=0 then raise exception 'Satuan resep tidak valid: %',part->>'name'; end if;
  qty:=private.so_number(l->>'qty_input',true)*f;
  parts:=parts||jsonb_build_array(part||jsonb_build_object('qty',qty));
  cost:=cost+qty*(part->>'price')::numeric;
 end loop;
 if jsonb_array_length(parts)=0 then raise exception 'Resep % belum lengkap.',coalesce(x->>'nama_wip',x->>'nama_menu'); end if;
 if left(k,2)='w:' then
  qty:=private.so_number(x->>'hasil_per_batch',true);unit:=x->>'satuan_hasil';
  return jsonb_build_object('key',k,'name',x->>'nama_wip','unit',unit,'units',jsonb_build_array(jsonb_build_object('unit',unit,'factor',1)),'price',cost/qty,'kind','wip','yield',qty,'parts',parts);
 end if;
 return jsonb_build_object('key',k,'name',x->>'nama_menu','kind','menu','price',cost,'parts',parts);
end $$;
create function private.so_catalog(d uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c jsonb;
begin
 select m.payload into c from public.workspace_module_state m join public.divisions dv on dv.id=d and m.workspace_id=dv.workspace_id where m.division_id=d and m.module_key='master_data:'||d;
 return coalesce(c,'{"masterItems":[],"wips":[],"menus":[],"wipRecipeLines":[],"menuRecipeLines":[]}');
end $$;
create function private.so_catalog_rows(c jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare r jsonb; k text; item jsonb; rows jsonb:='[]';
begin
 for r in select value||jsonb_build_object('kind_prefix','m:') from jsonb_array_elements(coalesce(c->'masterItems','[]')) union all select value||jsonb_build_object('kind_prefix','w:') from jsonb_array_elements(coalesce(c->'wips','[]')) union all select value||jsonb_build_object('kind_prefix','s:') from jsonb_array_elements(coalesce(c->'menus','[]'))
 loop
  if r->>'status'<>'active' or r->>'scope_id' is distinct from c->>'active_scope_id' then continue; end if;
  k:=(r->>'kind_prefix')||(r->>'id');
  begin item:=private.so_item(c,k); exception when others then item:=jsonb_build_object('key',k,'name',coalesce(r->>'nama_barang',r->>'nama_wip',r->>'nama_menu'),'error',sqlerrm); end;
  rows:=rows||jsonb_build_array(item);
 end loop;
 return rows;
end $$;
create function private.so_balances(s jsonb,p jsonb,cutoff date default null) returns jsonb
language plpgsql immutable set search_path='' as $$
declare b jsonb:=coalesce(p->'opening','{}'); doc jsonb; l jsonb; k text; n numeric;
begin
 for doc in select value from jsonb_array_elements(coalesce(s->'documents','[]')) where value->>'period_id'=p->>'id' and coalesce(value->>'void','false')<>'true'
 loop
  if cutoff is not null and (doc->>'end')::date>cutoff then continue; end if;
  for l in select value from jsonb_array_elements(doc->'postings') loop
   k:=l->>'key';n:=coalesce((b->>k)::numeric,0)+(l->>'qty')::numeric;
   b:=jsonb_set(b,array[k],to_jsonb(n),true);
  end loop;
 end loop;
 return b;
end $$;
create function private.so_view(d uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare st public.stock_opname_state%rowtype; c jsonb; p jsonb; targets jsonb;
begin
 if not private.so_allowed(d) then raise exception 'Akses Stock Opname ditolak.'; end if;
 select * into st from public.stock_opname_state where division_id=d;
 c:=private.so_catalog(d);p:=st.payload->'periods'->-1;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.division_id,'name',w.name||' · '||dv.name)),'[]') into targets from public.stock_opname_scopes s join public.divisions dv on dv.id=s.division_id join public.workspaces w on w.id=s.workspace_id where s.enabled and dv.is_active and s.division_id<>d;
 return jsonb_build_object('state',coalesce(st.payload,'{"periods":[],"documents":[]}'),'revision',coalesce(st.revision,0),'catalog',private.so_catalog_rows(c),'balance',private.so_balances(coalesce(st.payload,'{}'),coalesce(p,'{}')),'targets',targets);
end $$;
create function public.stock_opname_read(division uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.so_view(division); $$;
revoke all on function public.stock_opname_read(uuid) from public,anon;
grant execute on function public.stock_opname_read(uuid) to authenticated;
-- Mutation function follows below.
create function private.so_mutate(d uuid,expected_revision bigint,request uuid,action text,input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
 st public.stock_opname_state%rowtype; s jsonb; p jsonb; ps jsonb; docs jsonb; c jsonb; rows jsonb;
 item jsonb; r jsonb; l jsonb; doc jsonb; old_doc jsonb; postings jsonb:='[]'; counts jsonb:='{}'; result jsonb:='[]';
 b jsonb; movements jsonb; k text; qty numeric; factor numeric; price numeric; total numeric; idx int; pi int; j int;
 start_date date; end_date date; pid text; docid text; typ text; target uuid; target_st public.stock_opname_state%rowtype;
 target_s jsonb; target_p jsonb; target_item jsonb; target_posts jsonb:='[]'; target_doc jsonb;
begin
 if not private.so_allowed(d) then raise exception 'Akses Stock Opname ditolak.'; end if;
 -- One lock orders multi-division transfers and avoids deadlocks. This is deliberately
 -- conservative for the initial rollout. Narrow locks only after measuring contention.
 perform pg_advisory_xact_lock(193722,1);
 if exists(select 1 from public.stock_opname_requests q where q.request_id=request) then
  if not exists(select 1 from public.stock_opname_requests q where q.request_id=request and q.actor_id=auth.uid() and q.division_id=d and q.action=action and q.payload_hash=md5(input::text)) then raise exception 'ID permintaan tidak cocok.'; end if;
  return private.so_view(d);
 end if;
 insert into public.stock_opname_state(division_id) values(d) on conflict do nothing;
 select * into st from public.stock_opname_state where division_id=d for update;
 if st.revision<>expected_revision then raise exception 'Data berubah di perangkat lain. Muat ulang sebelum menyimpan; draft tetap tersedia.'; end if;
 s:=st.payload; ps:=s->'periods';docs:=s->'documents';pi:=jsonb_array_length(ps)-1;p:=ps->pi;c:=private.so_catalog(d);
 if action='initial' then
  if pi>=0 then raise exception 'Stock Awal pertama sudah diisi.'; end if;
  start_date:=(input->>'date')::date;
  if start_date is null or start_date>(now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal awal tidak valid.'; end if;
  rows:=private.so_catalog_rows(c);
  if jsonb_array_length(rows)=0 then raise exception 'Lengkapi Master Barang terlebih dahulu.'; end if;
  for item in select value from jsonb_array_elements(rows) where left(value->>'key',2)<>'s:' loop
   k:=item->>'key';if item ? 'error' then raise exception '%',item->>'error'; end if;
   r:=input->'counts'->k;qty:=private.so_number(r->>'qty');
   select (value->>'factor')::numeric into factor from jsonb_array_elements(item->'units') where value->>'unit'=r->>'unit';
   if factor is null or factor<=0 then raise exception 'Satuan % tidak valid.',item->>'name'; end if;
   counts:=jsonb_set(counts,array[k],to_jsonb(qty*factor),true);
  end loop;
  if counts='{}' then raise exception 'Belum ada barang untuk dihitung.'; end if;
  ps:=jsonb_build_array(jsonb_build_object('id',request,'start',start_date,'status','active','opening',counts,'opening_catalog',rows,'created_at',now()));
 elsif action='activate' then
  if p->>'status'<>'closed' then raise exception 'Selesaikan opname terlebih dahulu.'; end if;
  ps:=ps||jsonb_build_array(jsonb_build_object('id',request,'start',p->>'end','status','active','opening',p->'physical','opening_catalog',p->'catalog','previous_id',p->>'id','created_at',now()));
 elsif action='reopen' then
  if p->>'status'='active' and pi>0 then
   -- Keep the following period and its transactions on hold; no historical writes.
   p:=p||jsonb_build_object('status','held');ps:=jsonb_set(ps,array[pi::text],p);
   pi:=pi-1;p:=ps->pi;
  elsif p->>'status'='held' then raise exception 'Opname sebelumnya sedang dikoreksi.';
  end if;
  if p->>'status'<>'closed' then raise exception 'Tidak ada opname terakhir untuk dibuka kembali.'; end if;
  p:=p||jsonb_build_object('status','reopened');ps:=jsonb_set(ps,array[pi::text],p);
 elsif action='reactivate' then
  if p->>'status'<>'held' or pi<1 or ps->(pi-1)->>'status'<>'closed' then raise exception 'Selesaikan koreksi opname terlebih dahulu.'; end if;
  p:=p||jsonb_build_object('status','active','opening',ps->(pi-1)->'physical','opening_catalog',ps->(pi-1)->'catalog');
  ps:=jsonb_set(ps,array[pi::text],p);
 elsif action in ('save','void','close','adjust_move') then
  if p->>'status'='held' then pi:=pi-1;p:=ps->pi; end if;
  if p is null or p->>'status' not in ('active','reopened') then raise exception 'Stock Awal belum aktif. Simpan sebagai draft dahulu.'; end if;
  pid:=p->>'id';
  if action='close' then
   end_date:=(input->>'date')::date;
   if end_date is null or end_date<(p->>'start')::date or end_date>(now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal opname tidak valid.'; end if;
   if exists(select 1 from jsonb_array_elements(docs) v where v->>'period_id'=pid and coalesce(v->>'void','false')<>'true' and v->>'type'='sales' and (v->>'start')::date<=end_date and (v->>'end')::date>end_date) then raise exception 'Rentang Sales melewati batas opname. Perbaiki rentang terlebih dahulu.'; end if;
   if exists(select 1 from jsonb_array_elements(docs) v where v->>'period_id'=pid and coalesce(v->>'void','false')<>'true' and (v->>'end')::date>end_date) then raise exception 'Ada transaksi setelah tanggal opname. Koreksi tanggal atau transaksi dahulu.'; end if;
   b:=private.so_balances(s,p,end_date);rows:=coalesce(p->'catalog',private.so_catalog_rows(c));
   -- Keep opening items and snapshot-only items even when a catalog item is disabled.
   for item in select value from jsonb_array_elements(coalesce(p->'opening_catalog','[]')) loop
    if not exists(select 1 from jsonb_array_elements(rows) v where v->>'key'=item->>'key') then rows:=rows||jsonb_build_array(item);end if;
   end loop;
   for doc in select value from jsonb_array_elements(docs) where value->>'period_id'=pid and coalesce(value->>'void','false')<>'true' loop
    for item in select value from jsonb_array_elements(doc->'postings') loop
     if not exists(select 1 from jsonb_array_elements(rows) v where v->>'key'=item->>'key') then rows:=rows||jsonb_build_array(item);end if;
    end loop;
   end loop;
   for item in select value from jsonb_array_elements(rows) where left(value->>'key',2)<>'s:' loop
    if item ? 'error' then raise exception '%',item->>'error';end if;
    k:=item->>'key';r:=input->'counts'->k;qty:=private.so_number(r->>'qty');
    select (value->>'factor')::numeric into factor from jsonb_array_elements(item->'units') where value->>'unit'=r->>'unit';
    if factor is null or factor<=0 then raise exception 'Satuan % tidak valid.',item->>'name';end if;
    qty:=qty*factor;price:=(item->>'price')::numeric;
    counts:=jsonb_set(counts,array[k],to_jsonb(qty),true);
    select coalesce(jsonb_object_agg(kind,amount),'{}') into movements from (select coalesce(v->>'category',v->>'type') as kind,sum((z->>'qty')::numeric) amount from jsonb_array_elements(docs) v cross join lateral jsonb_array_elements(v->'postings') z where v->>'period_id'=pid and coalesce(v->>'void','false')<>'true' and z->>'key'=k group by 1) totals;
    result:=result||jsonb_build_array(item||jsonb_build_object('movements',movements,'opening',coalesce((p->'opening'->>k)::numeric,0),'system',coalesce((b->>k)::numeric,0),'physical',qty,'variance',qty-coalesce((b->>k)::numeric,0),'variance_value',(qty-coalesce((b->>k)::numeric,0))*price));
   end loop;
   if counts='{}' then raise exception 'Tidak ada barang untuk opname.';end if;
   p:=p||jsonb_build_object('status','closed','end',end_date,'physical',counts,'result',result,'catalog',rows,'closed_at',now(),'closed_by',auth.uid());
   ps:=jsonb_set(ps,array[pi::text],p);
  else
   docid:=coalesce(nullif(input->>'id',''),request::text);
   select value,ordinality::int-1 into old_doc,idx from jsonb_array_elements(docs) with ordinality where value->>'id'=docid;
   if old_doc is not null and old_doc->>'period_id'<>pid and action<>'adjust_move' then raise exception 'Transaksi periode lama terkunci.';end if;
   if old_doc is not null and action<>'adjust_move' and exists(select 1 from jsonb_array_elements(docs) v where v->>'adjusts'=docid) then raise exception 'Move sudah disesuaikan; transaksi asal terkunci.';end if;
   if old_doc->>'type' in ('move_in','adjustment_in','adjustment') then raise exception 'Koreksi dilakukan dari transaksi asal.';end if;
   if action='void' and old_doc is null then raise exception 'Transaksi tidak ditemukan.';end if;
   if action='adjust_move' then
    if old_doc is null or old_doc->>'category'<>'Move' then raise exception 'Pilih transaksi Move asal.';end if;
    if exists(select 1 from jsonb_array_elements(docs) v where v->>'adjusts'=docid) then raise exception 'Move sudah memiliki penyesuaian.';end if;
    -- Reverse old transfer in both active periods. A corrected new Move is separate.
    postings:='[]';for l in select value from jsonb_array_elements(old_doc->'postings') loop postings:=postings||jsonb_build_array(l||jsonb_build_object('qty',-(l->>'qty')::numeric));end loop;
    target:=(old_doc->>'target')::uuid;
    doc:=jsonb_build_object('id',request,'period_id',pid,'type','adjustment','category','Move','target',target,'adjusts',docid,'start',(now() at time zone 'Asia/Jakarta')::date,'end',(now() at time zone 'Asia/Jakarta')::date,'postings',postings,'created_at',now(),'actor',auth.uid());
   else
    if action='void' then
     doc:=old_doc||jsonb_build_object('void',true,'updated_at',now());
    else
     typ:=input->>'type';start_date:=(input->>'start')::date;end_date:=(input->>'end')::date;
     if typ not in ('receipt','expense','production','sales') or typ is null then raise exception 'Jenis transaksi tidak valid.';end if;
     if start_date is null or end_date is null or end_date<start_date or start_date<(p->>'start')::date or end_date>(now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal transaksi di luar periode aktif.';end if;
     if p->>'status'='reopened' and end_date>(p->>'end')::date then raise exception 'Koreksi harus tetap di periode opname lama.';end if;
     if typ<>'sales' and start_date<>end_date then raise exception 'Transaksi harian hanya satu tanggal.';end if;
     if old_doc is not null and old_doc->>'type'<>typ then raise exception 'Jenis transaksi tidak dapat diubah.';end if;
     if typ='sales' and coalesce(input->>'confirm_overlap','false')<>'true' and exists(select 1 from jsonb_array_elements(docs) v where v->>'period_id'=pid and v->>'type'='sales' and v->>'id'<>docid and coalesce(v->>'void','false')<>'true' and (v->>'start')::date<=end_date and (v->>'end')::date>=start_date) then raise exception 'SALES_OVERLAP: Konfirmasi tambahan Sales untuk rentang yang bertumpuk.';end if;
     if typ='expense' and coalesce(input->>'category','') not in ('Kalibrasi','RnD','QC','Suplies','Move','Waste','Lainnya') then raise exception 'Pilih kategori pengeluaran.';end if;
     -- Corrections reuse the saved recipe and prices. New transactions read current catalog.
     if old_doc is not null then c:=old_doc->'catalog_snapshot';end if;
     for r in select value from jsonb_array_elements(coalesce(input->'lines','[]')) loop
      qty:=private.so_number(r->>'qty',true);k:=r->>'key';item:=private.so_item(c,k);
      if typ='sales' and left(k,2)<>'s:' or typ='production' and left(k,2)<>'w:' or typ='receipt' and left(k,2)<>'m:' or typ='expense' and left(k,2) not in ('m:','w:') then raise exception 'Barang tidak cocok untuk transaksi ini.';end if;
      if typ in ('sales','production') then
       for l in select value from jsonb_array_elements(item->'parts') loop postings:=postings||jsonb_build_array((l-'parts')||jsonb_build_object('qty',-(l->>'qty')::numeric*qty));end loop;
       if typ='production' then postings:=postings||jsonb_build_array((item-'parts')||jsonb_build_object('qty',(item->>'yield')::numeric*qty));end if;
      else
       select (value->>'factor')::numeric into factor from jsonb_array_elements(item->'units') where value->>'unit'=r->>'unit';
       if factor is null or factor<=0 then raise exception 'Satuan barang tidak valid.';end if;
       qty:=qty*factor;
       if typ='receipt' and nullif(r->>'invoice_total','') is not null then
        price:=private.so_number(r->>'invoice_total')/qty;
        item:=item||jsonb_build_object('price',price);
        -- Lock and update only the purchased item in the latest catalog, not the old snapshot.
        perform 1 from public.workspace_module_state where division_id=d and module_key='master_data:'||d for update;
        select payload into b from public.workspace_module_state where division_id=d and module_key='master_data:'||d;
        select ordinality::int-1 into j from jsonb_array_elements(b->'masterItems') with ordinality where value->>'id'=substr(k,3);
        if j is null then raise exception 'Barang invoice tidak lagi tersedia.';end if;
        b:=jsonb_set(b,array['masterItems',j::text],(b->'masterItems'->j)||jsonb_build_object('harga_beli_terakhir_per_satuan_dasar',price,'harga_per_satuan_dasar',price,'harga_referensi',price,'satuan_harga',item->>'unit','updated_at',now()));
        update public.workspace_module_state set payload=b,updated_at=now() where division_id=d and module_key='master_data:'||d;
       end if;
       postings:=postings||jsonb_build_array((item-'parts')||jsonb_build_object('qty',qty*case when typ='expense' then -1 else 1 end));
      end if;
     end loop;
     if jsonb_array_length(postings)=0 then raise exception 'Isi minimal satu barang/menu.';end if;
     doc:=jsonb_build_object('id',docid,'period_id',pid,'type',typ,'category',input->>'category','start',start_date,'end',end_date,'lines',input->'lines','postings',postings,'catalog_snapshot',c,'created_at',coalesce(old_doc->>'created_at',now()::text),'updated_at',now(),'actor',auth.uid());
    end if;
    if doc->>'category'='Move' then target:=coalesce((input->>'target')::uuid,(old_doc->>'target')::uuid);end if;
   end if;
   if target is not null then
    if target=d or not exists(select 1 from public.stock_opname_scopes sc join public.divisions dv on dv.id=sc.division_id where sc.division_id=target and sc.enabled and dv.is_active) then raise exception 'Tujuan Move belum aktif.';end if;
    if old_doc ? 'target' and old_doc->>'target'<>target::text then raise exception 'Tujuan Move tidak dapat diganti. Batalkan lalu buat baru.';end if;
    select * into target_st from public.stock_opname_state where division_id=target for update;
    target_s:=target_st.payload;target_p:=target_s->'periods'->-1;
    if target_p is null or target_p->>'status'<>'active' then raise exception 'Stock Awal tujuan belum aktif.';end if;
    if old_doc is not null then
     select value into target_doc from jsonb_array_elements(target_s->'documents') where value->>'source_id'=docid;
     if action='adjust_move' and old_doc->>'period_id'=pid and target_doc->>'period_id'=target_p->>'id' then raise exception 'Kedua periode masih aktif. Gunakan edit atau batalkan Move.';end if;
     if action<>'adjust_move' and target_doc->>'period_id'<>target_p->>'id' then raise exception 'Opname tujuan sudah ditutup. Gunakan penyesuaian Move.';end if;
    end if;
    for l in select value from jsonb_array_elements(doc->'postings') loop
     -- Explicit destination identity mapping; never assume IDs match across divisions.
     select value into r from jsonb_array_elements(coalesce(input->'mapping','[]')) where value->>'source'=l->>'key';
     if r is null and target_doc is not null then select value into target_item from jsonb_array_elements(target_doc->'postings') where value->>'source_key'=l->>'key';
     elsif r is not null then target_item:=private.so_item(private.so_catalog(target),r->>'target');
     else raise exception 'Pilih padanan barang di tujuan Move.';end if;
     if target_item is null or target_item->>'unit'<>l->>'unit' then raise exception 'Satuan dasar barang tujuan harus sama.';end if;
     target_posts:=target_posts||jsonb_build_array((target_item-'parts')||jsonb_build_object('source_key',l->>'key','qty',-(l->>'qty')::numeric));
    end loop;
    doc:=doc||jsonb_build_object('target',target);
    target_doc:=jsonb_build_object('id','move:'||(doc->>'id'),'source_id',doc->>'id','source_division',d,'period_id',target_p->>'id','type',case when action='adjust_move' then 'adjustment_in' else 'move_in' end,'start',doc->>'start','end',doc->>'end','void',coalesce((doc->>'void')::boolean,false),'postings',target_posts,'created_at',now());
    if (target_doc->>'start')::date<(target_p->>'start')::date then raise exception 'Tanggal Move lebih lama dari periode tujuan.';end if;
    select coalesce(jsonb_agg(value),'[]') into b from jsonb_array_elements(target_s->'documents') where value->>'source_id'<>doc->>'id' or value->>'source_id' is null;
    target_s:=jsonb_set(target_s,'{documents}',b||jsonb_build_array(target_doc));
    update public.stock_opname_state set payload=target_s,revision=revision+1,updated_at=now() where division_id=target;
   elsif old_doc->>'category'='Move' then raise exception 'Kategori Move tidak dapat diubah.';
   end if;
   if old_doc is not null and action<>'adjust_move' then docs:=jsonb_set(docs,array[idx::text],doc);else docs:=docs||jsonb_build_array(doc);end if;
   -- Invoice corrections/voids recalculate the latest surviving invoice for each
   -- affected item. Historical document/opname snapshots are never rewritten.
   if doc->>'type'='receipt' then
    for k in select distinct v->>'key' from jsonb_array_elements(coalesce(doc->'lines','[]')||coalesce(old_doc->'lines','[]')) v loop
     select v into r from jsonb_array_elements(docs) v where v->>'type'='receipt' and coalesce(v->>'void','false')<>'true'
       and exists(select 1 from jsonb_array_elements(v->'lines') z where z->>'key'=k and nullif(z->>'invoice_total','') is not null)
       order by v->>'end' desc,v->>'created_at' desc limit 1;
     if r is not null then
      select (z->>'price')::numeric into price from jsonb_array_elements(r->'postings') z where z->>'key'=k limit 1;
     elsif old_doc is not null then
      select v into r from jsonb_array_elements(old_doc->'catalog_snapshot'->'masterItems') v where v->>'id'=substr(k,3);
      price:=coalesce((r->>'harga_beli_terakhir_per_satuan_dasar')::numeric,(r->>'harga_per_satuan_dasar')::numeric);
     else continue;
     end if;
     if price is not null then
      perform 1 from public.workspace_module_state where division_id=d and module_key='master_data:'||d for update;
      select payload into b from public.workspace_module_state where division_id=d and module_key='master_data:'||d;
      select ordinality::int-1 into j from jsonb_array_elements(b->'masterItems') with ordinality where value->>'id'=substr(k,3);
      if j is not null then
       b:=jsonb_set(b,array['masterItems',j::text],(b->'masterItems'->j)||jsonb_build_object('harga_beli_terakhir_per_satuan_dasar',price,'harga_per_satuan_dasar',price,'harga_referensi',price,'satuan_harga',b->'masterItems'->j->>'satuan_dasar','updated_at',now()));
       update public.workspace_module_state set payload=b,updated_at=now() where division_id=d and module_key='master_data:'||d;
      end if;
     end if;
    end loop;
   end if;
  end if;
 else raise exception 'Aksi tidak dikenal.';
 end if;
 s:=jsonb_build_object('periods',ps,'documents',docs);
 update public.stock_opname_state set payload=s,revision=revision+1,updated_at=now() where division_id=d;
 insert into public.stock_opname_requests(request_id,actor_id,division_id,action,payload_hash) values(request,auth.uid(),d,action,md5(input::text));
 return private.so_view(d);
end $$;
create function public.stock_opname_write(division uuid,expected_revision bigint,request uuid,action text,input jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.so_mutate(division,expected_revision,request,action,input); $$;
revoke all on function public.stock_opname_write(uuid,bigint,uuid,text,jsonb) from public,anon;
grant execute on function public.stock_opname_write(uuid,bigint,uuid,text,jsonb) to authenticated;
create function private.so_configure(d uuid,on_off boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_current_user_developer() then raise exception 'Hanya Developer yang dapat mengaktifkan fitur.';end if;
 insert into public.stock_opname_scopes(division_id,workspace_id,enabled) select id,workspace_id,on_off from public.divisions where id=d and is_active on conflict(division_id) do update set enabled=excluded.enabled,updated_at=now();
end $$;
create function public.stock_opname_configure(division uuid,enabled boolean) returns void language sql security invoker set search_path='' as $$ select private.so_configure(division,enabled); $$;
revoke all on function public.stock_opname_configure(uuid,boolean) from public,anon;
grant execute on function public.stock_opname_configure(uuid,boolean) to authenticated;
-- Only entry helpers are callable; catalog helpers cannot expose other divisions.
revoke all on function private.so_number(text,boolean),private.so_item(jsonb,text,text[]),private.so_catalog(uuid),private.so_catalog_rows(jsonb),private.so_balances(jsonb,jsonb,date),private.so_view(uuid),private.so_mutate(uuid,bigint,uuid,text,jsonb),private.so_configure(uuid,boolean) from public,anon,authenticated;
grant execute on function private.so_view(uuid),private.so_mutate(uuid,bigint,uuid,text,jsonb),private.so_configure(uuid,boolean) to authenticated;
insert into public.stock_opname_scopes(division_id,workspace_id,enabled)
select d.id,w.id,true from public.divisions d join public.workspaces w on w.id=d.workspace_id where lower(trim(w.name))='lazy jennie' and lower(trim(d.name))='bar' and d.is_active;
create function private.so_target_catalog(origin uuid,destination uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.so_allowed(origin) or not exists(select 1 from public.stock_opname_scopes where division_id=destination and enabled) then raise exception 'Tujuan tidak tersedia.';end if;
 return (select coalesce(jsonb_agg(value-'price'-'parts'),'[]') from jsonb_array_elements(private.so_catalog_rows(private.so_catalog(destination))) where left(value->>'key',2)<>'s:');
end $$;
revoke all on function private.so_target_catalog(uuid,uuid) from public,anon;
grant execute on function private.so_target_catalog(uuid,uuid) to authenticated;
create function public.stock_opname_target_catalog(origin uuid,destination uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.so_target_catalog(origin,destination); $$;
revoke all on function public.stock_opname_target_catalog(uuid,uuid) from public,anon;
grant execute on function public.stock_opname_target_catalog(uuid,uuid) to authenticated;
