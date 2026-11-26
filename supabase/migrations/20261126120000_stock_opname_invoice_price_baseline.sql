-- Keep the pre-invoice price across edits and cancellations in either order.
-- Patch only the affected statements; retain authorization, locks, and retry guards.
DO $patch$
DECLARE
 v_definition text;
 i integer;
 v_old text[] := ARRAY[
  $old$target_idx int;$old$,
  $old$c:=private.so_catalog(d);$old$,
  $old$select value,ordinality::int-1 into old_doc,idx from jsonb_array_elements(docs) with ordinality where value->>'id'=docid;$old$,
  $old$for k in select distinct v->>'key' from jsonb_array_elements(coalesce(doc->'lines','[]')||coalesce(old_doc->'lines','[]')) v loop$old$,
  $old$select v into r from jsonb_array_elements(old_doc->'catalog_snapshot'->'masterItems') v where v->>'id'=substr(k,3);
      price:=coalesce((r->>'harga_beli_terakhir_per_satuan_dasar')::numeric,(r->>'harga_per_satuan_dasar')::numeric);$old$,
  $old$s:=jsonb_build_object('periods',ps,'documents',docs);$old$
 ];
 v_new text[] := ARRAY[
  $new$target_idx int; invoice_base_prices jsonb;$new$,
  $new$c:=private.so_catalog(d);
  invoice_base_prices:=coalesce(s->'invoice_base_prices','{}'::jsonb);$new$,
  $new$select value,ordinality::int-1 into old_doc,idx from jsonb_array_elements(docs) with ordinality where value->>'id'=docid;
    if coalesce(old_doc->>'type',input->>'type')='receipt' then
     perform 1 from public.workspace_module_state where division_id=d and module_key='master_data:'||d for update;
     select payload into b from public.workspace_module_state where division_id=d and module_key='master_data:'||d;
     for k in select distinct v->>'key'
      from jsonb_array_elements(coalesce(old_doc->'lines','[]')||coalesce(input->'lines','[]')) v
      where nullif(v->>'invoice_total','') is not null
     loop
      if exists(select 1 from jsonb_array_elements(docs) v
       where v->>'type'='receipt' and coalesce(v->>'void','false')<>'true'
       and exists(select 1 from jsonb_array_elements(v->'lines') z where z->>'key'=k and nullif(z->>'invoice_total','') is not null)
      ) then
       if invoice_base_prices ? k then continue; end if;
       -- shortcut: legacy recovery needs the original invoice lines and snapshot; verify histories whose lines were already removed.
       select items.item into r
       from jsonb_array_elements(docs) with ordinality as history(v,ord)
       cross join lateral jsonb_array_elements(coalesce(v->'catalog_snapshot'->'masterItems','[]'::jsonb)) as items(item)
       where v->>'type'='receipt' and items.item->>'id'=substr(k,3)
        and exists(select 1 from jsonb_array_elements(v->'lines') z where z->>'key'=k and nullif(z->>'invoice_total','') is not null)
       order by ord limit 1;
      else
       -- A new invoice cycle starts from the latest locked Master Barang price.
       select value into r from jsonb_array_elements(b->'masterItems') value where value->>'id'=substr(k,3);
      end if;
      price:=coalesce((r->>'harga_beli_terakhir_per_satuan_dasar')::numeric,(r->>'harga_per_satuan_dasar')::numeric);
      if price is null then raise exception 'Harga awal invoice tidak tersedia. Hubungi Developer.'; end if;
      invoice_base_prices:=jsonb_set(invoice_base_prices,array[k],to_jsonb(price),true);
     end loop;
    end if;$new$,
  $new$for k in select distinct v->>'key' from jsonb_array_elements(coalesce(doc->'lines','[]')||coalesce(old_doc->'lines','[]')) v where nullif(v->>'invoice_total','') is not null loop$new$,
  $new$price:=(invoice_base_prices->>k)::numeric;$new$,
  $new$s:=jsonb_build_object('periods',ps,'documents',docs,'invoice_base_prices',invoice_base_prices);$new$
 ];
BEGIN
 SELECT pg_get_functiondef('private.so_mutate(uuid,bigint,uuid,text,jsonb)'::regprocedure)
 INTO v_definition;
 v_definition:=replace(v_definition,E'\r\n',E'\n');
 FOR i IN 1..array_length(v_old,1) LOOP
  v_old[i]:=replace(v_old[i],E'\r\n',E'\n');
  IF position(v_old[i] IN v_definition)=0
     OR (length(v_definition)-length(replace(v_definition,v_old[i],'')))/length(v_old[i])<>1 THEN
   RAISE EXCEPTION 'Pola fungsi Stock Opname berubah pada bagian %; patch invoice dibatalkan.',i;
  END IF;
  v_definition:=replace(v_definition,v_old[i],v_new[i]);
 END LOOP;
 EXECUTE v_definition;
END;
$patch$;
