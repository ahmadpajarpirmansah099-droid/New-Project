-- Stored stock quantities keep the numeric value but follow the item's current
-- base unit. Once Stock Opname has an opening or posting for an item, changing
-- that unit would silently reinterpret every quantity, so reject the edit.
-- Purchase and recipe units stay editable through konversi_satuan.
CREATE OR REPLACE FUNCTION private.guard_master_item_base_unit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $function$
DECLARE
 v_key text;
 v_name text;
BEGIN
 IF NEW.division_id IS NULL
    OR NEW.module_key<>'master_data:'||NEW.division_id::text THEN
  RETURN NEW;
 END IF;
 IF NEW.payload->'masterItems' IS NOT DISTINCT FROM OLD.payload->'masterItems' THEN
  RETURN NEW;
 END IF;
 FOR v_key,v_name IN
  SELECT 'm:'||(n.value->>'id'),n.value->>'nama_barang'
  FROM jsonb_array_elements(coalesce(NEW.payload->'masterItems','[]'::jsonb)) AS n(value)
  JOIN jsonb_array_elements(coalesce(OLD.payload->'masterItems','[]'::jsonb)) AS o(value)
    ON o.value->>'id'=n.value->>'id'
  WHERE upper(btrim(coalesce(o.value->>'satuan_dasar','')))
    IS DISTINCT FROM upper(btrim(coalesce(n.value->>'satuan_dasar','')))
 LOOP
  -- Same lock as private.so_mutate, so a unit change cannot race a new stock reference.
  PERFORM pg_advisory_xact_lock(193722,1);
  IF EXISTS (
   SELECT 1 FROM public.stock_opname_state st
   WHERE st.division_id=NEW.division_id AND (
    EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(st.payload->'periods','[]'::jsonb)) AS p(value)
            WHERE p.value->'opening' ? v_key OR p.value->'physical' ? v_key OR p.value->'normalized' ? v_key)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(st.payload->'periods','[]'::jsonb)) AS p(value)
               CROSS JOIN LATERAL jsonb_array_elements(coalesce(p.value->'result','[]'::jsonb)) AS r(value)
               WHERE r.value->>'key'=v_key)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(st.payload->'documents','[]'::jsonb)) AS d(value)
               CROSS JOIN LATERAL jsonb_array_elements(coalesce(d.value->'lines','[]'::jsonb)) AS l(value)
               WHERE l.value->>'key'=v_key)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(st.payload->'documents','[]'::jsonb)) AS d(value)
               CROSS JOIN LATERAL jsonb_array_elements(coalesce(d.value->'postings','[]'::jsonb)) AS p(value)
               WHERE p.value->>'key'=v_key)
   )
  ) THEN
   RAISE EXCEPTION 'Satuan dasar % tidak dapat diubah karena barang sudah dipakai di Stock Opname. Nonaktifkan barang ini lalu buat barang baru dengan satuan yang benar.',coalesce(v_name,v_key);
  END IF;
 END LOOP;
 RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_master_item_base_unit ON public.workspace_module_state;
CREATE TRIGGER guard_master_item_base_unit
BEFORE UPDATE OF payload ON public.workspace_module_state
FOR EACH ROW EXECUTE FUNCTION private.guard_master_item_base_unit();
