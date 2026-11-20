-- Pure calendar-month accounting primitives.
-- These helpers are intentionally not wired into the mutation RPC yet; the
-- legacy period state machine must be migrated as one coherent follow-up.
CREATE OR REPLACE FUNCTION private.so_month_movements(
  s jsonb,
  month_start date,
  cutoff date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  v_cutoff date := coalesce(cutoff, (month_start + interval '1 month - 1 day')::date);
  v_result jsonb;
BEGIN
  IF month_start IS NULL OR month_start<>date_trunc('month',month_start)::date
     OR v_cutoff<month_start
     OR v_cutoff>=(month_start + interval '1 month')::date THEN
    RAISE EXCEPTION 'Batas bulan Stock Opname tidak valid.';
  END IF;

  SELECT coalesce(jsonb_object_agg(t.key,to_jsonb(t.qty)),'{}'::jsonb)
    INTO v_result
  FROM (
    SELECT posting->>'key' AS key, sum((posting->>'qty')::numeric) AS qty
    FROM jsonb_array_elements(coalesce(s->'documents','[]'::jsonb)) AS doc
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(doc->'postings','[]'::jsonb)) AS posting
    WHERE coalesce(doc->>'void','false')<>'true'
      AND (doc->>'start')::date>=month_start
      AND (doc->>'end')::date<=v_cutoff
      AND (doc->>'end')::date>=(doc->>'start')::date
    GROUP BY posting->>'key'
  ) AS t;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION private.so_month_normalized_opening(
  s jsonb,
  physical jsonb,
  next_month_start date,
  physical_count_date date
) RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  v_movements jsonb;
  v_result jsonb;
  v_key text;
  v_qty numeric;
BEGIN
  IF next_month_start IS NULL
     OR next_month_start<>date_trunc('month',next_month_start)::date
     OR physical_count_date IS NULL
     OR physical_count_date<next_month_start
     OR physical_count_date>=(next_month_start + interval '1 month')::date THEN
    RAISE EXCEPTION 'Tanggal hitung fisik untuk normalisasi Stock Awal tidak valid.';
  END IF;

  v_movements:=private.so_month_movements(s,next_month_start,physical_count_date);
  v_result:='{}'::jsonb;
  FOR v_key,v_qty IN
    SELECT key,(value#>>'{}')::numeric
    FROM jsonb_each(coalesce(physical,'{}'::jsonb))
  LOOP
    v_result:=jsonb_set(
      v_result,
      ARRAY[v_key],
      to_jsonb(v_qty-coalesce((v_movements->>v_key)::numeric,0)),
      true
    );
  END LOOP;
  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION private.so_month_movements(jsonb,date,date)
  IS 'Net non-void postings owned by a calendar month through an inclusive cutoff date.';
COMMENT ON FUNCTION private.so_month_normalized_opening(jsonb,jsonb,date,date)
  IS 'Derives a calendar-month opening from physical count by subtracting movements through the physical count date.';
