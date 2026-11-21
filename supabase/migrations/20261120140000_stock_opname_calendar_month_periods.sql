-- Calendar-month Stock Opname periods.
--
-- A period now represents one calendar month. Documents are owned by the month
-- of their document date, not by whichever period happens to be last. A month
-- created before the previous month is counted starts with a provisional zero
-- opening; closing the previous month derives this month's normalized opening
-- from the saved physical count and the movements through the count date.
--
-- Legacy period IDs stay attached to their period and keep counting through
-- legacy_period_ids, so existing documents remain readable and reconcile.
CREATE OR REPLACE FUNCTION private.so_month_index(ps jsonb, m date) RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
 select max(ordinality::int-1)
 from jsonb_array_elements(coalesce(ps,'[]'::jsonb)) with ordinality
 where date_trunc('month',(value->>'start')::date)::date=m
$$;

CREATE OR REPLACE FUNCTION private.so_month_count(ps jsonb, m date) RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
 select count(*)::int
 from jsonb_array_elements(coalesce(ps,'[]'::jsonb)) value
 where date_trunc('month',(value->>'start')::date)::date=m
$$;

-- Returns the stored period for a month, or builds a new month period.
-- The caller appends the result to periods when it did not exist yet.
CREATE OR REPLACE FUNCTION private.so_month_period(s jsonb, m date) RETURNS jsonb
    LANGUAGE plpgsql VOLATILE
    SET search_path TO ''
    AS $$
DECLARE
 ps jsonb:=coalesce(s->'periods','[]'::jsonb);
 p jsonb;
 prev jsonb;
 cnt date;
 op jsonb;
 month_end date:=(m+interval '1 month - 1 day')::date;
BEGIN
 IF m IS NULL OR m<>date_trunc('month',m)::date THEN
  RAISE EXCEPTION 'Bulan Stock Opname tidak valid.';
 END IF;
 p:=ps->private.so_month_index(ps,m);
 IF p IS NOT NULL THEN RETURN p; END IF;
 SELECT value INTO prev
 FROM jsonb_array_elements(ps) value
 WHERE (value->>'start')::date<m
 ORDER BY (value->>'start')::date DESC LIMIT 1;
 IF prev IS NOT NULL AND prev->>'status'='closed' AND prev->'physical' IS NOT NULL THEN
  cnt:=coalesce((prev->>'counted_at')::date,(prev->>'end')::date);
  IF cnt>=m THEN
   op:=private.so_month_normalized_opening(s,prev->'physical',m,cnt);
  ELSE
   op:=prev->'physical';
  END IF;
  RETURN jsonb_build_object(
   'id',gen_random_uuid(),'start',m,'month',to_char(m,'YYYY-MM'),'end',month_end,
   'status','active','opening',op,'opening_source','previous_close',
   'opening_catalog',coalesce(prev->'catalog','[]'::jsonb),'previous_id',prev->>'id','created_at',now()
  );
 END IF;
 RETURN jsonb_build_object(
  'id',gen_random_uuid(),'start',m,'month',to_char(m,'YYYY-MM'),'end',month_end,
  'status','active','opening','{}'::jsonb,'opening_source','provisional',
  'opening_catalog','[]'::jsonb,'previous_id',prev->>'id','created_at',now()
 );
END $$;

-- Recomputes a month's opening from the previous close. Called after any
-- create/edit/void so a late count date cannot leave a stale opening.
CREATE OR REPLACE FUNCTION private.so_refresh_opening(s jsonb, m date) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
DECLARE
 ps jsonb:=coalesce(s->'periods','[]'::jsonb);
 idx int:=private.so_month_index(ps,m);
 p jsonb;
 prev jsonb;
 cnt date;
 op jsonb;
BEGIN
 IF idx IS NULL THEN RAISE EXCEPTION 'Bulan Stock Opname tidak ditemukan.'; END IF;
 p:=ps->idx;
 SELECT value INTO prev
 FROM jsonb_array_elements(ps) value
 WHERE (value->>'start')::date<m
 ORDER BY (value->>'start')::date DESC LIMIT 1;
 IF prev IS NOT NULL AND prev->>'status'='closed' AND prev->'physical' IS NOT NULL THEN
  cnt:=coalesce((prev->>'counted_at')::date,(prev->>'end')::date);
  IF cnt>=m THEN
   op:=private.so_month_normalized_opening(s,prev->'physical',m,cnt);
  ELSE
   op:=prev->'physical';
  END IF;
  p:=p||jsonb_build_object(
   'opening',op,'opening_source','previous_close',
   'opening_catalog',coalesce(prev->'catalog',p->'opening_catalog')
  );
 END IF;
 RETURN p;
END $$;

-- Inserts a period in calendar order. Array position is never used as identity;
-- sorting keeps previous/next navigation and legacy last-period reads sane.
CREATE OR REPLACE FUNCTION private.so_add_period(ps jsonb, p jsonb) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
 select coalesce(jsonb_agg(value order by (value->>'start')::date,ord),'[]'::jsonb)
 from (
  select value,0 as ord from jsonb_array_elements(coalesce(ps,'[]'::jsonb))
  union all select p,1
 ) x
$$;

COMMENT ON FUNCTION private.so_month_index(jsonb,date)
  IS 'Index of the calendar-month period containing a month start, or null.';
COMMENT ON FUNCTION private.so_month_period(jsonb,date)
  IS 'Stored or new calendar-month period with provisional or derived opening.';
COMMENT ON FUNCTION private.so_add_period(jsonb,jsonb)
  IS 'Adds a period and keeps the periods array sorted by calendar month.';
COMMENT ON FUNCTION private.so_refresh_opening(jsonb,date)
  IS 'Recomputes a month opening from the previous saved physical count.';

CREATE OR REPLACE FUNCTION private.so_mutate(d uuid, expected_revision bigint, request uuid, action text, input jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
#variable_conflict use_variable
declare
 st public.stock_opname_state%rowtype; s jsonb; ps jsonb; docs jsonb; c jsonb; rows jsonb; fresh_rows jsonb;
 item jsonb; r jsonb; l jsonb; doc jsonb; old_doc jsonb; postings jsonb:='[]'; counts jsonb:='{}'; result jsonb:='[]';
 b jsonb; movements jsonb; k text; qty numeric; factor numeric; price numeric; total numeric; idx int; pi int; p_idx int; j int;
 start_date date; end_date date; pid text; docid text; typ text; target uuid; target_st public.stock_opname_state%rowtype;
 target_s jsonb; target_p jsonb; target_item jsonb; target_posts jsonb:='[]'; target_doc jsonb; p jsonb; normalized jsonb;
 m date; nm date; nidx int; nextp jsonb; cnt_date date; op jsonb; month_end date; target_m date; target_idx int;
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
 s:=st.payload; ps:=coalesce(s->'periods','[]'::jsonb); docs:=coalesce(s->'documents','[]'::jsonb); c:=private.so_catalog(d);
 if action='initial' then
  if jsonb_array_length(ps)>0 then raise exception 'Stock Awal pertama sudah diisi.'; end if;
  start_date:=(input->>'date')::date;
  if start_date is null or start_date>(now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal awal tidak valid.'; end if;
  m:=date_trunc('month',start_date)::date;month_end:=(m+interval '1 month - 1 day')::date;
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
  ps:=jsonb_build_array(jsonb_build_object(
   'id',request,'start',start_date,'month',to_char(m,'YYYY-MM'),'end',month_end,
   'status','active','opening',counts,'opening_source','initial','opening_catalog',rows,'created_at',now()
  ));
 elsif action='activate' then
  -- Legacy manual activation. New traffic creates the following calendar month
  -- automatically at close, so this stays available only for old clients.
  select value into p from jsonb_array_elements(ps) value order by (value->>'start')::date desc limit 1;
  if p is null then raise exception 'Selesaikan opname terlebih dahulu.'; end if;
  -- The requested next month already exists from a calendar close: no-op.
  if p->>'status'<>'closed' and p->>'opening_source'='previous_close' then return private.so_view(d); end if;
  if p->>'status'<>'closed' then raise exception 'Selesaikan opname terlebih dahulu.'; end if;
  m:=(date_trunc('month',(p->>'start')::date)+interval '1 month')::date;
  if private.so_month_index(ps,m) is not null then raise exception 'Bulan berikutnya sudah tersedia.'; end if;
  ps:=private.so_add_period(ps,private.so_month_period(jsonb_build_object('periods',ps,'documents',docs),m));
 elsif action='reopen' then
  m:=nullif(input->>'month','')::date;
  if m is null then
   select date_trunc('month',(value->>'start')::date)::date into m
   from jsonb_array_elements(ps) value
   where value->>'status'='closed'
   order by (value->>'start')::date desc limit 1;
  end if;
  p_idx:=private.so_month_index(ps,m);
  if p_idx is null then raise exception 'Tidak ada opname terakhir untuk dibuka kembali.'; end if;
  p:=ps->p_idx;
  if p->>'status'<>'closed' then raise exception 'Tidak ada opname terakhir untuk dibuka kembali.'; end if;
  nidx:=private.so_month_index(ps,(m+interval '1 month')::date);
  if nidx is not null and ps->nidx->>'status'='closed' then
   raise exception 'Bulan berikutnya sudah ditutup. Buka kembali bulan itu terlebih dahulu.';
  end if;
  p:=p||jsonb_build_object('status','reopened');
  ps:=jsonb_set(ps,array[p_idx::text],p);
  if nidx is not null then
   -- The following month becomes provisional again until this correction closes.
   nextp:=ps->nidx||jsonb_build_object('opening','{}'::jsonb,'opening_source','provisional','status','held');
   ps:=jsonb_set(ps,array[nidx::text],nextp);
  end if;
 elsif action='reactivate' then
  select value into p from jsonb_array_elements(ps) value order by (value->>'start')::date desc limit 1;
  if p is null or p->>'status'<>'held' then raise exception 'Selesaikan koreksi opname terlebih dahulu.'; end if;
  p:=p||jsonb_build_object('status','active');
  ps:=jsonb_set(ps,array[(jsonb_array_length(ps)-1)::text],p);
 elsif action in ('save','void','close','adjust_move') then
  if action='close' then
   m:=nullif(input->>'month','')::date;
   if m is null then
    -- Backward compatibility: the oldest unfinished month is the one being closed.
    select date_trunc('month',(value->>'start')::date)::date into m
    from jsonb_array_elements(ps) value
    where value->>'status' in ('active','reopened','held')
    order by (value->>'start')::date limit 1;
   end if;
   if m is null then m:=date_trunc('month',(input->>'date')::date)::date; end if;
   if m is null or m<>date_trunc('month',m)::date then raise exception 'Bulan opname tidak valid.'; end if;
   p_idx:=private.so_month_index(ps,m);
   if p_idx is null then raise exception 'Bulan opname tidak ditemukan.'; end if;
   if private.so_month_count(ps,m)>1 then raise exception 'Ada lebih dari satu periode pada bulan ini. Rapikan data lama terlebih dahulu.'; end if;
   p:=ps->p_idx;
   if p->>'status' not in ('active','reopened') then raise exception 'Bulan ini belum dapat ditutup.'; end if;
   pid:=p->>'id';
   cnt_date:=(input->>'date')::date;
   month_end:=(m+interval '1 month - 1 day')::date;
   if cnt_date is null or cnt_date<greatest(m,(p->>'start')::date) or cnt_date>(now() at time zone 'Asia/Jakarta')::date or cnt_date>=(m+interval '2 months')::date then raise exception 'Tanggal opname tidak valid.'; end if;
   if exists(select 1 from jsonb_array_elements(docs) v where coalesce(v->>'void','false')<>'true' and date_trunc('month',(v->>'end')::date)::date=m and v->>'period_id'<>p->>'id' and not (coalesce(p->'legacy_period_ids','[]'::jsonb) ? (v->>'period_id'))) then raise exception 'Ada transaksi bulan ini yang belum terhubung ke periode. Rapikan data lama terlebih dahulu.'; end if;
   if exists(select 1 from jsonb_array_elements(docs) v where coalesce(v->>'void','false')<>'true' and v->>'period_id'=p->>'id' and v->>'type'='sales' and (v->>'start')::date<=cnt_date and (v->>'end')::date>cnt_date) then raise exception 'Rentang Sales melewati batas opname. Perbaiki rentang terlebih dahulu.'; end if;
   if exists(select 1 from jsonb_array_elements(docs) v where coalesce(v->>'void','false')<>'true' and v->>'period_id'=p->>'id' and (v->>'end')::date>cnt_date) then raise exception 'Ada transaksi setelah tanggal opname. Koreksi tanggal atau transaksi dahulu.'; end if;
   b:=private.so_balances(s,p,cnt_date);rows:=coalesce(p->'catalog',private.so_catalog_rows(c));
   -- Reclosing an explicitly reopened period refreshes material valuation from
   -- the latest Master Barang price while preserving its historical catalog
   -- structure, conversions, and WIP/menu recipe snapshots.
   if p->>'status'='reopened' and jsonb_array_length(rows)>0 then
    fresh_rows:=private.so_catalog_rows(c);
    for j in 0..jsonb_array_length(rows)-1 loop
     item:=rows->j;
     if left(item->>'key',2)='m:' then
      select value into r from jsonb_array_elements(fresh_rows) where value->>'key'=item->>'key' and not (value ? 'error');
      if r is not null then rows:=jsonb_set(rows,array[j::text],item||jsonb_build_object('price',r->'price'));end if;
     end if;
    end loop;
   end if;
   -- Keep opening items and snapshot-only items even when a catalog item is disabled.
   for item in select value from jsonb_array_elements(coalesce(p->'opening_catalog','[]')) loop
    if not exists(select 1 from jsonb_array_elements(rows) v where v->>'key'=item->>'key') then rows:=rows||jsonb_build_array(item);end if;
   end loop;
   for doc in select value from jsonb_array_elements(docs) where (value->>'period_id'=p->>'id' or coalesce(p->'legacy_period_ids','[]'::jsonb) ? (value->>'period_id')) and coalesce(value->>'void','false')<>'true' loop
    for item in select value from jsonb_array_elements(doc->'postings') loop
     if not exists(select 1 from jsonb_array_elements(rows) v where v->>'key'=item->>'key') then rows:=rows||jsonb_build_array(item);end if;
    end loop;
   end loop;
   for item in select value from jsonb_array_elements(rows) where left(value->>'key',2)<>'s:' loop
    if item ? 'error' then raise exception '%',item->>'error';end if;
    k:=item->>'key';r:=input->'counts'->k;qty:=private.so_number(r->>'qty');
    select (value->>'factor')::numeric into factor from jsonb_array_elements(item->'units') where value->>'unit'=r->>'unit';
    if factor is null or factor<=0 then raise exception 'Satuan % tidak valid.',item->>'name';end if;
    counts:=jsonb_set(counts,array[k],to_jsonb(qty*factor),true);
   end loop;
   if counts='{}' then raise exception 'Tidak ada barang untuk opname.';end if;
   nm:=(m+interval '1 month')::date;
   -- A count performed in the following month still closes this month. Remove
   -- the following month's movements through the count date so the close and
   -- the derived opening describe the same end-of-month quantity.
   if cnt_date>=nm then
    normalized:=private.so_month_normalized_opening(jsonb_build_object('periods',ps,'documents',docs),counts,nm,cnt_date);
   else
    normalized:=counts;
   end if;
   for item in select value from jsonb_array_elements(rows) where left(value->>'key',2)<>'s:' loop
    k:=item->>'key';qty:=coalesce((normalized->>k)::numeric,0);price:=(item->>'price')::numeric;
    select coalesce(jsonb_object_agg(kind,amount),'{}') into movements from (select case when v->>'type'='expense' then coalesce(v->>'category','expense') else v->>'type' end as kind,sum((z->>'qty')::numeric) amount from jsonb_array_elements(docs) v cross join lateral jsonb_array_elements(v->'postings') z where (v->>'period_id'=pid or coalesce(p->'legacy_period_ids','[]'::jsonb) ? (v->>'period_id')) and coalesce(v->>'void','false')<>'true' and z->>'key'=k group by 1) totals;
    result:=result||jsonb_build_array(item||jsonb_build_object('movements',movements,'opening',coalesce((p->'opening'->>k)::numeric,0),'system',coalesce((b->>k)::numeric,0),'physical',qty,'variance',qty-coalesce((b->>k)::numeric,0),'variance_value',(qty-coalesce((b->>k)::numeric,0))*price));
   end loop;
   p:=p||jsonb_build_object('status','closed','end',month_end,'counted_at',cnt_date,'physical',counts,'normalized',normalized,'result',result,'catalog',rows,'closed_at',now(),'closed_by',auth.uid());
   ps:=jsonb_set(ps,array[p_idx::text],p);
   -- The next calendar month's opening is derived now, atomically with this close.
   op:=normalized;
   nidx:=private.so_month_index(ps,nm);
   if nidx is null then
    ps:=private.so_add_period(ps,jsonb_build_object(
     'id',gen_random_uuid(),'start',nm,'month',to_char(nm,'YYYY-MM'),'end',(nm+interval '1 month - 1 day')::date,
     'status','active','opening',op,'opening_source','previous_close','opening_catalog',rows,
     'previous_id',p->>'id','created_at',now()
    ));
   else
    nextp:=ps->nidx;
    if nextp->>'status'='closed' then raise exception 'Bulan berikutnya sudah ditutup. Buka kembali dulu sebelum mengubah Stock Awal.'; end if;
    nextp:=nextp||jsonb_build_object('opening',op,'opening_source','previous_close','opening_catalog',rows,'previous_id',p->>'id');
    if nextp->>'status' in ('held','opening_pending') then nextp:=nextp||jsonb_build_object('status','active'); end if;
    ps:=jsonb_set(ps,array[nidx::text],nextp);
   end if;
  else
   docid:=coalesce(nullif(input->>'id',''),request::text);
   select value,ordinality::int-1 into old_doc,idx from jsonb_array_elements(docs) with ordinality where value->>'id'=docid;
   if action='void' then
    if old_doc is null then raise exception 'Transaksi tidak ditemukan.'; end if;
    m:=date_trunc('month',(old_doc->>'end')::date)::date;
   else
    start_date:=coalesce((input->>'start')::date,(old_doc->>'start')::date);end_date:=coalesce((input->>'end')::date,(old_doc->>'end')::date);
    if start_date is null or end_date is null or end_date<start_date then raise exception 'Tanggal transaksi tidak valid.'; end if;
    m:=date_trunc('month',end_date)::date;
   end if;
   p_idx:=private.so_month_index(ps,m);
   if p_idx is null then
    if jsonb_array_length(ps)=0 then raise exception 'Isi Stock Awal terlebih dahulu.'; end if;
    if m<(select min(date_trunc('month',(value->>'start')::date)::date) from jsonb_array_elements(ps) value) then raise exception 'Tidak dapat mencatat transaksi sebelum Stock Awal pertama.'; end if;
    ps:=private.so_add_period(ps,private.so_month_period(jsonb_build_object('periods',ps,'documents',docs),m));
    p_idx:=private.so_month_index(ps,m);
   end if;
   if private.so_month_count(ps,m)>1 then raise exception 'Ada lebih dari satu periode pada bulan ini. Rapikan data lama terlebih dahulu.'; end if;
   p:=ps->p_idx;
   if coalesce((old_doc->>'void')::boolean,false) then raise exception 'Transaksi sudah dibatalkan dan tidak dapat dikoreksi atau disesuaikan lagi.';end if;
   if p->>'status'='closed' then raise exception 'Bulan ini sudah ditutup. Buka kembali opname bulan ini untuk mengoreksi.'; end if;
   if p->>'status' not in ('active','reopened','held') then raise exception 'Stock Awal bulan ini belum siap. Periksa opname sebelumnya.'; end if;
   if p->>'status'='held' then p:=p||jsonb_build_object('status','active'); end if;
   pid:=p->>'id';
   if old_doc is not null and old_doc->>'type' in ('move_in','adjustment_in','adjustment') then raise exception 'Koreksi dilakukan dari transaksi asal.';end if;
   if old_doc is not null and action<>'adjust_move' and exists(select 1 from jsonb_array_elements(docs) v where v->>'adjusts'=docid) then raise exception 'Move sudah disesuaikan; transaksi asal terkunci.';end if;
   if action='adjust_move' then
    if p->>'status'<>'active' then raise exception 'Penyesuaian Move hanya boleh di periode aktif kedua divisi.';end if;
    if old_doc is null or old_doc->>'type' is distinct from 'expense' or old_doc->>'category' is distinct from 'Move' then raise exception 'Pilih transaksi Move asal.';end if;
    if exists(select 1 from jsonb_array_elements(docs) v where v->>'adjusts'=docid) then raise exception 'Move sudah memiliki penyesuaian.';end if;
    -- Reverse old transfer in both active periods. A corrected new Move is separate.
    postings:='[]';for l in select value from jsonb_array_elements(old_doc->'postings') loop postings:=postings||jsonb_build_array(l||jsonb_build_object('qty',-(l->>'qty')::numeric));end loop;
    target:=(old_doc->>'target')::uuid;
    doc:=jsonb_build_object('id',request,'period_id',pid,'type','adjustment','category','Move','target',target,'adjusts',docid,'start',old_doc->>'start','end',old_doc->>'end','postings',postings,'created_at',now(),'actor',auth.uid());
   else
    if action='void' then
     doc:=old_doc||jsonb_build_object('void',true,'updated_at',now());
    else
     typ:=input->>'type';
     if typ not in ('receipt','expense','production','sales') or typ is null then raise exception 'Jenis transaksi tidak valid.'; end if;
     if start_date<greatest(m,coalesce((p->>'start')::date,m)) or end_date>=(m+interval '1 month')::date or end_date>(now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal transaksi di luar periode aktif.'; end if;
     if p->>'status'='reopened' and end_date>coalesce((p->>'counted_at')::date,(p->>'end')::date) then raise exception 'Koreksi harus tetap di periode opname lama.'; end if;
     if typ<>'sales' and start_date<>end_date then raise exception 'Transaksi harian hanya satu tanggal.'; end if;
     if typ='sales' then
      if date_trunc('month',start_date)<>date_trunc('month',end_date) then raise exception 'Rentang Sales tidak boleh melewati pergantian bulan. Pisahkan menjadi dua transaksi.'; end if;
      if coalesce(input->>'confirm_overlap','false')<>'true' and exists(select 1 from jsonb_array_elements(docs) v where v->>'period_id'=pid and v->>'type'='sales' and v->>'id'<>docid and coalesce(v->>'void','false')<>'true' and (v->>'start')::date<=end_date and (v->>'end')::date>=start_date) then raise exception 'SALES_OVERLAP: Konfirmasi tambahan Sales untuk rentang yang bertumpuk.'; end if;
     end if;
     if old_doc is not null and old_doc->>'type'<>typ then raise exception 'Jenis transaksi tidak dapat diubah.'; end if;
     if old_doc is not null and date_trunc('month',(old_doc->>'end')::date)<>date_trunc('month',end_date) then raise exception 'Tanggal transaksi tidak boleh pindah bulan. Batalkan lalu buat transaksi baru.'; end if;
     if typ='expense' and coalesce(input->>'category','') not in ('Kalibrasi','RnD','QC','Suplies','Move','Waste','Lainnya') then raise exception 'Pilih kategori pengeluaran.'; end if;
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
    if target=d or not exists(select 1 from public.stock_opname_scopes sc join public.divisions dv on dv.id=sc.division_id where sc.division_id=target and sc.enabled and dv.is_active) then raise exception 'Tujuan Move belum aktif.';end if;
    if old_doc ? 'target' and old_doc->>'target'<>target::text then raise exception 'Tujuan Move tidak dapat diganti. Batalkan lalu buat baru.';end if;
    select * into target_st from public.stock_opname_state where division_id=target for update;
    if target_st.payload is null then raise exception 'Stock Awal tujuan belum aktif.'; end if;
    target_s:=target_st.payload;target_m:=date_trunc('month',(doc->>'end')::date)::date;
    target_idx:=private.so_month_index(target_s->'periods',target_m);
    if target_idx is null then
     if jsonb_array_length(coalesce(target_s->'periods','[]'::jsonb))=0 then raise exception 'Stock Awal tujuan belum aktif.'; end if;
     target_p:=private.so_month_period(target_s,target_m);
     target_s:=jsonb_set(target_s,'{periods}',private.so_add_period(target_s->'periods',target_p));
     target_idx:=private.so_month_index(target_s->'periods',target_m);
    else
     target_p:=target_s->'periods'->target_idx;
    end if;
    if target_p->>'status'='closed' then raise exception 'Opname tujuan sudah ditutup. Gunakan penyesuaian Move.'; end if;
    if target_p->>'status' not in ('active','reopened','held') then raise exception 'Stock Awal tujuan belum aktif.'; end if;
    if old_doc is not null then
     select value into target_doc from jsonb_array_elements(target_s->'documents') where value->>'source_id'=docid;
     if action='adjust_move' and old_doc->>'period_id'=pid and target_doc->>'period_id'=target_p->>'id' then raise exception 'Kedua periode masih aktif. Gunakan edit atau batalkan Move.'; end if;
     if action<>'adjust_move' and target_doc->>'period_id'<>target_p->>'id' then raise exception 'Opname tujuan sudah ditutup. Gunakan penyesuaian Move.'; end if;
    end if;
    for l in select value from jsonb_array_elements(doc->'postings') loop
     -- Explicit destination identity mapping; never assume IDs match across divisions.
     select value into r from jsonb_array_elements(coalesce(input->'mapping','[]')) where value->>'source'=l->>'key';
     if r is null and target_doc is not null then select value into target_item from jsonb_array_elements(target_doc->'postings') where value->>'source_key'=l->>'key';
     elsif r is not null then target_item:=private.so_item(private.so_catalog(target),r->>'target');
     else raise exception 'Pilih padanan barang di tujuan Move.'; end if;
     if target_item is null or target_item->>'unit'<>l->>'unit' then raise exception 'Satuan dasar barang tujuan harus sama.'; end if;
     target_posts:=target_posts||jsonb_build_array((target_item-'parts')||jsonb_build_object('source_key',l->>'key','qty',-(l->>'qty')::numeric));
    end loop;
    doc:=doc||jsonb_build_object('target',target);
    target_doc:=jsonb_build_object('id','move:'||(doc->>'id'),'source_id',doc->>'id','source_division',d,'period_id',target_p->>'id','type',case when action='adjust_move' then 'adjustment_in' else 'move_in' end,'start',doc->>'start','end',doc->>'end','void',coalesce((doc->>'void')::boolean,false),'postings',target_posts,'created_at',now());
    if (target_doc->>'start')::date<target_m then raise exception 'Tanggal Move lebih lama dari periode tujuan.'; end if;
    select coalesce(jsonb_agg(value),'[]') into b from jsonb_array_elements(target_s->'documents') where value->>'source_id'<>doc->>'id' or value->>'source_id' is null;
    target_s:=jsonb_set(target_s,'{documents}',b||jsonb_build_array(target_doc));
    target_p:=private.so_refresh_opening(target_s,target_m);
    target_s:=jsonb_set(target_s,array[target_idx::text],target_p);
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
   -- A late count date means this month's opening must follow the edited ledger.
   p:=private.so_refresh_opening(jsonb_build_object('periods',ps,'documents',docs),m);
   ps:=jsonb_set(ps,array[p_idx::text],p);
  end if;
 else raise exception 'Aksi tidak dikenal.';
 end if;
 s:=jsonb_build_object('periods',ps,'documents',docs);
 update public.stock_opname_state set payload=s,revision=revision+1,updated_at=now() where division_id=d;
 insert into public.stock_opname_requests(request_id,actor_id,division_id,action,payload_hash) values(request,auth.uid(),d,action,md5(input::text));
 return private.so_view(d);
end $$;

CREATE OR REPLACE FUNCTION private.so_view(d uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare st public.stock_opname_state%rowtype; c jsonb; p jsonb; targets jsonb; months jsonb;
begin
 if not private.so_allowed(d) then raise exception 'Akses Stock Opname ditolak.'; end if;
 select * into st from public.stock_opname_state where division_id=d;
 c:=private.so_catalog(d);
 -- Default view: the oldest unfinished count. A later month never hides it.
 select value into p from jsonb_array_elements(coalesce(st.payload->'periods','[]')) value
 where value->>'status' in ('active','reopened','held','opening_pending')
 order by (value->>'start')::date limit 1;
 if p is null then
  select value into p from jsonb_array_elements(coalesce(st.payload->'periods','[]')) value
  order by (value->>'start')::date desc limit 1;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',value->>'id','month',to_char((value->>'start')::date,'YYYY-MM'),
  'start',value->>'start','end',value->>'end','status',value->>'status',
  'counted_at',value->>'counted_at','opening_source',value->>'opening_source',
  'has_result',(value ? 'result')
 ) order by (value->>'start')::date),'[]'::jsonb) into months
 from jsonb_array_elements(coalesce(st.payload->'periods','[]')) value;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.division_id,'name',w.name||' · '||dv.name)),'[]') into targets from public.stock_opname_scopes s join public.divisions dv on dv.id=s.division_id join public.workspaces w on w.id=s.workspace_id where s.enabled and dv.is_active and s.division_id<>d;
 return jsonb_build_object(
  'state',coalesce(st.payload,'{"periods":[],"documents":[]}'),'revision',coalesce(st.revision,0),
  'catalog',private.so_catalog_rows(c),
  'balance',private.so_balances(coalesce(st.payload,'{}'),coalesce(p,'{}')),
  'targets',targets,
  'month',case when p is null then null else to_char((p->>'start')::date,'YYYY-MM') end,
  'months',months
 );
end $$;

COMMENT ON FUNCTION private.so_view(uuid)
  IS 'Stock Opname view with calendar-month selector and oldest-unfinished default.';
