-- ARCHIVE ONLY: applied to New-Project Supabase on 2026-11-11.
-- Supabase migration version: 20261111072028
-- Name: stock_opname_next_day_opening_and_lj_bar_date_fix_20261111
-- Do not re-run as an ordinary app migration. This one-off repair checks revision 18.
-- No stock quantity or transaction document is modified.
DO $fix$
DECLARE
  definition text;
  before_activate text := $oldact$ps:=ps||jsonb_build_array(jsonb_build_object('id',request,'start',p->>'end','status','active','opening',p->'physical','opening_catalog',p->'catalog','previous_id',p->>'id','created_at',now()));$oldact$;
  after_activate text := $newact$ps:=ps||jsonb_build_array(jsonb_build_object('id',request,'start',((p->>'end')::date+1)::text,'status','active','opening',p->'physical','opening_catalog',p->'catalog','previous_id',p->>'id','created_at',now()));$newact$;
  before_reactivate text := $oldreact$p:=p||jsonb_build_object('status','active','opening',ps->(pi-1)->'physical','opening_catalog',ps->(pi-1)->'catalog');$oldreact$;
  after_reactivate text := $newreact$if exists(select 1 from jsonb_array_elements(coalesce(docs,'[]'::jsonb)) v where v->>'period_id'=p->>'id' and coalesce(v->>'void','false')<>'true' and (v->>'start')::date<=(ps->(pi-1)->>'end')::date) then raise exception 'Transaksi periode berikutnya mendahului tanggal Stock Awal. Periksa sebelum mengonfirmasi.';end if;
  p:=p||jsonb_build_object('status','active','start',((ps->(pi-1)->>'end')::date+1)::text,'opening',ps->(pi-1)->'physical','opening_catalog',ps->(pi-1)->'catalog');$newreact$;
  record_state record;
  old_period jsonb;
  active_period jsonb;
BEGIN
  SELECT pg_get_functiondef('private.so_mutate(uuid,bigint,uuid,text,jsonb)'::regprocedure) INTO definition;
  IF position(before_activate IN definition)=0 OR position(before_reactivate IN definition)=0 THEN
    RAISE EXCEPTION 'Stored function changed unexpectedly. No changes applied.';
  END IF;
  EXECUTE replace(replace(definition,before_activate,after_activate),before_reactivate,after_reactivate);

  SELECT s.division_id,s.payload,s.revision INTO record_state
  FROM public.stock_opname_state s
  JOIN public.divisions d ON d.id=s.division_id
  JOIN public.workspaces w ON w.id=d.workspace_id
  WHERE d.name='Bar' AND w.name='Lazy Jennie'
  FOR UPDATE OF s;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exact outlet/division not found'; END IF;
  IF record_state.revision<>18 OR jsonb_array_length(record_state.payload->'periods')<>2 THEN
    RAISE EXCEPTION 'Stock Opname state changed; no data correction applied';
  END IF;
  old_period:=record_state.payload->'periods'->0;
  active_period:=record_state.payload->'periods'->1;
  IF old_period->>'end'<>'2026-11-08' OR old_period->>'status'<>'closed'
    OR active_period->>'start'<>'2026-11-08' OR active_period->>'status'<>'active'
    OR active_period->>'previous_id' IS DISTINCT FROM old_period->>'id'
    OR old_period->'physical' IS DISTINCT FROM active_period->'opening'
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(record_state.payload->'documents','[]'::jsonb)) d WHERE d->>'period_id'=active_period->>'id') THEN
      RAISE EXCEPTION 'Current period no longer matches the verified safe conditions';
  END IF;
  UPDATE public.stock_opname_state
  SET payload=jsonb_set(record_state.payload,'{periods,1,start}',to_jsonb('2026-11-09'::text),false),
      revision=revision+1, updated_at=now()
  WHERE division_id=record_state.division_id AND revision=18;
  IF NOT FOUND THEN RAISE EXCEPTION 'Concurrent Stock Opname update detected'; END IF;
END $fix$;
