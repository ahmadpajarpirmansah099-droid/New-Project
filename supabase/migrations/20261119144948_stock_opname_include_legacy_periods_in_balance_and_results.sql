-- Preserve transactions from the two removed Stock Opname periods when rebuilding
-- the first opening balance. Transaction rows and their original period IDs stay intact.

CREATE OR REPLACE FUNCTION private.so_balances(s jsonb, p jsonb, cutoff date DEFAULT NULL::date)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
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
$function$;

-- Update the Stock Opname closing-result movement breakdown using the same
-- legacy period IDs. Patch the existing function body without rewriting its
-- other transaction safeguards and transfer logic.
DO $patch$
DECLARE
 v_definition text;
 v_old text := 'where v->>''period_id''=pid and coalesce(v->>''void'',''false'')<>''true'' and z->>''key''=k group by 1) totals;';
 v_new text := 'where (v->>''period_id''=pid or coalesce(p->''legacy_period_ids'',''[]''::jsonb) ? (v->>''period_id'')) and coalesce(v->>''void'',''false'')<>''true'' and z->>''key''=k group by 1) totals;';
BEGIN
 SELECT pg_get_functiondef('private.so_mutate(uuid,bigint,uuid,text,jsonb)'::regprocedure)
 INTO v_definition;
 IF position(v_old IN v_definition)=0
    OR (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old)<>1 THEN
  RAISE EXCEPTION 'Pola ringkasan movement Stock Opname berubah; patch dibatalkan.';
 END IF;
 v_definition:=replace(v_definition,v_old,v_new);
 EXECUTE v_definition;
END;
$patch$;