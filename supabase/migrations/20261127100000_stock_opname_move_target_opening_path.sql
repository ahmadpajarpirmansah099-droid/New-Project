-- A destination opening refreshed after a Move belongs inside periods[target_idx],
-- not under a stray top-level key. Patch only that statement so authorization,
-- locking, normalization, and retry guards stay unchanged.
DO $patch$
DECLARE
 v_definition text;
 v_old text := $old$target_s:=jsonb_set(target_s,array[target_idx::text],target_p);$old$;
 v_new text := $new$target_s:=jsonb_set(target_s,array['periods',target_idx::text],target_p);$new$;
BEGIN
 SELECT pg_get_functiondef('private.so_mutate(uuid,bigint,uuid,text,jsonb)'::regprocedure)
 INTO v_definition;
 v_definition:=replace(v_definition,E'\r\n',E'\n');
 IF position(v_old IN v_definition)=0
    OR (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old)<>1 THEN
  RAISE EXCEPTION 'Pola fungsi Stock Opname berubah; patch tujuan Move dibatalkan.';
 END IF;
 v_definition:=replace(v_definition,v_old,v_new);
 EXECUTE v_definition;
END;
$patch$;
