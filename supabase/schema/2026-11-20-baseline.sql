-- Baseline schema snapshot of the production database.
-- Captured: 2026-11-20 from Supabase project niwapjafzaizlnenuyui (PostgreSQL 17.11).
-- Contents: 26 public tables, row level security policies, triggers, and the
-- private helper functions they depend on. No data is included.
-- Not included: the auth and storage schemas and the anon/authenticated/service_role
-- roles, which Supabase creates for every project.
--
-- Restore into an empty Supabase project:
--   psql "<connection string>" -f 2026-11-20-baseline.sql
--
-- This file makes the database rebuildable. It does not replace the migration
-- history; see ../migrations/README.md.

--
-- PostgreSQL database dump
--

\restrict 5ZM5L64Tri9fkyx0IUrMW2u2MfIrLPdmBun13a8SxWxUJyLBkIz41kuFfgCDQBw

-- Dumped from database version 17.11
-- Dumped by pg_dump version 18.7

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: private; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA private;


--
-- Name: auto_close_unresolved_guest_waitlist(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.auto_close_unresolved_guest_waitlist() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare jakarta_today date; affected integer;
begin
  jakarta_today := (pg_catalog.now() at time zone 'Asia/Jakarta')::date;
  perform pg_catalog.set_config('app.guestops_auto_close', 'true', true);
  update public.guests
  set status = 'missed',
      resolved_at = coalesce(resolved_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
  where service_date < jakarta_today
    and status in ('waiting', 'called');
  get diagnostics affected = row_count;
  return affected;
end;
$$;


--
-- Name: enforce_guest_audit_actor(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.enforce_guest_audit_actor() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  NEW.changed_by := auth.uid();
  NEW.changed_at := COALESCE(NEW.changed_at, clock_timestamp());
  RETURN NEW;
END;
$$;


--
-- Name: enforce_guest_record_identity(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.enforce_guest_record_identity() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare actor_id uuid := auth.uid();
begin
  if new.status = 'missed'
     and (tg_op = 'INSERT' or old.status is distinct from 'missed')
     and pg_catalog.current_setting('app.guestops_auto_close', true) is distinct from 'true' then
    raise exception using errcode = '42501',
      message = 'Status Lupa diselesaikan hanya boleh ditetapkan oleh reset otomatis.';
  end if;
  if tg_op = 'INSERT' then
    if actor_id is not null then new.created_by := actor_id; end if;
  else
    if new.id is distinct from old.id then
      raise exception using errcode = '42501', message = 'Guest Operations record IDs cannot be changed.';
    end if;
    if new.created_by is distinct from old.created_by then
      raise exception using errcode = '42501', message = 'The original creator identity cannot be changed.';
    end if;
    if new.workspace_id is distinct from old.workspace_id then
      raise exception using errcode = '42501', message = 'A Guest Operations record cannot be moved to another workspace.';
    end if;
  end if;
  return new;
end;
$$;


--
-- Name: has_division_access(uuid, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.has_division_access(target_workspace_id uuid, target_division_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select public.is_current_user_developer()
    or exists (
      select 1
      from public.workspace_division_memberships m
      where m.workspace_id = target_workspace_id
        and m.division_id = target_division_id
        and m.user_id = (select auth.uid())
    );
$$;


--
-- Name: prevent_duplicate_reservation_guest(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.prevent_duplicate_reservation_guest() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF NEW.reservation_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.reservation_id IS NOT DISTINCT FROM OLD.reservation_id
       AND NEW.workspace_id IS NOT DISTINCT FROM OLD.workspace_id THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Lock the parent reservation so inserts from every client path serialize.
  PERFORM 1
  FROM public.reservations AS r
  WHERE r.id = NEW.reservation_id
    AND r.workspace_id = NEW.workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'Reservasi tidak ditemukan pada workspace aktif.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.guests AS g
    WHERE g.workspace_id = NEW.workspace_id
      AND g.reservation_id = NEW.reservation_id
      AND g.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'Reservasi ini sudah memiliki data tamu. Tidak ada data baru yang dibuat.';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION prevent_duplicate_reservation_guest(); Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON FUNCTION private.prevent_duplicate_reservation_guest() IS 'Serializes Guest Operations reservation links on the parent reservation row and blocks a second guest link without modifying historical duplicates.';


--
-- Name: so_allowed(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.so_allowed(d uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select auth.uid() is not null and exists (
  select 1 from public.stock_opname_scopes s
  join public.divisions dv on dv.id=s.division_id and dv.workspace_id=s.workspace_id
  join public.workspace_memberships m on m.workspace_id=s.workspace_id and m.user_id=auth.uid()
  join public.profiles p on p.id=m.user_id
  where s.division_id=d and s.enabled and dv.is_active and p.role='admin' and m.role='division_admin'
  and exists(select 1 from public.workspace_division_memberships dm where dm.workspace_id=s.workspace_id and dm.division_id=d and dm.user_id=auth.uid())
 );
$$;


--
-- Name: so_balances(jsonb, jsonb, date); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.so_balances(s jsonb, p jsonb, cutoff date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
DECLARE
 b jsonb := coalesce(p->'opening','{}');
 doc jsonb;
 l jsonb;
 k text;
 n numeric;
BEGIN
 FOR doc IN
  SELECT value
  FROM jsonb_array_elements(coalesce(s->'documents','[]'))
  WHERE (
    value->>'period_id'=p->>'id'
    OR coalesce(p->'legacy_period_ids','[]'::jsonb) ? (value->>'period_id')
  )
  AND coalesce(value->>'void','false')<>'true'
 LOOP
  IF cutoff IS NOT NULL AND (doc->>'end')::date>cutoff THEN CONTINUE; END IF;
  FOR l IN SELECT value FROM jsonb_array_elements(doc->'postings') LOOP
   k:=l->>'key';
   n:=coalesce((b->>k)::numeric,0)+(l->>'qty')::numeric;
   b:=jsonb_set(b,array[k],to_jsonb(n),true);
  END LOOP;
 END LOOP;
 RETURN b;
END;
$$;


--
-- Name: so_catalog(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.so_catalog(d uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare c jsonb;
begin
 select m.payload into c from public.workspace_module_state m join public.divisions dv on dv.id=d and m.workspace_id=dv.workspace_id where m.division_id=d and m.module_key='master_data:'||d;
 return coalesce(c,'{"masterItems":[],"wips":[],"menus":[],"wipRecipeLines":[],"menuRecipeLines":[]}');
end $$;


--
-- Name: so_catalog_rows(jsonb); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.so_catalog_rows(c jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
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


--
-- Name: so_configure(uuid, boolean); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.so_configure(d uuid, on_off boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
 if auth.uid() is null or not public.is_current_user_developer() then raise exception 'Hanya Developer yang dapat mengaktifkan fitur.';end if;
 insert into public.stock_opname_scopes(division_id,workspace_id,enabled) select id,workspace_id,on_off from public.divisions where id=d and is_active on conflict(division_id) do update set enabled=excluded.enabled,updated_at=now();
end $$;


--
-- Name: so_dashboard_view(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.so_dashboard_view(d uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare st public.stock_opname_state%rowtype; c jsonb; dashboard_state jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.stock_opname_scopes s
    join public.divisions dv on dv.id=s.division_id and dv.workspace_id=s.workspace_id
    where s.division_id=d and s.enabled and dv.is_active
      and (public.is_current_user_developer() or private.so_allowed(d))
  ) then
    raise exception 'Akses Dashboard Stock Opname ditolak.' using errcode = '42501';
  end if;
  select * into st from public.stock_opname_state where division_id=d;
  c := private.so_catalog(d);
  dashboard_state := coalesce(st.payload,'{"periods":[],"documents":[]}'::jsonb);
  -- Only Sales needs the saved menu names, prices and recipe ordering.
  dashboard_state := jsonb_set(dashboard_state,'{documents}',(
    select coalesce(jsonb_agg(
      (doc-'catalog_snapshot') || case when doc->>'type'='sales' then
        jsonb_build_object('catalog_snapshot',jsonb_build_object(
          'menus',coalesce(doc->'catalog_snapshot'->'menus','[]'::jsonb),
          'menuRecipeLines',coalesce(doc->'catalog_snapshot'->'menuRecipeLines','[]'::jsonb)
        )) else '{}'::jsonb end
      order by ordinality
    ),'[]'::jsonb)
    from jsonb_array_elements(coalesce(dashboard_state->'documents','[]'::jsonb)) with ordinality as entries(doc,ordinality)
  ));
  return jsonb_build_object(
    'state',dashboard_state,
    'revision',coalesce(st.revision,0),
    'catalog',private.so_catalog_rows(c)
  );
end;
$$;


--
-- Name: so_item(jsonb, text, text[]); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.so_item(c jsonb, k text, trail text[] DEFAULT '{}'::text[]) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
declare x jsonb; l jsonb; part jsonb; qty numeric; cost numeric:=0; parts jsonb:='[]'; unit text; f numeric; price numeric;
begin
 if k=any(trail) or cardinality(trail)>20 then raise exception 'Siklus resep WIP.'; end if;
 if left(k,2)='m:' then
  select value into x from jsonb_array_elements(coalesce(c->'masterItems','[]')) where value->>'id'=substr(k,3) and value->>'status'='active' and value->>'scope_id'=c->>'active_scope_id';
  if x is null then raise exception 'Bahan tidak tersedia/nonaktif: %',k; end if;
  price:=private.so_number(coalesce(x->>'harga_beli_terakhir_per_satuan_dasar',x->>'harga_per_satuan_dasar'));
  return jsonb_build_object('key',k,'name',x->>'nama_barang','unit',x->>'satuan_dasar','units',x->'konversi_satuan','price',price,'kind','material','is_supply',coalesce((x->>'is_supply')::boolean,false),'parts','[]'::jsonb);
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


--
-- Name: so_mutate(uuid, bigint, uuid, text, jsonb); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.so_mutate(d uuid, expected_revision bigint, request uuid, action text, input jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
#variable_conflict use_variable
declare
 st public.stock_opname_state%rowtype; s jsonb; p jsonb; ps jsonb; docs jsonb; c jsonb; rows jsonb; fresh_rows jsonb;
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
    select coalesce(jsonb_object_agg(kind,amount),'{}') into movements from (select case when v->>'type'='expense' then coalesce(v->>'category','expense') else v->>'type' end as kind,sum((z->>'qty')::numeric) amount from jsonb_array_elements(docs) v cross join lateral jsonb_array_elements(v->'postings') z where (v->>'period_id'=pid or coalesce(p->'legacy_period_ids','[]'::jsonb) ? (v->>'period_id')) and coalesce(v->>'void','false')<>'true' and z->>'key'=k group by 1) totals;
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


--
-- Name: so_number(text, boolean); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.so_number(v text, positive boolean DEFAULT false) RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $_$
declare n numeric;
begin
 if v is null or v !~ '^[0-9]+([.][0-9]+)?$' then raise exception 'Jumlah/harga harus berupa angka nonnegatif.'; end if;
 n:=v::numeric;
 if n>1000000000000 or (positive and n<=0) then raise exception 'Jumlah di luar batas.'; end if;
 return n;
end $_$;


--
-- Name: so_reset_opening(uuid, bigint, uuid, text, jsonb); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.so_reset_opening(d uuid, expected_revision bigint, request uuid, action text, input jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: so_target_catalog(uuid, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.so_target_catalog(origin uuid, destination uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
 if not private.so_allowed(origin) or not exists(select 1 from public.stock_opname_scopes where division_id=destination and enabled) then raise exception 'Tujuan tidak tersedia.';end if;
 return (select coalesce(jsonb_agg(value-'price'-'parts'),'[]') from jsonb_array_elements(private.so_catalog_rows(private.so_catalog(destination))) where left(value->>'key',2)<>'s:');
end $$;


--
-- Name: so_view(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.so_view(d uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare st public.stock_opname_state%rowtype; c jsonb; p jsonb; targets jsonb;
begin
 if not private.so_allowed(d) then raise exception 'Akses Stock Opname ditolak.'; end if;
 select * into st from public.stock_opname_state where division_id=d;
 c:=private.so_catalog(d);p:=st.payload->'periods'->-1;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.division_id,'name',w.name||' · '||dv.name)),'[]') into targets from public.stock_opname_scopes s join public.divisions dv on dv.id=s.division_id join public.workspaces w on w.id=s.workspace_id where s.enabled and dv.is_active and s.division_id<>d;
 return jsonb_build_object('state',coalesce(st.payload,'{"periods":[],"documents":[]}'),'revision',coalesce(st.revision,0),'catalog',private.so_catalog_rows(c),'balance',private.so_balances(coalesce(st.payload,'{}'),coalesce(p,'{}')),'targets',targets);
end $$;


--
-- PostgreSQL database dump complete
--

\unrestrict 5ZM5L64Tri9fkyx0IUrMW2u2MfIrLPdmBun13a8SxWxUJyLBkIz41kuFfgCDQBw


--
-- PostgreSQL database dump
--

\restrict 7cH7ngELNsTOPd9sm4MswPl49q43OJQhS4RgT5eIH1G7kjOIguAaePOyb5BzS9G

-- Dumped from database version 17.11
-- Dumped by pg_dump version 18.7

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: calculate_menu_recipe_cost(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_menu_recipe_cost(p_menu_id uuid) RETURNS numeric
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
declare
  v_total numeric(18,6) := 0;
  v_line record;
  v_factor numeric(18,6);
  v_unit_price numeric(18,6);
  v_child_yield numeric(18,6);
  v_child_cost numeric(18,6);
begin
  if not exists (
    select 1 from public.menus m
    where m.id = p_menu_id and m.is_active = true
  ) then
    raise exception 'Menu is missing or inactive.';
  end if;

  if not exists (
    select 1 from public.menu_recipe_lines l
    where l.menu_id = p_menu_id
  ) then
    raise exception 'Menu recipe has no components.';
  end if;

  for v_line in
    select * from public.menu_recipe_lines l
    where l.menu_id = p_menu_id
    order by l.sort_order, l.id
  loop
    if v_line.component_type = 'item' then
      select c.factor_to_base, i.base_unit_price
        into v_factor, v_unit_price
      from public.item_unit_conversions c
      join public.items i on i.id = c.item_id
      where c.item_id = v_line.item_id
        and c.unit_id = v_line.unit_id
        and i.is_active = true;

      if not found or v_unit_price is null then
        raise exception 'Menu recipe component item has no valid base-unit price or conversion.';
      end if;

      v_total := v_total + (v_line.quantity * v_factor * v_unit_price);
    else
      select r.yield_quantity into v_child_yield
      from public.wip_recipes r
      where r.id = v_line.wip_recipe_id and r.is_active = true;

      if not found or v_child_yield <= 0 then
        raise exception 'Menu WIP component is missing, inactive, or has invalid yield.';
      end if;

      v_child_cost := public.calculate_wip_recipe_cost(v_line.wip_recipe_id);
      v_total := v_total + (v_line.quantity * (v_child_cost / v_child_yield));
    end if;
  end loop;

  return v_total;
end;
$$;


--
-- Name: calculate_wip_recipe_cost(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_wip_recipe_cost(p_wip_recipe_id uuid, p_path uuid[] DEFAULT ARRAY[]::uuid[]) RETURNS numeric
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
declare
  v_yield numeric(18,6);
  v_total numeric(18,6) := 0;
  v_line record;
  v_factor numeric(18,6);
  v_unit_price numeric(18,6);
  v_child_yield numeric(18,6);
  v_child_cost numeric(18,6);
begin
  if p_wip_recipe_id = any(p_path) then
    raise exception 'Circular WIP recipe dependency detected during cost calculation.';
  end if;

  select r.yield_quantity into v_yield
  from public.wip_recipes r
  where r.id = p_wip_recipe_id and r.is_active = true;

  if not found then
    raise exception 'WIP recipe is missing or inactive.';
  end if;

  if not exists (
    select 1 from public.wip_recipe_lines l
    where l.wip_recipe_id = p_wip_recipe_id
  ) then
    raise exception 'WIP recipe has no components.';
  end if;

  for v_line in
    select * from public.wip_recipe_lines l
    where l.wip_recipe_id = p_wip_recipe_id
    order by l.sort_order, l.id
  loop
    if v_line.component_type = 'item' then
      select c.factor_to_base, i.base_unit_price
        into v_factor, v_unit_price
      from public.item_unit_conversions c
      join public.items i on i.id = c.item_id
      where c.item_id = v_line.item_id
        and c.unit_id = v_line.unit_id
        and i.is_active = true;

      if not found or v_unit_price is null then
        raise exception 'WIP recipe component item has no valid base-unit price or conversion.';
      end if;

      v_total := v_total + (v_line.quantity * v_factor * v_unit_price);
    else
      select r.yield_quantity into v_child_yield
      from public.wip_recipes r
      where r.id = v_line.component_wip_id and r.is_active = true;

      if not found or v_child_yield <= 0 then
        raise exception 'Nested WIP component is missing, inactive, or has invalid yield.';
      end if;

      v_child_cost := public.calculate_wip_recipe_cost(
        v_line.component_wip_id,
        p_path || p_wip_recipe_id
      );

      v_total := v_total + (v_line.quantity * (v_child_cost / v_child_yield));
    end if;
  end loop;

  return v_total;
end;
$$;


--
-- Name: correct_guest_with_reason(uuid, text, integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.correct_guest_with_reason(p_guest_id uuid, p_guest_name text, p_pack integer, p_phone text, p_reason text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesi akun tidak valid.' USING ERRCODE = '42501';
  END IF;

  IF v_reason IS NULL OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Alasan koreksi wajib diisi (maksimal 500 karakter).' USING ERRCODE = '22023';
  END IF;

  IF p_guest_name IS NULL OR btrim(p_guest_name) = '' THEN
    RAISE EXCEPTION 'Nama tamu wajib diisi.' USING ERRCODE = '22023';
  END IF;

  IF p_pack IS NULL OR p_pack < 1 OR p_pack > 30 THEN
    RAISE EXCEPTION 'Jumlah pack harus antara 1 dan 30.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.guest_audit_reason', v_reason, true);

  UPDATE public.guests
  SET guest_name = btrim(p_guest_name),
      pack = p_pack,
      phone = NULLIF(btrim(COALESCE(p_phone, '')), ''),
      updated_at = clock_timestamp()
  WHERE id = p_guest_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tamu tidak ditemukan atau akses ditolak.' USING ERRCODE = '42501';
  END IF;
END;
$$;


--
-- Name: FUNCTION correct_guest_with_reason(p_guest_id uuid, p_guest_name text, p_pack integer, p_phone text, p_reason text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.correct_guest_with_reason(p_guest_id uuid, p_guest_name text, p_pack integer, p_phone text, p_reason text) IS 'Updates guest correction fields under caller RLS and attaches a required reason to the database audit trigger.';


--
-- Name: default_workspace_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.default_workspace_id() RETURNS uuid
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select id from public.workspaces order by created_at, id limit 1
$$;


--
-- Name: end_user_monitoring_session(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.end_user_monitoring_session() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_auth_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_session public.user_monitoring_sessions%rowtype;
begin
  if auth.uid() is null or v_auth_session_id is null then
    return false;
  end if;

  update public.user_monitoring_sessions
  set status = 'logged_out', ended_at = now(), last_seen_at = now(), last_active_at = now()
  where auth_session_id = v_auth_session_id
    and user_id = auth.uid()
    and status <> 'logged_out'
  returning * into v_session;

  if not found then
    return false;
  end if;

  insert into public.user_monitoring_activity (
    event_type, user_id, actor_email, actor_name, actor_role,
    auth_session_id, workspace_id, workspace_name, source
  ) values (
    'logout', v_session.user_id, v_session.user_email, v_session.display_name,
    v_session.role, v_session.auth_session_id, v_session.workspace_id,
    v_session.workspace_name, 'password'
  );

  return true;
end;
$$;


--
-- Name: ensure_item_base_unit_conversion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_item_base_unit_conversion() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'INSERT' then
    insert into public.item_unit_conversions (
      item_id, unit_id, factor_to_base, is_base_unit
    )
    values (new.id, new.base_unit_id, 1, true)
    on conflict (item_id, unit_id)
    do update set factor_to_base = 1, is_base_unit = true;
    return new;
  end if;

  if new.base_unit_id is distinct from old.base_unit_id then
    if exists (
      select 1
      from public.item_unit_conversions c
      where c.item_id = old.id
    ) then
      raise exception 'Base unit cannot be changed after unit conversions are configured. Use a controlled conversion migration.';
    end if;

    insert into public.item_unit_conversions (
      item_id, unit_id, factor_to_base, is_base_unit
    )
    values (new.id, new.base_unit_id, 1, true)
    on conflict (item_id, unit_id)
    do update set factor_to_base = 1, is_base_unit = true;
  end if;

  return new;
end;
$$;


--
-- Name: has_workspace_role(uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_workspace_role(target_workspace_id uuid, allowed_roles text[]) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select public.is_current_user_developer()
    or exists (
      select 1 from public.workspace_memberships m
      where m.workspace_id = target_workspace_id
        and m.user_id = (select auth.uid())
        and m.role = any(allowed_roles)
    );
$$;


--
-- Name: is_current_user_developer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_current_user_developer() RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'developer'
  );
$$;


--
-- Name: is_workspace_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_workspace_member(target_workspace_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select public.is_current_user_developer()
    or exists (
      select 1 from public.workspace_memberships m
      where m.workspace_id = target_workspace_id
        and m.user_id = (select auth.uid())
    );
$$;


--
-- Name: log_guest_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_guest_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_changes text[] := ARRAY[]::text[];
  v_reason text := NULLIF(btrim(current_setting('app.guest_audit_reason', true)), '');
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.guest_status_history
      (workspace_id, guest_id, status, label, detail, changed_by, changed_at)
    VALUES
      (NEW.workspace_id, NEW.id, NEW.status, 'Terdaftar',
       NEW.pack::text || ' pack', auth.uid(), clock_timestamp());

    IF NEW.status = 'seated' THEN
      INSERT INTO public.guest_status_history
        (workspace_id, guest_id, status, label, detail, changed_by, changed_at)
      VALUES
        (NEW.workspace_id, NEW.id, NEW.status, 'Langsung Duduk',
         'Meja ' || COALESCE(NULLIF(btrim(NEW.table_label), ''), 'Belum ditentukan'),
         auth.uid(), clock_timestamp());
    END IF;
  ELSE
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.guest_status_history
        (workspace_id, guest_id, status, label, detail, reason, changed_by, changed_at)
      VALUES (
        NEW.workspace_id, NEW.id, NEW.status,
        CASE NEW.status
          WHEN 'called' THEN 'Dipanggil'
          WHEN 'seated' THEN 'Duduk'
          WHEN 'done' THEN 'Selesai'
          WHEN 'missed' THEN 'Lupa diselesaikan'
          WHEN 'cancelled' THEN 'Dibatalkan'
          ELSE 'Menunggu'
        END,
        CASE
          WHEN NEW.status = 'seated' THEN
            'Meja ' || COALESCE(NULLIF(btrim(NEW.table_label), ''), 'Belum ditentukan')
          WHEN NEW.status = 'missed' THEN
            'Otomatis ditutup saat reset operasional 00:00 WIB'
          ELSE NULL
        END,
        CASE WHEN NEW.status = 'missed'
          THEN 'Antrean belum diselesaikan sampai pergantian tanggal.'
          ELSE NULL
        END,
        auth.uid(), clock_timestamp()
      );
    END IF;

    IF OLD.status = 'seated' AND NEW.status = 'seated'
       AND OLD.table_label IS DISTINCT FROM NEW.table_label THEN
      INSERT INTO public.guest_status_history
        (workspace_id, guest_id, status, label, detail, changed_by, changed_at)
      VALUES (
        NEW.workspace_id, NEW.id, NEW.status, 'Pindah Meja',
        'Meja ' || COALESCE(NULLIF(btrim(OLD.table_label), ''), '—')
          || ' → Meja ' || COALESCE(NULLIF(btrim(NEW.table_label), ''), '—'),
        auth.uid(), clock_timestamp()
      );
    END IF;

    IF OLD.ticket IS DISTINCT FROM NEW.ticket THEN
      v_changes := array_append(v_changes, format('Nomor antrean: %s → %s', OLD.ticket, NEW.ticket));
    END IF;
    IF OLD.service_date IS DISTINCT FROM NEW.service_date THEN
      v_changes := array_append(v_changes, format('Tanggal layanan: %s → %s', OLD.service_date, NEW.service_date));
    END IF;
    IF OLD.guest_name IS DISTINCT FROM NEW.guest_name THEN
      v_changes := array_append(v_changes, format('Nama: %s → %s', OLD.guest_name, NEW.guest_name));
    END IF;
    IF OLD.pack IS DISTINCT FROM NEW.pack THEN
      v_changes := array_append(v_changes, format('Jumlah pack: %s → %s', OLD.pack, NEW.pack));
    END IF;
    IF OLD.phone IS DISTINCT FROM NEW.phone THEN
      v_changes := array_append(v_changes,
        format('WhatsApp: %s → %s', COALESCE(OLD.phone, '(kosong)'), COALESCE(NEW.phone, '(kosong)')));
    END IF;
    IF OLD.smoking IS DISTINCT FROM NEW.smoking THEN
      v_changes := array_append(v_changes,
        'Area merokok: '
        || CASE OLD.smoking WHEN true THEN 'Smoking' WHEN false THEN 'Non Smoking' ELSE 'Belum diisi' END
        || ' → '
        || CASE NEW.smoking WHEN true THEN 'Smoking' WHEN false THEN 'Non Smoking' ELSE 'Belum diisi' END);
    END IF;
    IF OLD.reservation_id IS DISTINCT FROM NEW.reservation_id THEN
      v_changes := array_append(v_changes, 'Tautan reservasi diperbarui');
    END IF;

    IF cardinality(v_changes) > 0 OR v_reason IS NOT NULL THEN
      INSERT INTO public.guest_status_history
        (workspace_id, guest_id, status, label, detail, reason, changed_by, changed_at)
      VALUES
        (NEW.workspace_id, NEW.id, NEW.status, 'Koreksi Data',
         CASE WHEN cardinality(v_changes) > 0
           THEN array_to_string(v_changes, '; ')
           ELSE 'Data dikonfirmasi tanpa perubahan nilai.'
         END,
         v_reason, auth.uid(), clock_timestamp());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION log_guest_status_change(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.log_guest_status_change() IS 'Internal AFTER trigger. Writes registration, status, seating, table-move, and guest-correction history from row changes.';


--
-- Name: log_reservation_edit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_reservation_edit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare old_data jsonb; new_data jsonb;
begin
 old_data:=jsonb_build_object('guest_name',old.guest_name,'pack',old.pack,'reservation_date',old.reservation_date,'reservation_time',old.reservation_time,'phone',old.phone,'smoking',old.smoking,'note',old.note);
 new_data:=jsonb_build_object('guest_name',new.guest_name,'pack',new.pack,'reservation_date',new.reservation_date,'reservation_time',new.reservation_time,'phone',new.phone,'smoking',new.smoking,'note',new.note);
 if old_data is distinct from new_data then
  insert into public.reservation_edit_history(workspace_id,reservation_id,before_data,after_data,edited_by,edited_at)
  values(new.workspace_id,new.id,old_data,new_data,auth.uid(),clock_timestamp());
 end if;
 return new;
end;
$$;


--
-- Name: log_reservation_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_reservation_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'INSERT' then
    insert into public.reservation_status_history(workspace_id,reservation_id,status,label,changed_by)
    values (new.workspace_id,new.id,new.status,'Reservasi dibuat',auth.uid());
  elsif old.status is distinct from new.status then
    insert into public.reservation_status_history(workspace_id,reservation_id,status,label,changed_by)
    values (
      new.workspace_id,new.id,new.status,
      case new.status
        when 'confirmed' then 'Dikonfirmasi'
        when 'arrived' then 'Tiba'
        when 'seated' then 'Duduk'
        when 'cancelled' then 'Dibatalkan'
        when 'no_show' then 'Tidak hadir'
        else 'Menunggu konfirmasi'
      end,
      auth.uid()
    );
  end if;
  return new;
end;
$$;


--
-- Name: FUNCTION log_reservation_status_change(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.log_reservation_status_change() IS 'Internal AFTER trigger. Runs as owner with an empty search_path so authenticated users cannot insert fabricated history rows directly.';


--
-- Name: next_guest_ticket(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_guest_ticket(p_workspace_id uuid, p_service_date date) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  next_no integer;
begin
  if not public.has_workspace_role(p_workspace_id, array['service']) then
    raise exception 'Akses workspace ditolak';
  end if;

  insert into public.guest_counters(workspace_id, service_date, last_number)
  values (p_workspace_id, p_service_date, 1)
  on conflict (workspace_id, service_date)
  do update set last_number = public.guest_counters.last_number + 1
  returning last_number into next_no;

  return 'WL-' || lpad(next_no::text, 3, '0');
end;
$$;


--
-- Name: next_reservation_code(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_reservation_code(p_workspace_id uuid, p_service_date date) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  next_no integer;
begin
  if not public.has_workspace_role(p_workspace_id, array['service']) then
    raise exception 'Akses workspace ditolak';
  end if;

  insert into public.reservation_counters(workspace_id, service_date, last_number)
  values (p_workspace_id, p_service_date, 1)
  on conflict (workspace_id, service_date)
  do update set last_number = public.reservation_counters.last_number + 1
  returning last_number into next_no;

  return 'RSV-' || lpad(next_no::text, 3, '0');
end;
$$;


--
-- Name: prevent_base_conversion_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_base_conversion_delete() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if old.is_base_unit then
    raise exception 'The base unit conversion cannot be deleted.';
  end if;
  return old;
end;
$$;


--
-- Name: register_user_monitoring_session(text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_user_monitoring_session(p_device_type text, p_browser text, p_operating_system text, p_workspace_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select public.register_user_monitoring_session(
    p_device_type,
    p_browser,
    p_operating_system,
    gen_random_uuid(),
    p_workspace_id
  );
$$;


--
-- Name: register_user_monitoring_session(text, text, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_user_monitoring_session(p_device_type text, p_browser text, p_operating_system text, p_device_id uuid, p_workspace_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_auth_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_email text;
  v_display_name text;
  v_role text;
  v_workspace_id uuid := p_workspace_id;
  v_workspace_name text;
  v_session_id uuid;
  v_is_new boolean := false;
begin
  if v_user_id is null or v_auth_session_id is null then
    raise exception 'Authenticated session is required';
  end if;

  if p_device_id is null
    or p_device_type not in ('mobile','tablet','desktop')
    or length(coalesce(p_browser,'')) = 0
    or length(coalesce(p_operating_system,'')) = 0
    or length(p_browser) > 80
    or length(p_operating_system) > 80 then
    raise exception 'Invalid device information';
  end if;

  select p.display_name, p.role, u.email
    into v_display_name, v_role, v_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = v_user_id;

  if not found or v_role not in ('developer','admin','service') then
    raise exception 'Profile access is not available';
  end if;

  if v_workspace_id is not null then
    select w.name into v_workspace_name
    from public.workspaces w
    where w.id = v_workspace_id
      and (
        v_role = 'developer'
        or exists (
          select 1 from public.workspace_memberships m
          where m.workspace_id = w.id and m.user_id = v_user_id
        )
      );
    if not found then
      raise exception 'Workspace access is not available';
    end if;
  elsif v_role <> 'developer' then
    select w.id, w.name into v_workspace_id, v_workspace_name
    from public.workspace_memberships m
    join public.workspaces w on w.id = m.workspace_id
    where m.user_id = v_user_id
    order by m.created_at
    limit 1;
  end if;

  insert into public.user_monitoring_sessions (
    auth_session_id, device_id, user_id, user_email, display_name, role,
    workspace_id, workspace_name, device_type, browser, operating_system,
    status, logged_in_at, last_seen_at, last_active_at, ended_at
  ) values (
    v_auth_session_id, p_device_id, v_user_id, v_email,
    coalesce(nullif(v_display_name,''), v_email), v_role,
    v_workspace_id, v_workspace_name, p_device_type, p_browser, p_operating_system,
    'online', now(), now(), now(), null
  )
  on conflict (auth_session_id) do update set
    device_id = excluded.device_id,
    user_id = excluded.user_id,
    user_email = excluded.user_email,
    display_name = excluded.display_name,
    role = excluded.role,
    workspace_id = excluded.workspace_id,
    workspace_name = excluded.workspace_name,
    device_type = excluded.device_type,
    browser = excluded.browser,
    operating_system = excluded.operating_system,
    status = 'online',
    last_seen_at = now(),
    last_active_at = now(),
    ended_at = null
  returning id, (xmax = 0) into v_session_id, v_is_new;

  if v_is_new then
    insert into public.user_monitoring_activity (
      event_type, user_id, actor_email, actor_name, actor_role,
      auth_session_id, workspace_id, workspace_name, source
    ) values (
      'login_success', v_user_id, v_email,
      coalesce(nullif(v_display_name,''), v_email), v_role,
      v_auth_session_id, v_workspace_id, v_workspace_name, 'password'
    );
  end if;

  return v_session_id;
end;
$$;


--
-- Name: seat_guest_reservation(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seat_guest_reservation(p_reservation_id uuid, p_table_label text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_reservation public.reservations%ROWTYPE;
  v_guest public.guests%ROWTYPE;
  v_guest_count integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_service_date date := (pg_catalog.now() AT TIME ZONE 'Asia/Jakarta')::date;
  v_table_label text := pg_catalog.btrim(COALESCE(p_table_label, ''));
  v_ticket text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sesi akun tidak valid.';
  END IF;

  IF p_reservation_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Reservasi tidak valid.';
  END IF;

  IF v_table_label = '' OR pg_catalog.length(v_table_label) > 80 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Nomor atau nama meja wajib diisi (maksimal 80 karakter).';
  END IF;

  -- RLS limits this lookup to reservations available to the current user.
  SELECT r.*
  INTO v_reservation
  FROM public.reservations AS r
  WHERE r.id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Reservasi tidak ditemukan atau akses ditolak.';
  END IF;

  IF NOT public.has_workspace_role(v_reservation.workspace_id, ARRAY['service']::text[]) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Akses Guest Operations ditolak.';
  END IF;

  IF v_reservation.reservation_date <> v_service_date THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Tamu hanya bisa didudukkan pada tanggal reservasinya.';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_guest_count
  FROM public.guests AS g
  WHERE g.workspace_id = v_reservation.workspace_id
    AND g.reservation_id = v_reservation.id;

  IF v_guest_count > 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'Reservasi ini sudah memiliki beberapa data tamu lama. Tidak ada data yang diubah; hubungi Global Developer.';
  END IF;

  IF v_guest_count = 1 THEN
    SELECT g.*
    INTO v_guest
    FROM public.guests AS g
    WHERE g.workspace_id = v_reservation.workspace_id
      AND g.reservation_id = v_reservation.id
    ORDER BY g.created_at ASC, g.id ASC
    LIMIT 1;

    IF v_reservation.status <> 'seated' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'Data tamu untuk reservasi ini sudah ada, tetapi status reservasi belum duduk. Perlu pemeriksaan.';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'created', false,
      'guest', pg_catalog.to_jsonb(v_guest),
      'reservation', pg_catalog.to_jsonb(v_reservation)
    );
  END IF;

  IF v_reservation.status <> 'pending' THEN
    IF v_reservation.status = 'seated' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'Reservasi sudah berstatus duduk, tetapi data tamunya tidak ditemukan. Perlu pemeriksaan.';
    END IF;
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Hanya reservasi berstatus menunggu yang dapat didudukkan.';
  END IF;

  -- The counter increment, guest insert, status update, and history triggers
  -- are part of this same transaction and roll back together on any failure.
  v_ticket := public.next_guest_ticket(v_reservation.workspace_id, v_service_date);

  INSERT INTO public.guests (
    workspace_id,
    reservation_id,
    ticket,
    service_date,
    guest_name,
    pack,
    phone,
    smoking,
    status,
    created_by,
    created_at,
    seated_at,
    resolved_at,
    table_label
  )
  VALUES (
    v_reservation.workspace_id,
    v_reservation.id,
    v_ticket,
    v_service_date,
    v_reservation.guest_name,
    v_reservation.pack,
    v_reservation.phone,
    CASE pg_catalog.lower(COALESCE(v_reservation.smoking, ''))
      WHEN 'smoking' THEN true
      WHEN 'non smoking' THEN false
      ELSE NULL
    END,
    'seated',
    auth.uid(),
    v_now,
    v_now,
    v_now,
    v_table_label
  )
  RETURNING *
  INTO v_guest;

  UPDATE public.reservations
  SET status = 'seated',
      table_label = v_table_label,
      updated_at = v_now
  WHERE id = v_reservation.id
    AND workspace_id = v_reservation.workspace_id
  RETURNING *
  INTO v_reservation;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Reservasi berubah saat proses dudukkan. Coba muat ulang.';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'created', true,
    'guest', pg_catalog.to_jsonb(v_guest),
    'reservation', pg_catalog.to_jsonb(v_reservation)
  );
END;
$$;


--
-- Name: FUNCTION seat_guest_reservation(p_reservation_id uuid, p_table_label text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.seat_guest_reservation(p_reservation_id uuid, p_table_label text) IS 'Atomically seats a pending Guest Operations reservation and returns the created guest; retries return the already-linked guest without creating another row.';


--
-- Name: stock_opname_configure(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stock_opname_configure(division uuid, enabled boolean) RETURNS void
    LANGUAGE sql
    SET search_path TO ''
    AS $$ select private.so_configure(division,enabled); $$;


--
-- Name: stock_opname_dashboard_read(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stock_opname_dashboard_read(division uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$ select private.so_dashboard_view(division); $$;


--
-- Name: stock_opname_read(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stock_opname_read(division uuid) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$ select private.so_view(division); $$;


--
-- Name: stock_opname_reset_opening(uuid, bigint, uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stock_opname_reset_opening(division uuid, expected_revision bigint, request uuid, action text, input jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$ select private.so_reset_opening(division,expected_revision,request,action,input); $$;


--
-- Name: stock_opname_target_catalog(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stock_opname_target_catalog(origin uuid, destination uuid) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$ select private.so_target_catalog(origin,destination); $$;


--
-- Name: stock_opname_write(uuid, bigint, uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stock_opname_write(division uuid, expected_revision bigint, request uuid, action text, input jsonb) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$ select private.so_mutate(division,expected_revision,request,action,input); $$;


--
-- Name: touch_user_monitoring_session(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_user_monitoring_session() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_auth_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_updated integer;
begin
  if auth.uid() is null or v_auth_session_id is null then
    return false;
  end if;

  update public.user_monitoring_sessions
  set last_seen_at = now(), last_active_at = now()
  where auth_session_id = v_auth_session_id
    and user_id = auth.uid()
    and status = 'online';

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;


--
-- Name: validate_item_price_snapshots(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_item_price_snapshots() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_factor numeric(18,6);
begin
  if new.reference_price is null then
    new.reference_price_unit_id := null;
    new.reference_unit_factor_snapshot := null;
  else
    if new.reference_price_unit_id is null then
      raise exception 'Reference price requires a registered price unit.';
    end if;
    select c.factor_to_base into v_factor
    from public.item_unit_conversions c
    where c.item_id = new.id and c.unit_id = new.reference_price_unit_id;
    if not found then
      raise exception 'Reference price unit has no registered conversion for this item.';
    end if;
    new.reference_unit_factor_snapshot := v_factor;
  end if;

  if new.last_purchase_price is null then
    new.last_purchase_unit_id := null;
    new.last_purchase_unit_factor_snapshot := null;
  else
    if new.last_purchase_unit_id is null then
      raise exception 'Last purchase price requires a registered purchase unit.';
    end if;
    select c.factor_to_base into v_factor
    from public.item_unit_conversions c
    where c.item_id = new.id and c.unit_id = new.last_purchase_unit_id;
    if not found then
      raise exception 'Last purchase unit has no registered conversion for this item.';
    end if;
    new.last_purchase_unit_factor_snapshot := v_factor;
  end if;

  return new;
end;
$$;


--
-- Name: validate_item_unit_conversion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_item_unit_conversion() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_base_unit_id uuid;
  v_base_dimension text;
  v_conversion_dimension text;
begin
  select i.base_unit_id, bu.dimension
    into v_base_unit_id, v_base_dimension
  from public.items i
  join public.units bu on bu.id = i.base_unit_id
  where i.id = new.item_id;

  if v_base_unit_id is null then
    raise exception 'Item not found for unit conversion.';
  end if;

  select u.dimension
    into v_conversion_dimension
  from public.units u
  where u.id = new.unit_id;

  if v_conversion_dimension is distinct from v_base_dimension then
    raise exception 'Unit conversion must use the same measurement dimension as the item base unit.';
  end if;

  if new.is_base_unit and (
    new.unit_id <> v_base_unit_id or new.factor_to_base <> 1
  ) then
    raise exception 'Base unit conversion must match the item base unit with factor 1.';
  end if;

  if not new.is_base_unit and new.unit_id = v_base_unit_id then
    raise exception 'The item base unit must be marked as the base conversion.';
  end if;

  return new;
end;
$$;


--
-- Name: validate_menu_recipe_line(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_menu_recipe_line() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_child_yield_unit uuid;
begin
  if new.component_type = 'item' then
    if not exists (
      select 1 from public.item_unit_conversions c
      where c.item_id = new.item_id and c.unit_id = new.unit_id
    ) then
      raise exception 'Menu item component must use a unit registered in that item conversions.';
    end if;
  else
    select r.yield_unit_id into v_child_yield_unit
    from public.wip_recipes r
    where r.id = new.wip_recipe_id;

    if not found then
      raise exception 'Referenced WIP recipe does not exist.';
    end if;

    if new.unit_id <> v_child_yield_unit then
      raise exception 'Menu WIP component quantity must use the output unit of the referenced WIP recipe.';
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: validate_wip_recipe_line(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_wip_recipe_line() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_child_yield_unit uuid;
  v_cycle_found boolean;
  v_old_line_id uuid;
begin
  if new.component_type = 'item' then
    if not exists (
      select 1 from public.item_unit_conversions c
      where c.item_id = new.item_id and c.unit_id = new.unit_id
    ) then
      raise exception 'Recipe item component must use a unit registered in that item conversions.';
    end if;
  else
    select r.yield_unit_id into v_child_yield_unit
    from public.wip_recipes r
    where r.id = new.component_wip_id;

    if not found then
      raise exception 'Referenced WIP recipe does not exist.';
    end if;

    if new.unit_id <> v_child_yield_unit then
      raise exception 'WIP component quantity must use the output unit of the referenced WIP recipe.';
    end if;

    v_old_line_id := case when tg_op = 'UPDATE' then old.id else null end;

    with recursive dependencies(id) as (
      select new.component_wip_id
      union
      select l.component_wip_id
      from public.wip_recipe_lines l
      join dependencies d on d.id = l.wip_recipe_id
      where l.component_type = 'wip'
        and l.component_wip_id is not null
        and l.id is distinct from v_old_line_id
    )
    select exists (
      select 1 from dependencies where id = new.wip_recipe_id
    ) into v_cycle_found;

    if v_cycle_found then
      raise exception 'Circular WIP recipe dependency is not allowed.';
    end if;
  end if;

  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: divisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.divisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace_id uuid DEFAULT public.default_workspace_id() NOT NULL
);


--
-- Name: guest_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guest_counters (
    workspace_id uuid NOT NULL,
    service_date date NOT NULL,
    last_number integer DEFAULT 0 NOT NULL,
    CONSTRAINT guest_counters_last_number_check CHECK ((last_number >= 0))
);


--
-- Name: guest_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guest_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    guest_id uuid NOT NULL,
    status text NOT NULL,
    label text NOT NULL,
    detail text,
    reason text,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT guest_status_history_status_check CHECK ((status = ANY (ARRAY['waiting'::text, 'called'::text, 'seated'::text, 'done'::text, 'missed'::text, 'cancelled'::text])))
);


--
-- Name: guests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid DEFAULT public.default_workspace_id() NOT NULL,
    reservation_id uuid,
    ticket text NOT NULL,
    service_date date DEFAULT (timezone('Asia/Jakarta'::text, now()))::date NOT NULL,
    guest_name text NOT NULL,
    pack integer NOT NULL,
    phone text,
    status text DEFAULT 'waiting'::text NOT NULL,
    created_by uuid DEFAULT auth.uid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    seated_at timestamp with time zone,
    resolved_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    table_label text,
    smoking boolean,
    CONSTRAINT guests_guest_name_check CHECK (((length(TRIM(BOTH FROM guest_name)) >= 1) AND (length(TRIM(BOTH FROM guest_name)) <= 70))),
    CONSTRAINT guests_pack_check CHECK (((pack >= 1) AND (pack <= 30))),
    CONSTRAINT guests_status_check CHECK ((status = ANY (ARRAY['waiting'::text, 'called'::text, 'seated'::text, 'done'::text, 'missed'::text, 'cancelled'::text])))
);


--
-- Name: item_unit_conversions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_unit_conversions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    factor_to_base numeric(18,6) NOT NULL,
    is_base_unit boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace_id uuid DEFAULT public.default_workspace_id() NOT NULL,
    CONSTRAINT item_unit_conversions_factor_to_base_check CHECK ((factor_to_base > (0)::numeric))
);


--
-- Name: items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    division_id uuid NOT NULL,
    item_type text NOT NULL,
    base_unit_id uuid NOT NULL,
    is_supply boolean DEFAULT false NOT NULL,
    reference_price numeric(18,4),
    reference_price_unit_id uuid,
    reference_unit_factor_snapshot numeric(18,6),
    last_purchase_price numeric(18,4),
    last_purchase_unit_id uuid,
    last_purchase_unit_factor_snapshot numeric(18,6),
    base_unit_price numeric(18,6) GENERATED ALWAYS AS (
CASE
    WHEN ((last_purchase_price IS NOT NULL) AND (last_purchase_unit_factor_snapshot IS NOT NULL)) THEN (last_purchase_price / last_purchase_unit_factor_snapshot)
    WHEN ((reference_price IS NOT NULL) AND (reference_unit_factor_snapshot IS NOT NULL)) THEN (reference_price / reference_unit_factor_snapshot)
    ELSE NULL::numeric
END) STORED,
    base_unit_price_source text GENERATED ALWAYS AS (
CASE
    WHEN ((last_purchase_price IS NOT NULL) AND (last_purchase_unit_factor_snapshot IS NOT NULL)) THEN 'last_purchase'::text
    WHEN ((reference_price IS NOT NULL) AND (reference_unit_factor_snapshot IS NOT NULL)) THEN 'reference_estimate'::text
    ELSE 'missing'::text
END) STORED,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace_id uuid DEFAULT public.default_workspace_id() NOT NULL,
    CONSTRAINT items_last_price_snapshot_check CHECK ((((last_purchase_price IS NULL) AND (last_purchase_unit_id IS NULL) AND (last_purchase_unit_factor_snapshot IS NULL)) OR ((last_purchase_price IS NOT NULL) AND (last_purchase_unit_id IS NOT NULL) AND (last_purchase_unit_factor_snapshot IS NOT NULL)))),
    CONSTRAINT items_last_purchase_price_check CHECK (((last_purchase_price IS NULL) OR (last_purchase_price >= (0)::numeric))),
    CONSTRAINT items_last_purchase_unit_factor_snapshot_check CHECK (((last_purchase_unit_factor_snapshot IS NULL) OR (last_purchase_unit_factor_snapshot > (0)::numeric))),
    CONSTRAINT items_reference_price_check CHECK (((reference_price IS NULL) OR (reference_price >= (0)::numeric))),
    CONSTRAINT items_reference_price_snapshot_check CHECK ((((reference_price IS NULL) AND (reference_price_unit_id IS NULL) AND (reference_unit_factor_snapshot IS NULL)) OR ((reference_price IS NOT NULL) AND (reference_price_unit_id IS NOT NULL) AND (reference_unit_factor_snapshot IS NOT NULL)))),
    CONSTRAINT items_reference_unit_factor_snapshot_check CHECK (((reference_unit_factor_snapshot IS NULL) OR (reference_unit_factor_snapshot > (0)::numeric)))
);


--
-- Name: menu_recipe_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_recipe_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    menu_id uuid NOT NULL,
    component_type text NOT NULL,
    item_id uuid,
    wip_recipe_id uuid,
    quantity numeric(18,6) NOT NULL,
    unit_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace_id uuid DEFAULT public.default_workspace_id() NOT NULL,
    CONSTRAINT menu_recipe_line_component_check CHECK ((((component_type = 'item'::text) AND (item_id IS NOT NULL) AND (wip_recipe_id IS NULL)) OR ((component_type = 'wip'::text) AND (wip_recipe_id IS NOT NULL) AND (item_id IS NULL)))),
    CONSTRAINT menu_recipe_lines_component_type_check CHECK ((component_type = ANY (ARRAY['item'::text, 'wip'::text]))),
    CONSTRAINT menu_recipe_lines_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: menus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menus (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    division_id uuid NOT NULL,
    selling_price numeric(18,2) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace_id uuid DEFAULT public.default_workspace_id() NOT NULL,
    CONSTRAINT menus_selling_price_check CHECK ((selling_price >= (0)::numeric))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    display_name text,
    role text DEFAULT 'admin'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['developer'::text, 'admin'::text, 'service'::text])))
);


--
-- Name: reservation_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservation_counters (
    workspace_id uuid NOT NULL,
    service_date date NOT NULL,
    last_number integer DEFAULT 0 NOT NULL,
    CONSTRAINT reservation_counters_last_number_check CHECK ((last_number >= 0))
);


--
-- Name: reservation_edit_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservation_edit_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    reservation_id uuid NOT NULL,
    before_data jsonb NOT NULL,
    after_data jsonb NOT NULL,
    edited_by uuid,
    edited_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


--
-- Name: reservation_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservation_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    reservation_id uuid NOT NULL,
    status text NOT NULL,
    label text NOT NULL,
    detail text,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reservation_status_history_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'arrived'::text, 'seated'::text, 'cancelled'::text, 'no_show'::text])))
);


--
-- Name: reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid DEFAULT public.default_workspace_id() NOT NULL,
    code text NOT NULL,
    reservation_date date NOT NULL,
    reservation_time time without time zone NOT NULL,
    guest_name text NOT NULL,
    pack integer NOT NULL,
    phone text,
    smoking text,
    note text,
    table_label text,
    status text DEFAULT 'confirmed'::text NOT NULL,
    created_by uuid DEFAULT auth.uid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reservations_guest_name_check CHECK (((length(TRIM(BOTH FROM guest_name)) >= 1) AND (length(TRIM(BOTH FROM guest_name)) <= 70))),
    CONSTRAINT reservations_pack_check CHECK (((pack >= 1) AND (pack <= 500))),
    CONSTRAINT reservations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'arrived'::text, 'seated'::text, 'cancelled'::text, 'no_show'::text])))
);


--
-- Name: stock_opname_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_opname_requests (
    request_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    division_id uuid NOT NULL,
    action text NOT NULL,
    payload_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stock_opname_scopes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_opname_scopes (
    division_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stock_opname_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_opname_state (
    division_id uuid NOT NULL,
    payload jsonb DEFAULT '{"periods": [], "documents": []}'::jsonb NOT NULL,
    revision bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.units (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    abbreviation text NOT NULL,
    dimension text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace_id uuid DEFAULT public.default_workspace_id() NOT NULL,
    CONSTRAINT units_dimension_check CHECK ((dimension = ANY (ARRAY['mass'::text, 'volume'::text, 'count'::text, 'length'::text, 'other'::text])))
);


--
-- Name: user_monitoring_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_monitoring_activity (
    id bigint NOT NULL,
    event_type text NOT NULL,
    user_id uuid,
    actor_email text,
    actor_name text,
    actor_role text,
    auth_session_id uuid,
    workspace_id uuid,
    workspace_name text,
    attempted_email_hint text,
    source text DEFAULT 'password'::text NOT NULL,
    reason_code text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT user_monitoring_activity_event_type_check CHECK ((event_type = ANY (ARRAY['login_success'::text, 'login_failed'::text, 'login_error'::text, 'logout'::text])))
);


--
-- Name: user_monitoring_activity_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.user_monitoring_activity ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.user_monitoring_activity_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_monitoring_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_monitoring_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_session_id uuid NOT NULL,
    user_id uuid,
    user_email text NOT NULL,
    display_name text NOT NULL,
    role text NOT NULL,
    workspace_id uuid,
    workspace_name text,
    device_type text NOT NULL,
    browser text NOT NULL,
    operating_system text NOT NULL,
    status text DEFAULT 'online'::text NOT NULL,
    logged_in_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_active_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    device_id uuid NOT NULL,
    CONSTRAINT user_monitoring_sessions_device_type_check CHECK ((device_type = ANY (ARRAY['mobile'::text, 'tablet'::text, 'desktop'::text]))),
    CONSTRAINT user_monitoring_sessions_status_check CHECK ((status = ANY (ARRAY['online'::text, 'offline'::text, 'logged_out'::text])))
);


--
-- Name: wip_recipe_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wip_recipe_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wip_recipe_id uuid NOT NULL,
    component_type text NOT NULL,
    item_id uuid,
    component_wip_id uuid,
    quantity numeric(18,6) NOT NULL,
    unit_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace_id uuid DEFAULT public.default_workspace_id() NOT NULL,
    CONSTRAINT wip_recipe_line_component_check CHECK ((((component_type = 'item'::text) AND (item_id IS NOT NULL) AND (component_wip_id IS NULL)) OR ((component_type = 'wip'::text) AND (component_wip_id IS NOT NULL) AND (item_id IS NULL)))),
    CONSTRAINT wip_recipe_lines_component_type_check CHECK ((component_type = ANY (ARRAY['item'::text, 'wip'::text]))),
    CONSTRAINT wip_recipe_lines_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT wip_recipe_no_self_reference CHECK (((component_wip_id IS NULL) OR (component_wip_id <> wip_recipe_id)))
);


--
-- Name: wip_recipes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wip_recipes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    division_id uuid NOT NULL,
    yield_quantity numeric(18,6) NOT NULL,
    yield_unit_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace_id uuid DEFAULT public.default_workspace_id() NOT NULL,
    CONSTRAINT wip_recipes_yield_quantity_check CHECK ((yield_quantity > (0)::numeric))
);


--
-- Name: workspace_division_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_division_memberships (
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    division_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workspace_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_memberships (
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workspace_memberships_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'service'::text, 'division_admin'::text])))
);


--
-- Name: workspace_module_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_module_state (
    workspace_id uuid NOT NULL,
    module_key text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    division_id uuid,
    CONSTRAINT workspace_module_state_module_key_check CHECK (((length(TRIM(BOTH FROM module_key)) >= 1) AND (length(TRIM(BOTH FROM module_key)) <= 80)))
);


--
-- Name: workspace_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_settings (
    workspace_id uuid NOT NULL,
    setting_key text NOT NULL,
    setting_value jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: workspaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: divisions divisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.divisions
    ADD CONSTRAINT divisions_pkey PRIMARY KEY (id);


--
-- Name: guest_counters guest_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_counters
    ADD CONSTRAINT guest_counters_pkey PRIMARY KEY (workspace_id, service_date);


--
-- Name: guest_status_history guest_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_status_history
    ADD CONSTRAINT guest_status_history_pkey PRIMARY KEY (id);


--
-- Name: guests guests_id_workspace_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guests
    ADD CONSTRAINT guests_id_workspace_key UNIQUE (id, workspace_id);


--
-- Name: guests guests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guests
    ADD CONSTRAINT guests_pkey PRIMARY KEY (id);


--
-- Name: guests guests_workspace_id_service_date_ticket_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guests
    ADD CONSTRAINT guests_workspace_id_service_date_ticket_key UNIQUE (workspace_id, service_date, ticket);


--
-- Name: item_unit_conversions item_unit_conversions_item_id_unit_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_unit_conversions
    ADD CONSTRAINT item_unit_conversions_item_id_unit_id_key UNIQUE (item_id, unit_id);


--
-- Name: item_unit_conversions item_unit_conversions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_unit_conversions
    ADD CONSTRAINT item_unit_conversions_pkey PRIMARY KEY (id);


--
-- Name: items items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_pkey PRIMARY KEY (id);


--
-- Name: menu_recipe_lines menu_recipe_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_recipe_lines
    ADD CONSTRAINT menu_recipe_lines_pkey PRIMARY KEY (id);


--
-- Name: menus menus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menus
    ADD CONSTRAINT menus_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: reservation_counters reservation_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservation_counters
    ADD CONSTRAINT reservation_counters_pkey PRIMARY KEY (workspace_id, service_date);


--
-- Name: reservation_edit_history reservation_edit_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservation_edit_history
    ADD CONSTRAINT reservation_edit_history_pkey PRIMARY KEY (id);


--
-- Name: reservation_status_history reservation_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservation_status_history
    ADD CONSTRAINT reservation_status_history_pkey PRIMARY KEY (id);


--
-- Name: reservations reservations_id_workspace_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_id_workspace_key UNIQUE (id, workspace_id);


--
-- Name: reservations reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_pkey PRIMARY KEY (id);


--
-- Name: stock_opname_requests stock_opname_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_opname_requests
    ADD CONSTRAINT stock_opname_requests_pkey PRIMARY KEY (request_id);


--
-- Name: stock_opname_scopes stock_opname_scopes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_opname_scopes
    ADD CONSTRAINT stock_opname_scopes_pkey PRIMARY KEY (division_id);


--
-- Name: stock_opname_state stock_opname_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_opname_state
    ADD CONSTRAINT stock_opname_state_pkey PRIMARY KEY (division_id);


--
-- Name: units units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_pkey PRIMARY KEY (id);


--
-- Name: user_monitoring_activity user_monitoring_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_monitoring_activity
    ADD CONSTRAINT user_monitoring_activity_pkey PRIMARY KEY (id);


--
-- Name: user_monitoring_sessions user_monitoring_sessions_auth_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_monitoring_sessions
    ADD CONSTRAINT user_monitoring_sessions_auth_session_id_key UNIQUE (auth_session_id);


--
-- Name: user_monitoring_sessions user_monitoring_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_monitoring_sessions
    ADD CONSTRAINT user_monitoring_sessions_pkey PRIMARY KEY (id);


--
-- Name: wip_recipe_lines wip_recipe_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wip_recipe_lines
    ADD CONSTRAINT wip_recipe_lines_pkey PRIMARY KEY (id);


--
-- Name: wip_recipes wip_recipes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wip_recipes
    ADD CONSTRAINT wip_recipes_pkey PRIMARY KEY (id);


--
-- Name: workspace_division_memberships workspace_division_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_division_memberships
    ADD CONSTRAINT workspace_division_memberships_pkey PRIMARY KEY (workspace_id, user_id, division_id);


--
-- Name: workspace_memberships workspace_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_memberships
    ADD CONSTRAINT workspace_memberships_pkey PRIMARY KEY (workspace_id, user_id);


--
-- Name: workspace_module_state workspace_module_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_module_state
    ADD CONSTRAINT workspace_module_state_pkey PRIMARY KEY (workspace_id, module_key);


--
-- Name: workspace_settings workspace_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_settings
    ADD CONSTRAINT workspace_settings_pkey PRIMARY KEY (workspace_id, setting_key);


--
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);


--
-- Name: divisions_workspace_id_id_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX divisions_workspace_id_id_uidx ON public.divisions USING btree (workspace_id, id);


--
-- Name: divisions_workspace_name_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX divisions_workspace_name_uidx ON public.divisions USING btree (workspace_id, lower(name));


--
-- Name: guest_history_guest_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX guest_history_guest_time_idx ON public.guest_status_history USING btree (guest_id, changed_at);


--
-- Name: guest_status_history_workspace_guest_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX guest_status_history_workspace_guest_time_idx ON public.guest_status_history USING btree (workspace_id, guest_id, changed_at);


--
-- Name: guests_reservation_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX guests_reservation_workspace_idx ON public.guests USING btree (reservation_id, workspace_id) WHERE (reservation_id IS NOT NULL);


--
-- Name: guests_workspace_date_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX guests_workspace_date_status_idx ON public.guests USING btree (workspace_id, service_date, status, created_at);


--
-- Name: item_one_base_conversion; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX item_one_base_conversion ON public.item_unit_conversions USING btree (item_id) WHERE (is_base_unit = true);


--
-- Name: item_unit_conversions_unit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_unit_conversions_unit_idx ON public.item_unit_conversions USING btree (unit_id);


--
-- Name: items_base_unit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX items_base_unit_idx ON public.items USING btree (base_unit_id);


--
-- Name: items_division_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX items_division_name_unique ON public.items USING btree (division_id, lower(name));


--
-- Name: items_last_purchase_unit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX items_last_purchase_unit_idx ON public.items USING btree (last_purchase_unit_id);


--
-- Name: items_reference_price_unit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX items_reference_price_unit_idx ON public.items USING btree (reference_price_unit_id);


--
-- Name: items_workspace_code_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX items_workspace_code_uidx ON public.items USING btree (workspace_id, code);


--
-- Name: items_workspace_division_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX items_workspace_division_idx ON public.items USING btree (workspace_id, division_id);


--
-- Name: menu_recipe_lines_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX menu_recipe_lines_item_idx ON public.menu_recipe_lines USING btree (item_id);


--
-- Name: menu_recipe_lines_menu_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX menu_recipe_lines_menu_idx ON public.menu_recipe_lines USING btree (menu_id);


--
-- Name: menu_recipe_lines_unit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX menu_recipe_lines_unit_idx ON public.menu_recipe_lines USING btree (unit_id);


--
-- Name: menu_recipe_lines_wip_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX menu_recipe_lines_wip_idx ON public.menu_recipe_lines USING btree (wip_recipe_id);


--
-- Name: menus_division_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX menus_division_name_unique ON public.menus USING btree (division_id, lower(name));


--
-- Name: menus_workspace_code_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX menus_workspace_code_uidx ON public.menus USING btree (workspace_id, code);


--
-- Name: menus_workspace_division_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX menus_workspace_division_idx ON public.menus USING btree (workspace_id, division_id);


--
-- Name: reservation_edit_history_workspace_reservation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reservation_edit_history_workspace_reservation_idx ON public.reservation_edit_history USING btree (workspace_id, reservation_id, edited_at DESC);


--
-- Name: reservation_history_reservation_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reservation_history_reservation_time_idx ON public.reservation_status_history USING btree (reservation_id, changed_at);


--
-- Name: reservation_history_reservation_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reservation_history_reservation_workspace_idx ON public.reservation_status_history USING btree (reservation_id, workspace_id);


--
-- Name: reservations_workspace_date_code_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX reservations_workspace_date_code_uidx ON public.reservations USING btree (workspace_id, reservation_date, code);


--
-- Name: reservations_workspace_date_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reservations_workspace_date_time_idx ON public.reservations USING btree (workspace_id, reservation_date, reservation_time);


--
-- Name: stock_opname_requests_actor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_opname_requests_actor_idx ON public.stock_opname_requests USING btree (actor_id);


--
-- Name: stock_opname_requests_division_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_opname_requests_division_idx ON public.stock_opname_requests USING btree (division_id);


--
-- Name: stock_opname_scopes_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_opname_scopes_workspace_idx ON public.stock_opname_scopes USING btree (workspace_id);


--
-- Name: units_workspace_abbreviation_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX units_workspace_abbreviation_uidx ON public.units USING btree (workspace_id, lower(abbreviation));


--
-- Name: units_workspace_name_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX units_workspace_name_uidx ON public.units USING btree (workspace_id, lower(name));


--
-- Name: user_monitoring_activity_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_monitoring_activity_time_idx ON public.user_monitoring_activity USING btree (occurred_at DESC);


--
-- Name: user_monitoring_activity_user_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_monitoring_activity_user_time_idx ON public.user_monitoring_activity USING btree (user_id, occurred_at DESC);


--
-- Name: user_monitoring_activity_workspace_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_monitoring_activity_workspace_time_idx ON public.user_monitoring_activity USING btree (workspace_id, occurred_at DESC);


--
-- Name: user_monitoring_sessions_device_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_monitoring_sessions_device_idx ON public.user_monitoring_sessions USING btree (user_id, device_id, last_seen_at DESC);


--
-- Name: user_monitoring_sessions_status_seen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_monitoring_sessions_status_seen_idx ON public.user_monitoring_sessions USING btree (status, last_seen_at DESC);


--
-- Name: user_monitoring_sessions_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_monitoring_sessions_user_idx ON public.user_monitoring_sessions USING btree (user_id, logged_in_at DESC);


--
-- Name: user_monitoring_sessions_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_monitoring_sessions_workspace_idx ON public.user_monitoring_sessions USING btree (workspace_id, logged_in_at DESC);


--
-- Name: wip_recipe_lines_component_wip_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wip_recipe_lines_component_wip_idx ON public.wip_recipe_lines USING btree (component_wip_id);


--
-- Name: wip_recipe_lines_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wip_recipe_lines_item_idx ON public.wip_recipe_lines USING btree (item_id);


--
-- Name: wip_recipe_lines_recipe_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wip_recipe_lines_recipe_idx ON public.wip_recipe_lines USING btree (wip_recipe_id);


--
-- Name: wip_recipe_lines_unit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wip_recipe_lines_unit_idx ON public.wip_recipe_lines USING btree (unit_id);


--
-- Name: wip_recipes_division_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX wip_recipes_division_name_unique ON public.wip_recipes USING btree (division_id, lower(name));


--
-- Name: wip_recipes_workspace_code_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX wip_recipes_workspace_code_uidx ON public.wip_recipes USING btree (workspace_id, code);


--
-- Name: wip_recipes_workspace_division_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wip_recipes_workspace_division_idx ON public.wip_recipes USING btree (workspace_id, division_id);


--
-- Name: wip_recipes_yield_unit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wip_recipes_yield_unit_idx ON public.wip_recipes USING btree (yield_unit_id);


--
-- Name: workspace_division_memberships_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_division_memberships_user_idx ON public.workspace_division_memberships USING btree (user_id, workspace_id);


--
-- Name: workspace_memberships_user_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_memberships_user_workspace_idx ON public.workspace_memberships USING btree (user_id, workspace_id);


--
-- Name: guest_status_history guest_history_enforce_actor; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guest_history_enforce_actor BEFORE INSERT ON public.guest_status_history FOR EACH ROW EXECUTE FUNCTION private.enforce_guest_audit_actor();


--
-- Name: guests guests_enforce_record_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guests_enforce_record_identity BEFORE INSERT OR UPDATE ON public.guests FOR EACH ROW EXECUTE FUNCTION private.enforce_guest_record_identity();


--
-- Name: guests guests_guard_single_reservation_guest; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guests_guard_single_reservation_guest BEFORE INSERT OR UPDATE ON public.guests FOR EACH ROW EXECUTE FUNCTION private.prevent_duplicate_reservation_guest();


--
-- Name: guests guests_status_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guests_status_history AFTER INSERT OR UPDATE ON public.guests FOR EACH ROW EXECUTE FUNCTION public.log_guest_status_change();


--
-- Name: item_unit_conversions item_unit_conversions_protect_base; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER item_unit_conversions_protect_base BEFORE DELETE ON public.item_unit_conversions FOR EACH ROW EXECUTE FUNCTION public.prevent_base_conversion_delete();


--
-- Name: item_unit_conversions item_unit_conversions_validate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER item_unit_conversions_validate BEFORE INSERT OR UPDATE ON public.item_unit_conversions FOR EACH ROW EXECUTE FUNCTION public.validate_item_unit_conversion();


--
-- Name: items items_create_base_conversion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER items_create_base_conversion AFTER INSERT OR UPDATE OF base_unit_id ON public.items FOR EACH ROW EXECUTE FUNCTION public.ensure_item_base_unit_conversion();


--
-- Name: items items_validate_price_snapshots; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER items_validate_price_snapshots BEFORE INSERT OR UPDATE OF reference_price, reference_price_unit_id, last_purchase_price, last_purchase_unit_id ON public.items FOR EACH ROW EXECUTE FUNCTION public.validate_item_price_snapshots();


--
-- Name: menu_recipe_lines menu_recipe_lines_validate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER menu_recipe_lines_validate BEFORE INSERT OR UPDATE ON public.menu_recipe_lines FOR EACH ROW EXECUTE FUNCTION public.validate_menu_recipe_line();


--
-- Name: reservation_status_history reservation_history_enforce_actor; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reservation_history_enforce_actor BEFORE INSERT ON public.reservation_status_history FOR EACH ROW EXECUTE FUNCTION private.enforce_guest_audit_actor();


--
-- Name: reservations reservations_edit_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reservations_edit_history AFTER UPDATE OF guest_name, pack, reservation_date, reservation_time, phone, smoking, note ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.log_reservation_edit();


--
-- Name: reservations reservations_enforce_record_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reservations_enforce_record_identity BEFORE INSERT OR UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION private.enforce_guest_record_identity();


--
-- Name: reservations reservations_status_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reservations_status_history AFTER INSERT OR UPDATE OF status ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.log_reservation_status_change();


--
-- Name: wip_recipe_lines wip_recipe_lines_validate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wip_recipe_lines_validate BEFORE INSERT OR UPDATE ON public.wip_recipe_lines FOR EACH ROW EXECUTE FUNCTION public.validate_wip_recipe_line();


--
-- Name: divisions divisions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.divisions
    ADD CONSTRAINT divisions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);


--
-- Name: guest_counters guest_counters_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_counters
    ADD CONSTRAINT guest_counters_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: guest_status_history guest_history_guest_workspace_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_status_history
    ADD CONSTRAINT guest_history_guest_workspace_fkey FOREIGN KEY (guest_id, workspace_id) REFERENCES public.guests(id, workspace_id) ON DELETE CASCADE;


--
-- Name: guest_status_history guest_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_status_history
    ADD CONSTRAINT guest_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: guest_status_history guest_status_history_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_status_history
    ADD CONSTRAINT guest_status_history_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: guests guests_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guests
    ADD CONSTRAINT guests_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: guests guests_reservation_workspace_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guests
    ADD CONSTRAINT guests_reservation_workspace_fkey FOREIGN KEY (reservation_id, workspace_id) REFERENCES public.reservations(id, workspace_id) ON DELETE SET NULL (reservation_id);


--
-- Name: guests guests_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guests
    ADD CONSTRAINT guests_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: item_unit_conversions item_unit_conversions_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_unit_conversions
    ADD CONSTRAINT item_unit_conversions_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: item_unit_conversions item_unit_conversions_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_unit_conversions
    ADD CONSTRAINT item_unit_conversions_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE RESTRICT;


--
-- Name: item_unit_conversions item_unit_conversions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_unit_conversions
    ADD CONSTRAINT item_unit_conversions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);


--
-- Name: items items_base_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_base_unit_id_fkey FOREIGN KEY (base_unit_id) REFERENCES public.units(id) ON DELETE RESTRICT;


--
-- Name: items items_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id) ON DELETE RESTRICT;


--
-- Name: items items_last_purchase_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_last_purchase_unit_id_fkey FOREIGN KEY (last_purchase_unit_id) REFERENCES public.units(id) ON DELETE RESTRICT;


--
-- Name: items items_reference_price_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_reference_price_unit_id_fkey FOREIGN KEY (reference_price_unit_id) REFERENCES public.units(id) ON DELETE RESTRICT;


--
-- Name: items items_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);


--
-- Name: menu_recipe_lines menu_recipe_lines_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_recipe_lines
    ADD CONSTRAINT menu_recipe_lines_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE RESTRICT;


--
-- Name: menu_recipe_lines menu_recipe_lines_menu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_recipe_lines
    ADD CONSTRAINT menu_recipe_lines_menu_id_fkey FOREIGN KEY (menu_id) REFERENCES public.menus(id) ON DELETE CASCADE;


--
-- Name: menu_recipe_lines menu_recipe_lines_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_recipe_lines
    ADD CONSTRAINT menu_recipe_lines_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE RESTRICT;


--
-- Name: menu_recipe_lines menu_recipe_lines_wip_recipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_recipe_lines
    ADD CONSTRAINT menu_recipe_lines_wip_recipe_id_fkey FOREIGN KEY (wip_recipe_id) REFERENCES public.wip_recipes(id) ON DELETE RESTRICT;


--
-- Name: menu_recipe_lines menu_recipe_lines_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_recipe_lines
    ADD CONSTRAINT menu_recipe_lines_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);


--
-- Name: menus menus_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menus
    ADD CONSTRAINT menus_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id) ON DELETE RESTRICT;


--
-- Name: menus menus_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menus
    ADD CONSTRAINT menus_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: reservation_counters reservation_counters_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservation_counters
    ADD CONSTRAINT reservation_counters_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: reservation_edit_history reservation_edit_history_reservation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservation_edit_history
    ADD CONSTRAINT reservation_edit_history_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES public.reservations(id) ON DELETE CASCADE;


--
-- Name: reservation_edit_history reservation_edit_history_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservation_edit_history
    ADD CONSTRAINT reservation_edit_history_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: reservation_status_history reservation_history_reservation_workspace_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservation_status_history
    ADD CONSTRAINT reservation_history_reservation_workspace_fkey FOREIGN KEY (reservation_id, workspace_id) REFERENCES public.reservations(id, workspace_id) ON DELETE CASCADE;


--
-- Name: reservation_status_history reservation_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservation_status_history
    ADD CONSTRAINT reservation_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: reservation_status_history reservation_status_history_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservation_status_history
    ADD CONSTRAINT reservation_status_history_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: reservations reservations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: reservations reservations_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: stock_opname_requests stock_opname_requests_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_opname_requests
    ADD CONSTRAINT stock_opname_requests_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id);


--
-- Name: stock_opname_requests stock_opname_requests_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_opname_requests
    ADD CONSTRAINT stock_opname_requests_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.stock_opname_scopes(division_id);


--
-- Name: stock_opname_scopes stock_opname_scopes_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_opname_scopes
    ADD CONSTRAINT stock_opname_scopes_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id);


--
-- Name: stock_opname_scopes stock_opname_scopes_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_opname_scopes
    ADD CONSTRAINT stock_opname_scopes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);


--
-- Name: stock_opname_state stock_opname_state_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_opname_state
    ADD CONSTRAINT stock_opname_state_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.stock_opname_scopes(division_id);


--
-- Name: units units_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);


--
-- Name: user_monitoring_activity user_monitoring_activity_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_monitoring_activity
    ADD CONSTRAINT user_monitoring_activity_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: user_monitoring_activity user_monitoring_activity_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_monitoring_activity
    ADD CONSTRAINT user_monitoring_activity_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;


--
-- Name: user_monitoring_sessions user_monitoring_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_monitoring_sessions
    ADD CONSTRAINT user_monitoring_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: user_monitoring_sessions user_monitoring_sessions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_monitoring_sessions
    ADD CONSTRAINT user_monitoring_sessions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;


--
-- Name: wip_recipe_lines wip_recipe_lines_component_wip_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wip_recipe_lines
    ADD CONSTRAINT wip_recipe_lines_component_wip_id_fkey FOREIGN KEY (component_wip_id) REFERENCES public.wip_recipes(id) ON DELETE RESTRICT;


--
-- Name: wip_recipe_lines wip_recipe_lines_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wip_recipe_lines
    ADD CONSTRAINT wip_recipe_lines_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE RESTRICT;


--
-- Name: wip_recipe_lines wip_recipe_lines_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wip_recipe_lines
    ADD CONSTRAINT wip_recipe_lines_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE RESTRICT;


--
-- Name: wip_recipe_lines wip_recipe_lines_wip_recipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wip_recipe_lines
    ADD CONSTRAINT wip_recipe_lines_wip_recipe_id_fkey FOREIGN KEY (wip_recipe_id) REFERENCES public.wip_recipes(id) ON DELETE CASCADE;


--
-- Name: wip_recipe_lines wip_recipe_lines_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wip_recipe_lines
    ADD CONSTRAINT wip_recipe_lines_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);


--
-- Name: wip_recipes wip_recipes_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wip_recipes
    ADD CONSTRAINT wip_recipes_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id) ON DELETE RESTRICT;


--
-- Name: wip_recipes wip_recipes_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wip_recipes
    ADD CONSTRAINT wip_recipes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);


--
-- Name: wip_recipes wip_recipes_yield_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wip_recipes
    ADD CONSTRAINT wip_recipes_yield_unit_id_fkey FOREIGN KEY (yield_unit_id) REFERENCES public.units(id) ON DELETE RESTRICT;


--
-- Name: workspace_division_memberships workspace_division_memberships_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_division_memberships
    ADD CONSTRAINT workspace_division_memberships_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id) ON DELETE CASCADE;


--
-- Name: workspace_division_memberships workspace_division_memberships_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_division_memberships
    ADD CONSTRAINT workspace_division_memberships_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_division_memberships workspace_division_memberships_workspace_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_division_memberships
    ADD CONSTRAINT workspace_division_memberships_workspace_id_user_id_fkey FOREIGN KEY (workspace_id, user_id) REFERENCES public.workspace_memberships(workspace_id, user_id) ON DELETE CASCADE;


--
-- Name: workspace_memberships workspace_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_memberships
    ADD CONSTRAINT workspace_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: workspace_memberships workspace_memberships_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_memberships
    ADD CONSTRAINT workspace_memberships_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_module_state workspace_module_state_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_module_state
    ADD CONSTRAINT workspace_module_state_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id) ON DELETE CASCADE;


--
-- Name: workspace_module_state workspace_module_state_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_module_state
    ADD CONSTRAINT workspace_module_state_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: workspace_module_state workspace_module_state_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_module_state
    ADD CONSTRAINT workspace_module_state_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_settings workspace_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_settings
    ADD CONSTRAINT workspace_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: workspace_settings workspace_settings_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_settings
    ADD CONSTRAINT workspace_settings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspaces workspaces_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: workspace_division_memberships division_memberships_developer_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_memberships_developer_delete ON public.workspace_division_memberships FOR DELETE TO authenticated USING (public.is_current_user_developer());


--
-- Name: workspace_division_memberships division_memberships_developer_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_memberships_developer_insert ON public.workspace_division_memberships FOR INSERT TO authenticated WITH CHECK (public.is_current_user_developer());


--
-- Name: workspace_division_memberships division_memberships_developer_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_memberships_developer_update ON public.workspace_division_memberships FOR UPDATE TO authenticated USING (public.is_current_user_developer()) WITH CHECK (public.is_current_user_developer());


--
-- Name: workspace_division_memberships division_memberships_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_memberships_self_read ON public.workspace_division_memberships FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR public.is_current_user_developer()));


--
-- Name: divisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.divisions ENABLE ROW LEVEL SECURITY;

--
-- Name: divisions divisions_developer_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY divisions_developer_delete ON public.divisions FOR DELETE TO authenticated USING (public.is_current_user_developer());


--
-- Name: divisions divisions_developer_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY divisions_developer_insert ON public.divisions FOR INSERT TO authenticated WITH CHECK (public.is_current_user_developer());


--
-- Name: divisions divisions_developer_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY divisions_developer_update ON public.divisions FOR UPDATE TO authenticated USING (public.is_current_user_developer()) WITH CHECK (public.is_current_user_developer());


--
-- Name: divisions divisions_scoped_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY divisions_scoped_read ON public.divisions FOR SELECT TO authenticated USING (private.has_division_access(workspace_id, id));


--
-- Name: guest_counters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.guest_counters ENABLE ROW LEVEL SECURITY;

--
-- Name: guest_counters guest_counters_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY guest_counters_service_all ON public.guest_counters TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['service'::text])) WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['service'::text]));


--
-- Name: guest_status_history guest_history_service_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY guest_history_service_read ON public.guest_status_history FOR SELECT TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['service'::text]));


--
-- Name: guest_status_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.guest_status_history ENABLE ROW LEVEL SECURITY;

--
-- Name: guests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;

--
-- Name: guests guests_developer_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY guests_developer_delete ON public.guests FOR DELETE TO authenticated USING (public.is_current_user_developer());


--
-- Name: guests guests_service_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY guests_service_insert ON public.guests FOR INSERT TO authenticated WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['service'::text]));


--
-- Name: guests guests_service_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY guests_service_read ON public.guests FOR SELECT TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['service'::text]));


--
-- Name: guests guests_service_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY guests_service_update ON public.guests FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['service'::text])) WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['service'::text]));


--
-- Name: item_unit_conversions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.item_unit_conversions ENABLE ROW LEVEL SECURITY;

--
-- Name: item_unit_conversions item_unit_conversions_division_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_unit_conversions_division_manage ON public.item_unit_conversions TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.items i
  WHERE ((i.id = item_unit_conversions.item_id) AND (i.workspace_id = item_unit_conversions.workspace_id) AND private.has_division_access(i.workspace_id, i.division_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.items i
  WHERE ((i.id = item_unit_conversions.item_id) AND (i.workspace_id = item_unit_conversions.workspace_id) AND private.has_division_access(i.workspace_id, i.division_id)))));


--
-- Name: items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

--
-- Name: items items_division_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY items_division_manage ON public.items TO authenticated USING (private.has_division_access(workspace_id, division_id)) WITH CHECK (private.has_division_access(workspace_id, division_id));


--
-- Name: workspace_memberships memberships_developer_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memberships_developer_delete ON public.workspace_memberships FOR DELETE TO authenticated USING (public.is_current_user_developer());


--
-- Name: workspace_memberships memberships_developer_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memberships_developer_insert ON public.workspace_memberships FOR INSERT TO authenticated WITH CHECK (public.is_current_user_developer());


--
-- Name: workspace_memberships memberships_developer_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memberships_developer_update ON public.workspace_memberships FOR UPDATE TO authenticated USING (public.is_current_user_developer()) WITH CHECK (public.is_current_user_developer());


--
-- Name: workspace_memberships memberships_member_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memberships_member_read ON public.workspace_memberships FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR public.is_current_user_developer()));


--
-- Name: menu_recipe_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_recipe_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_recipe_lines menu_recipe_lines_division_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_recipe_lines_division_manage ON public.menu_recipe_lines TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.menus m
  WHERE ((m.id = menu_recipe_lines.menu_id) AND (m.workspace_id = menu_recipe_lines.workspace_id) AND private.has_division_access(m.workspace_id, m.division_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.menus m
  WHERE ((m.id = menu_recipe_lines.menu_id) AND (m.workspace_id = menu_recipe_lines.workspace_id) AND private.has_division_access(m.workspace_id, m.division_id)))));


--
-- Name: menus; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menus ENABLE ROW LEVEL SECURITY;

--
-- Name: menus menus_division_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menus_division_manage ON public.menus TO authenticated USING (private.has_division_access(workspace_id, division_id)) WITH CHECK (private.has_division_access(workspace_id, division_id));


--
-- Name: workspace_module_state module_state_developer_or_assigned_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_state_developer_or_assigned_manage ON public.workspace_module_state TO authenticated USING ((public.is_current_user_developer() OR ((division_id IS NOT NULL) AND private.has_division_access(workspace_id, division_id)))) WITH CHECK ((public.is_current_user_developer() OR ((division_id IS NOT NULL) AND private.has_division_access(workspace_id, division_id))));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_developer_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_developer_delete ON public.profiles FOR DELETE TO authenticated USING (public.is_current_user_developer());


--
-- Name: profiles profiles_developer_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_developer_insert ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.is_current_user_developer());


--
-- Name: profiles profiles_developer_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_developer_update ON public.profiles FOR UPDATE TO authenticated USING (public.is_current_user_developer()) WITH CHECK (public.is_current_user_developer());


--
-- Name: profiles profiles_read_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_read_own ON public.profiles FOR SELECT TO authenticated USING (((id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.is_current_user_developer() AS is_current_user_developer)));


--
-- Name: reservation_counters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reservation_counters ENABLE ROW LEVEL SECURITY;

--
-- Name: reservation_counters reservation_counters_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reservation_counters_service_all ON public.reservation_counters TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['service'::text])) WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['service'::text]));


--
-- Name: reservation_edit_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reservation_edit_history ENABLE ROW LEVEL SECURITY;

--
-- Name: reservation_edit_history reservation_edit_history_service_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reservation_edit_history_service_read ON public.reservation_edit_history FOR SELECT TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['service'::text]));


--
-- Name: reservation_status_history reservation_history_service_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reservation_history_service_read ON public.reservation_status_history FOR SELECT TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['service'::text]));


--
-- Name: reservation_status_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reservation_status_history ENABLE ROW LEVEL SECURITY;

--
-- Name: reservations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

--
-- Name: reservations reservations_developer_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reservations_developer_delete ON public.reservations FOR DELETE TO authenticated USING (public.is_current_user_developer());


--
-- Name: reservations reservations_service_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reservations_service_insert ON public.reservations FOR INSERT TO authenticated WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['service'::text]));


--
-- Name: reservations reservations_service_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reservations_service_read ON public.reservations FOR SELECT TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['service'::text]));


--
-- Name: reservations reservations_service_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reservations_service_update ON public.reservations FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['service'::text])) WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['service'::text]));


--
-- Name: stock_opname_scopes so_scope_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY so_scope_read ON public.stock_opname_scopes FOR SELECT TO authenticated USING ((private.so_allowed(division_id) OR public.is_current_user_developer()));


--
-- Name: stock_opname_state so_state_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY so_state_read ON public.stock_opname_state FOR SELECT TO authenticated USING (private.so_allowed(division_id));


--
-- Name: stock_opname_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_opname_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_opname_scopes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_opname_scopes ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_opname_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_opname_state ENABLE ROW LEVEL SECURITY;

--
-- Name: units; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

--
-- Name: units units_developer_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY units_developer_delete ON public.units FOR DELETE TO authenticated USING (public.is_current_user_developer());


--
-- Name: units units_developer_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY units_developer_insert ON public.units FOR INSERT TO authenticated WITH CHECK (public.is_current_user_developer());


--
-- Name: units units_developer_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY units_developer_update ON public.units FOR UPDATE TO authenticated USING (public.is_current_user_developer()) WITH CHECK (public.is_current_user_developer());


--
-- Name: units units_workspace_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY units_workspace_read ON public.units FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));


--
-- Name: user_monitoring_activity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_monitoring_activity ENABLE ROW LEVEL SECURITY;

--
-- Name: user_monitoring_activity user_monitoring_activity_developer_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_monitoring_activity_developer_read ON public.user_monitoring_activity FOR SELECT TO authenticated USING (( SELECT public.is_current_user_developer() AS is_current_user_developer));


--
-- Name: user_monitoring_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_monitoring_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_monitoring_sessions user_monitoring_sessions_developer_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_monitoring_sessions_developer_read ON public.user_monitoring_sessions FOR SELECT TO authenticated USING (( SELECT public.is_current_user_developer() AS is_current_user_developer));


--
-- Name: wip_recipe_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wip_recipe_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: wip_recipe_lines wip_recipe_lines_division_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wip_recipe_lines_division_manage ON public.wip_recipe_lines TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.wip_recipes r
  WHERE ((r.id = wip_recipe_lines.wip_recipe_id) AND (r.workspace_id = wip_recipe_lines.workspace_id) AND private.has_division_access(r.workspace_id, r.division_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.wip_recipes r
  WHERE ((r.id = wip_recipe_lines.wip_recipe_id) AND (r.workspace_id = wip_recipe_lines.workspace_id) AND private.has_division_access(r.workspace_id, r.division_id)))));


--
-- Name: wip_recipes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wip_recipes ENABLE ROW LEVEL SECURITY;

--
-- Name: wip_recipes wip_recipes_division_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wip_recipes_division_manage ON public.wip_recipes TO authenticated USING (private.has_division_access(workspace_id, division_id)) WITH CHECK (private.has_division_access(workspace_id, division_id));


--
-- Name: workspace_division_memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_division_memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_module_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_module_state ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_settings workspace_settings_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspace_settings_admin_delete ON public.workspace_settings FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['admin'::text]));


--
-- Name: workspace_settings workspace_settings_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspace_settings_admin_insert ON public.workspace_settings FOR INSERT TO authenticated WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['admin'::text]));


--
-- Name: workspace_settings workspace_settings_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspace_settings_admin_update ON public.workspace_settings FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY['admin'::text])) WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['admin'::text]));


--
-- Name: workspace_settings workspace_settings_member_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspace_settings_member_read ON public.workspace_settings FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));


--
-- Name: workspaces; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

--
-- Name: workspaces workspaces_developer_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspaces_developer_delete ON public.workspaces FOR DELETE TO authenticated USING (public.is_current_user_developer());


--
-- Name: workspaces workspaces_developer_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspaces_developer_insert ON public.workspaces FOR INSERT TO authenticated WITH CHECK (public.is_current_user_developer());


--
-- Name: workspaces workspaces_developer_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspaces_developer_update ON public.workspaces FOR UPDATE TO authenticated USING (public.is_current_user_developer()) WITH CHECK (public.is_current_user_developer());


--
-- Name: workspaces workspaces_member_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspaces_member_read ON public.workspaces FOR SELECT TO authenticated USING (public.is_workspace_member(id));


--
-- PostgreSQL database dump complete
--

\unrestrict 7cH7ngELNsTOPd9sm4MswPl49q43OJQhS4RgT5eIH1G7kjOIguAaePOyb5BzS9G

