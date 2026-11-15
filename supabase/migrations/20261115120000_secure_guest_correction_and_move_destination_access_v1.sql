-- Secure guest corrections and require destination membership for Stock Opname Move.
-- Corrections update the guest row and append trusted history in one transaction.

CREATE OR REPLACE FUNCTION private.correct_guest_record(
  p_guest_id uuid,
  p_guest_name text,
  p_pack integer,
  p_phone text,
  p_reason text,
  p_expected_updated_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_guest public.guests%rowtype;
  v_updated public.guests%rowtype;
  v_detail text;
  v_changed_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesi akun tidak valid.';
  END IF;
  IF p_guest_id IS NULL OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'Data koreksi tidak lengkap. Muat ulang sebelum mencoba lagi.';
  END IF;
  IF p_guest_name IS NULL OR length(btrim(p_guest_name)) NOT BETWEEN 1 AND 70 THEN
    RAISE EXCEPTION 'Nama tamu wajib diisi dan maksimal 70 karakter.';
  END IF;
  IF p_pack IS NULL OR p_pack NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'Jumlah pack harus antara 1 dan 30.';
  END IF;
  IF coalesce(length(p_phone), 0) > 80 THEN
    RAISE EXCEPTION 'Nomor WhatsApp maksimal 80 karakter.';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Alasan koreksi wajib diisi dan maksimal 500 karakter.';
  END IF;

  SELECT *
  INTO v_guest
  FROM public.guests
  WHERE id = p_guest_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data tamu tidak ditemukan.';
  END IF;
  IF NOT public.has_workspace_role(v_guest.workspace_id, ARRAY['service']::text[]) THEN
    RAISE EXCEPTION 'Akses koreksi tamu ditolak.';
  END IF;
  IF v_guest.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Data tamu sudah berubah. Muat ulang sebelum mengoreksi.';
  END IF;

  IF v_guest.guest_name IS NOT DISTINCT FROM btrim(p_guest_name)
     AND v_guest.pack IS NOT DISTINCT FROM p_pack
     AND v_guest.phone IS NOT DISTINCT FROM nullif(btrim(coalesce(p_phone, '')), '') THEN
    RAISE EXCEPTION 'Tidak ada perubahan data tamu.';
  END IF;

  v_detail := pg_catalog.concat_ws('; ',
    CASE WHEN v_guest.guest_name IS DISTINCT FROM btrim(p_guest_name)
      THEN pg_catalog.format('Nama: %s → %s', v_guest.guest_name, btrim(p_guest_name)) END,
    CASE WHEN v_guest.pack IS DISTINCT FROM p_pack
      THEN pg_catalog.format('Pack: %s → %s', v_guest.pack, p_pack) END,
    CASE WHEN v_guest.phone IS DISTINCT FROM nullif(btrim(coalesce(p_phone, '')), '')
      THEN pg_catalog.format('WhatsApp: %s → %s', coalesce(v_guest.phone, '—'), coalesce(nullif(btrim(coalesce(p_phone, '')), ''), '—')) END
  );

  UPDATE public.guests
  SET guest_name = btrim(p_guest_name),
      pack = p_pack,
      phone = nullif(btrim(coalesce(p_phone, '')), ''),
      updated_at = pg_catalog.clock_timestamp()
  WHERE id = p_guest_id
  RETURNING * INTO v_updated;

  INSERT INTO public.guest_status_history (
    workspace_id, guest_id, status, label, detail, reason, changed_by, changed_at
  ) VALUES (
    v_updated.workspace_id, v_updated.id, v_updated.status,
    'Dikoreksi', v_detail, btrim(p_reason), auth.uid(), v_updated.updated_at
  ) RETURNING changed_at INTO v_changed_at;

  RETURN pg_catalog.jsonb_build_object(
    'guest', pg_catalog.to_jsonb(v_updated),
    'audit', pg_catalog.jsonb_build_object(
      'changed_at', v_changed_at,
      'label', 'Dikoreksi',
      'detail', v_detail,
      'reason', btrim(p_reason)
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION private.correct_guest_record(uuid, text, integer, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.correct_guest_record(uuid, text, integer, text, text, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.correct_guest_record(
  p_guest_id uuid,
  p_guest_name text,
  p_pack integer,
  p_phone text,
  p_reason text,
  p_expected_updated_at timestamptz
) RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT private.correct_guest_record(
    p_guest_id, p_guest_name, p_pack, p_phone, p_reason, p_expected_updated_at
  );
$function$;

REVOKE ALL ON FUNCTION public.correct_guest_record(uuid, text, integer, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_guest_record(uuid, text, integer, text, text, timestamptz) TO authenticated;


-- Apply the same destination authorization to every Stock Opname Move entry point.
-- Existing function ACLs are preserved by CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION private.so_view(d uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare st public.stock_opname_state%rowtype; c jsonb; p jsonb; targets jsonb;
begin
 if not private.so_allowed(d) then raise exception 'Akses Stock Opname ditolak.'; end if;
 select * into st from public.stock_opname_state where division_id=d;
 c:=private.so_catalog(d);p:=st.payload->'periods'->-1;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.division_id,'name',w.name||' · '||dv.name)),'[]') into targets from public.stock_opname_scopes s join public.divisions dv on dv.id=s.division_id join public.workspaces w on w.id=s.workspace_id where s.enabled and dv.is_active and s.division_id<>d and private.so_allowed(s.division_id);
 return jsonb_build_object('state',coalesce(st.payload,'{"periods":[],"documents":[]}'),'revision',coalesce(st.revision,0),'catalog',private.so_catalog_rows(c),'balance',private.so_balances(coalesce(st.payload,'{}'),coalesce(p,'{}')),'targets',targets);
end $$;

CREATE OR REPLACE FUNCTION private.so_target_catalog(origin uuid,destination uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.so_allowed(origin) or not private.so_allowed(destination) then raise exception 'Tujuan tidak tersedia.';end if;
 return (select coalesce(jsonb_agg(value-'price'-'parts'),'[]') from jsonb_array_elements(private.so_catalog_rows(private.so_catalog(destination))) where left(value->>'key',2)<>'s:');
end $$;

CREATE OR REPLACE FUNCTION private.so_mutate(d uuid,expected_revision bigint,request uuid,action text,input jsonb) returns jsonb
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
  ps:=ps||jsonb_build_array(jsonb_build_object('id',request,'start',((p->>'end')::date+1)::text,'status','active','opening',p->'physical','opening_catalog',p->'catalog','previous_id',p->>'id','created_at',now()));
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
  if exists(select 1 from jsonb_array_elements(coalesce(docs,'[]'::jsonb)) v where v->>'period_id'=p->>'id' and coalesce(v->>'void','false')<>'true' and (v->>'start')::date<=(ps->(pi-1)->>'end')::date) then raise exception 'Transaksi periode berikutnya mendahului tanggal Stock Awal. Periksa sebelum mengonfirmasi.';end if;
  p:=p||jsonb_build_object('status','active','start',((ps->(pi-1)->>'end')::date+1)::text,'opening',ps->(pi-1)->'physical','opening_catalog',ps->(pi-1)->'catalog');
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
    select coalesce(jsonb_object_agg(kind,amount),'{}') into movements from (select case when v->>'type'='expense' then coalesce(v->>'category','expense') else v->>'type' end as kind,sum((z->>'qty')::numeric) amount from jsonb_array_elements(docs) v cross join lateral jsonb_array_elements(v->'postings') z where v->>'period_id'=pid and coalesce(v->>'void','false')<>'true' and z->>'key'=k group by 1) totals;
    result:=result||jsonb_build_array(item||jsonb_build_object('movements',movements,'opening',coalesce((p->'opening'->>k)::numeric,0),'system',coalesce((b->>k)::numeric,0),'physical',qty,'variance',qty-coalesce((b->>k)::numeric,0),'variance_value',(qty-coalesce((b->>k)::numeric,0))*price));
   end loop;
   if counts='{}' then raise exception 'Tidak ada barang untuk opname.';end if;
   p:=p||jsonb_build_object('status','closed','end',end_date,'physical',counts,'result',result,'catalog',rows,'closed_at',now(),'closed_by',auth.uid());
   ps:=jsonb_set(ps,array[pi::text],p);
  else
   docid:=coalesce(nullif(input->>'id',''),request::text);
   select value,ordinality::int-1 into old_doc,idx from jsonb_array_elements(docs) with ordinality where value->>'id'=docid;
   if coalesce((old_doc->>'void')::boolean,false) then raise exception 'Transaksi sudah dibatalkan dan tidak dapat dikoreksi atau disesuaikan lagi.';end if;
   if old_doc is not null and old_doc->>'period_id'<>pid and action<>'adjust_move' then raise exception 'Transaksi periode lama terkunci.';end if;
   if old_doc is not null and action<>'adjust_move' and exists(select 1 from jsonb_array_elements(docs) v where v->>'adjusts'=docid) then raise exception 'Move sudah disesuaikan; transaksi asal terkunci.';end if;
   if old_doc->>'type' in ('move_in','adjustment_in','adjustment') then raise exception 'Koreksi dilakukan dari transaksi asal.';end if;
   if action='void' and old_doc is null then raise exception 'Transaksi tidak ditemukan.';end if;
   if action='adjust_move' then
    if p->>'status'<>'active' then raise exception 'Penyesuaian Move hanya boleh di periode aktif kedua divisi.';end if;
    if old_doc is null or old_doc->>'type' is distinct from 'expense' or old_doc->>'category' is distinct from 'Move' then raise exception 'Pilih transaksi Move asal.';end if;
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
     doc:=jsonb_build_object('id',docid,'period_id',pid,'type',typ,'category',case when typ='expense' then input->>'category' else null end,'start',start_date,'end',end_date,'lines',input->'lines','postings',postings,'catalog_snapshot',c,'created_at',coalesce(old_doc->>'created_at',now()::text),'updated_at',now(),'actor',auth.uid());
    end if;
    if doc->>'category'='Move' then target:=coalesce((input->>'target')::uuid,(old_doc->>'target')::uuid);end if;
   end if;
   if doc->>'category'='Move' and target is null then raise exception 'Pilih tujuan Move yang sudah aktif.';end if;
   if target is not null then
    if target=d or not private.so_allowed(target) then raise exception 'Tujuan Move tidak tersedia atau akses ditolak.';end if;
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


-- Persist Guest Operations changes as one RLS-respecting compare-and-swap batch.
-- A conflict in either table aborts the whole function call, including its other writes.
CREATE OR REPLACE FUNCTION public.save_guest_operations(
  p_workspace_id uuid,
  p_guests jsonb,
  p_reservations jsonb,
  p_settings jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_entry jsonb;
  v_id uuid;
  v_expected_updated_at timestamptz;
  v_updated_at timestamptz;
  v_guest_versions jsonb := '[]'::jsonb;
  v_reservation_versions jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesi akun tidak valid.';
  END IF;
  IF p_workspace_id IS NULL
     OR jsonb_typeof(coalesce(p_guests, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(coalesce(p_reservations, '[]'::jsonb)) <> 'array'
     OR pg_catalog.jsonb_array_length(coalesce(p_guests, '[]'::jsonb)) > 100
     OR pg_catalog.jsonb_array_length(coalesce(p_reservations, '[]'::jsonb)) > 100 THEN
    RAISE EXCEPTION 'Data Guest Operations tidak valid.';
  END IF;

  -- Settings share this transaction so callers never roll back UI state after
  -- guest/reservation rows have already committed.
  IF p_settings IS NOT NULL THEN
    IF jsonb_typeof(p_settings) IS DISTINCT FROM 'object'
       OR jsonb_typeof(p_settings->'seatingDurationMinutes') IS DISTINCT FROM 'number'
       OR p_settings - 'seatingDurationMinutes' <> '{}'::jsonb THEN
      RAISE EXCEPTION 'Pengaturan Guest Operations tidak valid.';
    END IF;
    IF (p_settings->>'seatingDurationMinutes') IS NULL
       OR (p_settings->>'seatingDurationMinutes')::numeric NOT BETWEEN 1 AND 1440
       OR pg_catalog.trunc((p_settings->>'seatingDurationMinutes')::numeric)
          <> (p_settings->>'seatingDurationMinutes')::numeric THEN
      RAISE EXCEPTION 'Durasi duduk harus bilangan bulat antara 1 dan 1440 menit.';
    END IF;

    INSERT INTO public.workspace_settings (
      workspace_id, setting_key, setting_value, updated_at
    ) VALUES (
      p_workspace_id, 'guest_operations', p_settings, pg_catalog.clock_timestamp()
    )
    ON CONFLICT (workspace_id, setting_key) DO UPDATE
    SET setting_value = EXCLUDED.setting_value,
        updated_at = EXCLUDED.updated_at
    WHERE public.workspace_settings.setting_value IS DISTINCT FROM EXCLUDED.setting_value;
  END IF;

  -- Save reservations first so a newly inserted guest can reference its reservation.
  FOR v_entry IN
    SELECT value FROM pg_catalog.jsonb_array_elements(coalesce(p_reservations, '[]'::jsonb)) ORDER BY value->>'id'
  LOOP
    IF jsonb_typeof(v_entry) <> 'object'
       OR v_entry->>'workspace_id' IS DISTINCT FROM p_workspace_id::text THEN
      RAISE EXCEPTION 'Data reservasi tidak valid.';
    END IF;

    v_id := nullif(v_entry->>'id', '')::uuid;
    IF v_id IS NULL THEN RAISE EXCEPTION 'ID reservasi tidak valid.'; END IF;
    v_expected_updated_at := nullif(v_entry->>'expected_updated_at', '')::timestamptz;

    IF v_expected_updated_at IS NULL THEN
      INSERT INTO public.reservations (
        id, workspace_id, code, reservation_date, reservation_time,
        guest_name, pack, phone, smoking, note, table_label, status, created_at
      ) VALUES (
        v_id, p_workspace_id, v_entry->>'code',
        (v_entry->>'reservation_date')::date,
        (v_entry->>'reservation_time')::time,
        v_entry->>'guest_name',
        (v_entry->>'pack')::integer,
        nullif(v_entry->>'phone', ''),
        nullif(v_entry->>'smoking', ''),
        nullif(v_entry->>'note', ''),
        nullif(v_entry->>'table_label', ''),
        v_entry->>'status',
        (v_entry->>'created_at')::timestamptz
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING updated_at INTO v_updated_at;

      IF NOT FOUND THEN
        SELECT r.updated_at INTO v_updated_at
        FROM public.reservations AS r
        WHERE r.id = v_id
          AND r.workspace_id = p_workspace_id
          AND r.code IS NOT DISTINCT FROM v_entry->>'code'
          AND r.reservation_date IS NOT DISTINCT FROM (v_entry->>'reservation_date')::date
          AND r.reservation_time IS NOT DISTINCT FROM (v_entry->>'reservation_time')::time
          AND r.guest_name IS NOT DISTINCT FROM v_entry->>'guest_name'
          AND r.pack IS NOT DISTINCT FROM (v_entry->>'pack')::integer
          AND r.phone IS NOT DISTINCT FROM nullif(v_entry->>'phone', '')
          AND r.smoking IS NOT DISTINCT FROM nullif(v_entry->>'smoking', '')
          AND r.note IS NOT DISTINCT FROM nullif(v_entry->>'note', '')
          AND r.table_label IS NOT DISTINCT FROM nullif(v_entry->>'table_label', '')
          AND r.status IS NOT DISTINCT FROM v_entry->>'status'
          AND r.created_at IS NOT DISTINCT FROM (v_entry->>'created_at')::timestamptz
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'ID reservasi sudah digunakan atau aksesnya tidak tersedia.';
        END IF;
      END IF;
    ELSE
      UPDATE public.reservations
      SET reservation_date = (v_entry->>'reservation_date')::date,
          reservation_time = (v_entry->>'reservation_time')::time,
          guest_name = v_entry->>'guest_name',
          pack = (v_entry->>'pack')::integer,
          phone = nullif(v_entry->>'phone', ''),
          smoking = nullif(v_entry->>'smoking', ''),
          note = nullif(v_entry->>'note', ''),
          table_label = nullif(v_entry->>'table_label', ''),
          status = v_entry->>'status',
          updated_at = pg_catalog.clock_timestamp()
      WHERE id = v_id
        AND workspace_id = p_workspace_id
        AND updated_at = v_expected_updated_at
      RETURNING updated_at INTO v_updated_at;

      IF NOT FOUND THEN
        -- A retried RPC after a lost response is successful only if the row
        -- already contains this exact requested state.
        SELECT r.updated_at INTO v_updated_at
        FROM public.reservations AS r
        WHERE r.id = v_id
          AND r.workspace_id = p_workspace_id
          AND r.code IS NOT DISTINCT FROM v_entry->>'code'
          AND r.reservation_date IS NOT DISTINCT FROM (v_entry->>'reservation_date')::date
          AND r.reservation_time IS NOT DISTINCT FROM (v_entry->>'reservation_time')::time
          AND r.guest_name IS NOT DISTINCT FROM v_entry->>'guest_name'
          AND r.pack IS NOT DISTINCT FROM (v_entry->>'pack')::integer
          AND r.phone IS NOT DISTINCT FROM nullif(v_entry->>'phone', '')
          AND r.smoking IS NOT DISTINCT FROM nullif(v_entry->>'smoking', '')
          AND r.note IS NOT DISTINCT FROM nullif(v_entry->>'note', '')
          AND r.table_label IS NOT DISTINCT FROM nullif(v_entry->>'table_label', '')
          AND r.status IS NOT DISTINCT FROM v_entry->>'status'
          AND r.created_at IS NOT DISTINCT FROM (v_entry->>'created_at')::timestamptz
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'Data reservasi sudah berubah di perangkat lain atau aksesnya tidak tersedia. Muat ulang sebelum menyimpan.';
        END IF;
      END IF;
    END IF;

    v_reservation_versions := v_reservation_versions || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('id', v_id, 'updated_at', v_updated_at)
    );
  END LOOP;

  FOR v_entry IN
    SELECT value FROM pg_catalog.jsonb_array_elements(coalesce(p_guests, '[]'::jsonb)) ORDER BY value->>'id'
  LOOP
    IF jsonb_typeof(v_entry) <> 'object'
       OR v_entry->>'workspace_id' IS DISTINCT FROM p_workspace_id::text THEN
      RAISE EXCEPTION 'Data tamu tidak valid.';
    END IF;

    v_id := nullif(v_entry->>'id', '')::uuid;
    IF v_id IS NULL THEN RAISE EXCEPTION 'ID tamu tidak valid.'; END IF;
    v_expected_updated_at := nullif(v_entry->>'expected_updated_at', '')::timestamptz;

    IF v_expected_updated_at IS NULL THEN
      INSERT INTO public.guests (
        id, workspace_id, reservation_id, ticket, service_date,
        guest_name, pack, phone, status, created_at, seated_at, resolved_at
      ) VALUES (
        v_id, p_workspace_id, nullif(v_entry->>'reservation_id', '')::uuid,
        v_entry->>'ticket', (v_entry->>'service_date')::date,
        v_entry->>'guest_name', (v_entry->>'pack')::integer,
        nullif(v_entry->>'phone', ''), v_entry->>'status',
        (v_entry->>'created_at')::timestamptz,
        nullif(v_entry->>'seated_at', '')::timestamptz,
        nullif(v_entry->>'resolved_at', '')::timestamptz
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING updated_at INTO v_updated_at;

      IF NOT FOUND THEN
        SELECT g.updated_at INTO v_updated_at
        FROM public.guests AS g
        WHERE g.id = v_id
          AND g.workspace_id = p_workspace_id
          AND g.reservation_id IS NOT DISTINCT FROM nullif(v_entry->>'reservation_id', '')::uuid
          AND g.ticket IS NOT DISTINCT FROM v_entry->>'ticket'
          AND g.service_date IS NOT DISTINCT FROM (v_entry->>'service_date')::date
          AND g.guest_name IS NOT DISTINCT FROM v_entry->>'guest_name'
          AND g.pack IS NOT DISTINCT FROM (v_entry->>'pack')::integer
          AND g.phone IS NOT DISTINCT FROM nullif(v_entry->>'phone', '')
          AND g.status IS NOT DISTINCT FROM v_entry->>'status'
          AND g.created_at IS NOT DISTINCT FROM (v_entry->>'created_at')::timestamptz
          AND g.seated_at IS NOT DISTINCT FROM nullif(v_entry->>'seated_at', '')::timestamptz
          AND g.resolved_at IS NOT DISTINCT FROM nullif(v_entry->>'resolved_at', '')::timestamptz
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'ID tamu sudah digunakan atau aksesnya tidak tersedia.';
        END IF;
      END IF;
    ELSE
      UPDATE public.guests
      SET reservation_id = nullif(v_entry->>'reservation_id', '')::uuid,
          service_date = (v_entry->>'service_date')::date,
          guest_name = v_entry->>'guest_name',
          pack = (v_entry->>'pack')::integer,
          phone = nullif(v_entry->>'phone', ''),
          status = v_entry->>'status',
          seated_at = nullif(v_entry->>'seated_at', '')::timestamptz,
          resolved_at = nullif(v_entry->>'resolved_at', '')::timestamptz,
          updated_at = pg_catalog.clock_timestamp()
      WHERE id = v_id
        AND workspace_id = p_workspace_id
        AND updated_at = v_expected_updated_at
      RETURNING updated_at INTO v_updated_at;

      IF NOT FOUND THEN
        -- Treat a replay as success only when every mutable value is identical.
        SELECT g.updated_at INTO v_updated_at
        FROM public.guests AS g
        WHERE g.id = v_id
          AND g.workspace_id = p_workspace_id
          AND g.reservation_id IS NOT DISTINCT FROM nullif(v_entry->>'reservation_id', '')::uuid
          AND g.ticket IS NOT DISTINCT FROM v_entry->>'ticket'
          AND g.service_date IS NOT DISTINCT FROM (v_entry->>'service_date')::date
          AND g.guest_name IS NOT DISTINCT FROM v_entry->>'guest_name'
          AND g.pack IS NOT DISTINCT FROM (v_entry->>'pack')::integer
          AND g.phone IS NOT DISTINCT FROM nullif(v_entry->>'phone', '')
          AND g.status IS NOT DISTINCT FROM v_entry->>'status'
          AND g.created_at IS NOT DISTINCT FROM (v_entry->>'created_at')::timestamptz
          AND g.seated_at IS NOT DISTINCT FROM nullif(v_entry->>'seated_at', '')::timestamptz
          AND g.resolved_at IS NOT DISTINCT FROM nullif(v_entry->>'resolved_at', '')::timestamptz
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'Data tamu sudah berubah di perangkat lain atau aksesnya tidak tersedia. Muat ulang sebelum menyimpan.';
        END IF;
      END IF;
    END IF;

    v_guest_versions := v_guest_versions || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('id', v_id, 'updated_at', v_updated_at)
    );
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'guests', v_guest_versions,
    'reservations', v_reservation_versions
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.save_guest_operations(uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_guest_operations(uuid, jsonb, jsonb, jsonb) TO authenticated;
