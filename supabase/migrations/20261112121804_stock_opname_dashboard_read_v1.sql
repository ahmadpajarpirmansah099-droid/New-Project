-- Dashboard reads have their own access boundary. Operational write checks stay in so_allowed.
create or replace function private.so_dashboard_view(d uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
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
$function$;

revoke all on function private.so_dashboard_view(uuid) from public, anon;
grant execute on function private.so_dashboard_view(uuid) to authenticated;

create or replace function public.stock_opname_dashboard_read(division uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $function$ select private.so_dashboard_view(division); $function$;

revoke all on function public.stock_opname_dashboard_read(uuid) from public, anon;
grant execute on function public.stock_opname_dashboard_read(uuid) to authenticated;

-- Freeze classification alongside the price in new item/posting/opname snapshots.
-- Existing stored transactions and closed periods are not rewritten.
CREATE OR REPLACE FUNCTION private.so_item(c jsonb, k text, trail text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
end $function$;

