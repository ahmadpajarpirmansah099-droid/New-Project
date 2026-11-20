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

  -- New items introduced after the previous count must still reconcile:
  -- absent physical count means zero observed quantity, not a missing key.
  v_state:=jsonb_set(v_state,'{documents}',(v_state->'documents')||jsonb_build_array(
    jsonb_build_object('id','dec-new-item','type','receipt','start','2026-12-02','end','2026-12-02','postings',jsonb_build_array(jsonb_build_object('key','m:new','qty',5)))
  ));
  v_opening:=private.so_month_normalized_opening(
    v_state,jsonb_build_object('m:a',108),'2026-12-01','2026-12-03'
  );
  IF (v_opening->>'m:new')::numeric IS DISTINCT FROM -5 THEN
    RAISE EXCEPTION 'New item movement must be represented in normalized opening: %',v_opening;
  END IF;

  -- A legacy document straddling the month boundary must fail closed rather
  -- than disappear from both monthly ledgers.
  v_state:=jsonb_set(v_state,'{documents}',(v_state->'documents')||jsonb_build_array(
    jsonb_build_object('id','legacy-cross-month','type','sales','start','2026-11-30','end','2026-12-01','postings',jsonb_build_array(jsonb_build_object('key','m:a','qty',-1)))
  ));
  BEGIN
    PERFORM private.so_month_movements(v_state,'2026-12-01','2026-12-03');
    RAISE EXCEPTION 'Cross-month legacy document should have been rejected.';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='Cross-month legacy document should have been rejected.' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Ada transaksi lama yang melewati batas bulan.%' THEN RAISE; END IF;
  END;

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
