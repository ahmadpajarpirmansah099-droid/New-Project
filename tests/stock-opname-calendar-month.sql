-- Run after calendar-month helper migration. No database rows are written.
DO $test$
DECLARE
  v_state jsonb := jsonb_build_object('documents',jsonb_build_array(
    jsonb_build_object('id','dec-receipt','type','receipt','start','2026-12-01','end','2026-12-01','postings',jsonb_build_array(jsonb_build_object('key','m:a','qty',10))),
    jsonb_build_object('id','dec-sales','type','sales','start','2026-12-03','end','2026-12-03','postings',jsonb_build_array(jsonb_build_object('key','m:a','qty',-2))),
    jsonb_build_object('id','dec-void','type','expense','start','2026-12-03','end','2026-12-03','void',true,'postings',jsonb_build_array(jsonb_build_object('key','m:a','qty',-99))),
    jsonb_build_object('id','jan-receipt','type','receipt','start','2027-01-01','end','2027-01-01','postings',jsonb_build_array(jsonb_build_object('key','m:a','qty',50)))
  ));
  v_movements jsonb;
  v_opening jsonb;
  v_balance jsonb;
BEGIN
  v_movements:=private.so_month_movements(v_state,'2026-12-01','2026-12-03');
  IF (v_movements->>'m:a')::numeric IS DISTINCT FROM 8 THEN
    RAISE EXCEPTION 'December movement cutoff/void filtering failed: %',v_movements;
  END IF;

  v_opening:=private.so_month_normalized_opening(
    v_state,
    jsonb_build_object('m:a',108),
    '2026-12-01',
    '2026-12-03'
  );
  IF (v_opening->>'m:a')::numeric IS DISTINCT FROM 100 THEN
    RAISE EXCEPTION 'Normalized opening must subtract Dec 1–3 movements: %',v_opening;
  END IF;

  v_movements:=private.so_month_movements(v_state,'2026-12-01','2026-12-31');
  v_balance:=jsonb_build_object('m:a',(v_opening->>'m:a')::numeric+(v_movements->>'m:a')::numeric);
  IF (v_balance->>'m:a')::numeric IS DISTINCT FROM 108 THEN
    RAISE EXCEPTION 'December movement must be counted exactly once: %',v_balance;
  END IF;


  -- Editing a movement before the physical count must deterministically
  -- recalculate from the saved physical count, not adjust the old opening.
  v_state:=jsonb_set(v_state,'{documents,0,postings,0,qty}','12'::jsonb);
  v_opening:=private.so_month_normalized_opening(
    v_state,jsonb_build_object('m:a',108),'2026-12-01','2026-12-03'
  );
  IF (v_opening->>'m:a')::numeric IS DISTINCT FROM 98 THEN
    RAISE EXCEPTION 'Edited pre-count movement must recalculate opening from physical count: %',v_opening;
  END IF;

  -- Voiding that same movement removes it from the normalization window.
  v_state:=jsonb_set(v_state,'{documents,0,void}','true'::jsonb);
  v_opening:=private.so_month_normalized_opening(
    v_state,jsonb_build_object('m:a',108),'2026-12-01','2026-12-03'
  );
  IF (v_opening->>'m:a')::numeric IS DISTINCT FROM 110 THEN
    RAISE EXCEPTION 'Voided pre-count movement must be excluded from opening: %',v_opening;
  END IF;

  RAISE NOTICE 'Calendar-month accounting helper checks passed.';
END;
$test$;
