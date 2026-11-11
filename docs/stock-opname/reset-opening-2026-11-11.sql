-- Apply only after owner review. Keep the existing period ID and all documents.
create function private.so_reset_opening(d uuid, expected_revision bigint, request uuid, action text, input jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare st public.stock_opname_state%rowtype; s jsonb; p jsonb; c jsonb; rows jsonb; item jsonb; r jsonb; counts jsonb:='{}'::jsonb; k text; qty numeric; factor numeric;
begin
 if not private.so_allowed(d) then raise exception 'Akses Stock Opname ditolak.'; end if;
 if action not in ('reset','confirm') or request is null then raise exception 'Aksi Stock Awal tidak valid.'; end if;
 perform pg_advisory_xact_lock(193722,1);
 if exists(select 1 from public.stock_opname_requests q where q.request_id=request) then
  if not exists(select 1 from public.stock_opname_requests q where q.request_id=request and q.actor_id=auth.uid() and q.division_id=d and q.action='opening_'||action and q.payload_hash=md5(input::text)) then raise exception 'ID permintaan tidak cocok.';end if;
  return private.so_view(d);
 end if;
 select * into st from public.stock_opname_state where division_id=d for update;
 if not found or st.revision<>expected_revision then raise exception 'Data berubah. Muat ulang sebelum menyimpan; draft tetap tersedia.';end if;
 s:=st.payload;
 if jsonb_array_length(coalesce(s->'periods','[]'::jsonb))<>1 then raise exception 'Stock Awal ini hanya dapat diulang sebelum periode berikutnya aktif.';end if;
 p:=s->'periods'->0;
 if action='reset' then
  if p->>'status'<>'reopened' then raise exception 'Buka kembali opname terakhir sebelum mengulang Stock Awal.';end if;
  -- Old variance is invalid as soon as its opening changes. Keep physical counts for recount.
  p:=(p-'result'-'catalog'-'closed_at'-'closed_by')||jsonb_build_object('opening','{}'::jsonb,'status','opening_pending','opening_reset_at',now(),'opening_reset_by',auth.uid());
 else
  if p->>'status'<>'opening_pending' then raise exception 'Stock Awal belum dikosongkan.';end if;
  c:=private.so_catalog(d); rows:=private.so_catalog_rows(c);
  for item in select value from jsonb_array_elements(coalesce(p->'opening_catalog','[]'::jsonb)) loop
   if left(item->>'key',2)<>'s:' and not exists(select 1 from jsonb_array_elements(rows) v where v->>'key'=item->>'key') then rows:=rows||jsonb_build_array(item);end if;
  end loop;
  if jsonb_array_length(rows)=0 then raise exception 'Lengkapi Master Barang terlebih dahulu.';end if;
  for item in select value from jsonb_array_elements(rows) where left(value->>'key',2)<>'s:' loop
   if item ? 'error' then raise exception '%',item->>'error';end if;
   k:=item->>'key';r:=input->'counts'->k;qty:=private.so_number(r->>'qty');
   select (value->>'factor')::numeric into factor from jsonb_array_elements(item->'units') where value->>'unit'=r->>'unit';
   if factor is null or factor<=0 then raise exception 'Satuan % tidak valid.',item->>'name';end if;
   counts:=jsonb_set(counts,array[k],to_jsonb(qty*factor),true);
  end loop;
  if counts='{}'::jsonb then raise exception 'Belum ada barang untuk dihitung.';end if;
  if (select count(*) from jsonb_object_keys(coalesce(input->'counts','{}'::jsonb)))<>(select count(*) from jsonb_object_keys(counts)) then raise exception 'Daftar Stock Awal tidak cocok dengan master.';end if;
  p:=p||jsonb_build_object('opening',counts,'opening_catalog',rows,'status','reopened','opening_confirmed_at',now(),'opening_confirmed_by',auth.uid());
 end if;
 s:=jsonb_set(s,'{periods,0}',p);
 update public.stock_opname_state set payload=s,revision=revision+1,updated_at=now() where division_id=d;
 insert into public.stock_opname_requests(request_id,actor_id,division_id,action,payload_hash) values(request,auth.uid(),d,'opening_'||action,md5(input::text));
 return private.so_view(d);
end $$;
create function public.stock_opname_reset_opening(division uuid,expected_revision bigint,request uuid,action text,input jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.so_reset_opening(division,expected_revision,request,action,input); $$;
revoke all on function private.so_reset_opening(uuid,bigint,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.so_reset_opening(uuid,bigint,uuid,text,jsonb) to authenticated;
revoke all on function public.stock_opname_reset_opening(uuid,bigint,uuid,text,jsonb) from public,anon;
grant execute on function public.stock_opname_reset_opening(uuid,bigint,uuid,text,jsonb) to authenticated;
