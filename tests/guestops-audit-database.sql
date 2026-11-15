-- Run after migration 20261115120000_secure_guest_correction_and_move_destination_access_v1
-- inside BEGIN, then ROLLBACK. Uses a disposable workspace and a developer profile
-- with service workspace membership, so both RLS permissions are covered.

DO $test$
DECLARE
  actor_id uuid;
  test_workspace uuid := gen_random_uuid();
  v_guest_id uuid := gen_random_uuid();
  original_updated_at timestamptz;
  result jsonb;
  history_count integer;
  history_changed_at timestamptz;
  v_reservation_id uuid := gen_random_uuid();
  v_batch_guest_id uuid := gen_random_uuid();
  v_reservation_updated_at timestamptz;
  v_reservation_created_at timestamptz;
  v_initial_reservation_updated_at timestamptz;
  v_batch_guest_updated_at timestamptz;
  batch_guests jsonb;
  batch_reservations jsonb;
  retry_result jsonb;
  v_table_label text;
  v_guest_phone text;
  batch_result jsonb;
  v_saved_settings jsonb;
  v_requested_settings jsonb := jsonb_build_object('seatingDurationMinutes', 120);
BEGIN
  SELECT id INTO STRICT actor_id FROM public.profiles WHERE role = 'developer' LIMIT 1;

  INSERT INTO public.workspaces(id, name, created_by)
  VALUES (test_workspace, 'Guest correction rollback fixture', actor_id);
  INSERT INTO public.workspace_memberships(workspace_id, user_id, role)
  VALUES (test_workspace, actor_id, 'service');

  INSERT INTO public.guests(id, workspace_id, ticket, service_date, guest_name, pack, phone, status, created_by)
  VALUES (
    v_guest_id, test_workspace, 'WL-TEST-001',
    (now() AT TIME ZONE 'Asia/Jakarta')::date,
    'Tamu Awal', 2, '081111111111', 'waiting', actor_id
  )
  RETURNING updated_at INTO original_updated_at;

  INSERT INTO public.reservations(
    id, workspace_id, code, reservation_date, reservation_time, guest_name, pack, status, created_by
  ) VALUES (
    v_reservation_id, test_workspace, 'RSV-TEST-001',
    (now() AT TIME ZONE 'Asia/Jakarta')::date, '19:00',
    'Tamu Reservasi', 2, 'pending', actor_id
  )
  RETURNING created_at, updated_at INTO v_reservation_created_at, v_reservation_updated_at;
  v_initial_reservation_updated_at := v_reservation_updated_at;

  PERFORM set_config('request.jwt.claim.sub', actor_id::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  result := public.correct_guest_record(
    v_guest_id, 'Tamu Koreksi', 3, '082222222222', 'Salah input',
    original_updated_at
  );

  IF result->'guest'->>'guest_name' IS DISTINCT FROM 'Tamu Koreksi'
     OR result->'guest'->>'pack' IS DISTINCT FROM '3'
     OR result->'audit'->>'label' IS DISTINCT FROM 'Dikoreksi'
     OR result->'audit'->>'reason' IS DISTINCT FROM 'Salah input' THEN
    RAISE EXCEPTION 'Correction RPC returned unexpected data';
  END IF;

  SELECT count(*), max(h.changed_at) INTO history_count, history_changed_at
  FROM public.guest_status_history AS h
  WHERE h.guest_id = v_guest_id AND h.label = 'Dikoreksi' AND h.changed_by = actor_id;
  IF history_count <> 1 THEN
    RAISE EXCEPTION 'Correction audit was not committed exactly once';
  END IF;
  IF history_changed_at IS DISTINCT FROM (result->'audit'->>'changed_at')::timestamptz THEN
    RAISE EXCEPTION 'Correction RPC returned a different audit timestamp than the stored row';
  END IF;

  -- Seating a reservation must update its row and insert the guest atomically.
  batch_guests := jsonb_build_array(jsonb_build_object(
    'id', v_batch_guest_id,
    'workspace_id', test_workspace,
    'reservation_id', v_reservation_id,
    'ticket', 'WL-TEST-002',
    'service_date', (now() AT TIME ZONE 'Asia/Jakarta')::date,
    'guest_name', 'Tamu Duduk',
    'pack', 2,
    'phone', '081234567890',
    'status', 'seated',
    'created_at', now(),
    'seated_at', now(),
    'resolved_at', now(),
    'expected_updated_at', NULL
  ));
  batch_reservations := jsonb_build_array(jsonb_build_object(
    'id', v_reservation_id,
    'workspace_id', test_workspace,
    'code', 'RSV-TEST-001',
    'reservation_date', (now() AT TIME ZONE 'Asia/Jakarta')::date,
    'reservation_time', '19:00:00',
    'guest_name', 'Tamu Reservasi',
    'pack', 2,
    'phone', NULL,
    'smoking', NULL,
    'note', NULL,
    'table_label', 'Meja 1',
    'status', 'seated',
    'created_at', v_reservation_created_at,
    'expected_updated_at', v_initial_reservation_updated_at
  ));

  batch_result := public.save_guest_operations(test_workspace, batch_guests, batch_reservations, v_requested_settings);
  v_batch_guest_updated_at := (batch_result->'guests'->0->>'updated_at')::timestamptz;
  v_reservation_updated_at := (batch_result->'reservations'->0->>'updated_at')::timestamptz;

  -- Replaying the exact request after a lost response must not duplicate rows or audit events.
  retry_result := public.save_guest_operations(test_workspace, batch_guests, batch_reservations, v_requested_settings);
  IF retry_result IS DISTINCT FROM batch_result THEN
    RAISE EXCEPTION 'Identical Guest Operations retry did not return the original versions';
  END IF;
  SELECT setting_value INTO v_saved_settings
  FROM public.workspace_settings
  WHERE workspace_id = test_workspace AND setting_key = 'guest_operations';
  IF v_saved_settings IS DISTINCT FROM v_requested_settings THEN
    RAISE EXCEPTION 'Guest Operations settings were not saved with the batch';
  END IF;

  -- A non-object and a missing setting must both be rejected.
  BEGIN
    PERFORM public.save_guest_operations(
      test_workspace, '[]'::jsonb, '[]'::jsonb, '"invalid"'::jsonb
    );
    RAISE EXCEPTION 'Non-object Guest Operations settings were accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Pengaturan Guest Operations tidak valid.' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.save_guest_operations(
      test_workspace, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb
    );
    RAISE EXCEPTION 'Missing Guest Operations settings were accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Pengaturan Guest Operations tidak valid.' THEN RAISE; END IF;
  END;

  SELECT setting_value INTO v_saved_settings
  FROM public.workspace_settings
  WHERE workspace_id = test_workspace AND setting_key = 'guest_operations';
  IF v_saved_settings IS DISTINCT FROM v_requested_settings THEN
    RAISE EXCEPTION 'Invalid settings changed the saved Guest Operations settings';
  END IF;

  SELECT count(*) INTO history_count
  FROM public.guest_status_history
  WHERE guest_id = v_batch_guest_id AND label = 'Terdaftar';
  IF history_count <> 1 THEN
    RAISE EXCEPTION 'Guest insert retry duplicated its audit history';
  END IF;
  SELECT count(*) INTO history_count
  FROM public.reservation_status_history
  WHERE reservation_id = v_reservation_id AND label = 'Duduk';
  IF history_count <> 1 THEN
    RAISE EXCEPTION 'Reservation retry duplicated its status history';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.guests
    WHERE id = v_batch_guest_id AND reservation_id = v_reservation_id AND status = 'seated'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.reservations
    WHERE id = v_reservation_id AND status = 'seated' AND table_label = 'Meja 1'
  ) THEN
    RAISE EXCEPTION 'Atomic reservation seating batch did not save both rows';
  END IF;

  -- Simulate a second device changing the guest after this client loaded it.
  EXECUTE 'RESET ROLE';
  UPDATE public.guests
  SET phone = '089999999999', updated_at = pg_catalog.clock_timestamp()
  WHERE id = v_batch_guest_id;
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    PERFORM public.save_guest_operations(
      test_workspace,
      jsonb_build_array(jsonb_build_object(
        'id', v_batch_guest_id,
        'workspace_id', test_workspace,
        'reservation_id', v_reservation_id,
        'ticket', 'WL-TEST-002',
        'service_date', (now() AT TIME ZONE 'Asia/Jakarta')::date,
        'guest_name', 'Tamu Duduk',
        'pack', 2,
        'phone', '081234567890',
        'status', 'seated',
        'created_at', now(),
        'seated_at', now(),
        'resolved_at', now(),
        'expected_updated_at', v_batch_guest_updated_at
      )),
      jsonb_build_array(jsonb_build_object(
        'id', v_reservation_id,
        'workspace_id', test_workspace,
        'code', 'RSV-TEST-001',
        'reservation_date', (now() AT TIME ZONE 'Asia/Jakarta')::date,
        'reservation_time', '19:00:00',
        'guest_name', 'Tamu Reservasi',
        'pack', 2,
        'phone', NULL,
        'smoking', NULL,
        'note', NULL,
        'table_label', 'Meja 2',
        'status', 'seated',
        'created_at', now(),
        'expected_updated_at', v_reservation_updated_at
      )),
      jsonb_build_object('seatingDurationMinutes', 180)
    );
    RAISE EXCEPTION 'Stale Guest Operations batch unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Data tamu sudah berubah%' THEN RAISE; END IF;
  END;

  SELECT table_label INTO v_table_label FROM public.reservations WHERE id = v_reservation_id;
  SELECT phone INTO v_guest_phone FROM public.guests WHERE id = v_batch_guest_id;
  SELECT setting_value INTO v_saved_settings
  FROM public.workspace_settings
  WHERE workspace_id = test_workspace AND setting_key = 'guest_operations';
  IF v_table_label IS DISTINCT FROM 'Meja 1'
     OR v_guest_phone IS DISTINCT FROM '089999999999'
     OR v_saved_settings IS DISTINCT FROM v_requested_settings THEN
    RAISE EXCEPTION 'Stale Guest Operations batch partially committed';
  END IF;

  BEGIN
    PERFORM public.correct_guest_record(
      v_guest_id, 'Stale Edit', 4, '083333333333', 'Stale request',
      original_updated_at
    );
    RAISE EXCEPTION 'Stale correction unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Data tamu sudah berubah%' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO public.guest_status_history(workspace_id, guest_id, status, label, changed_by)
    VALUES (test_workspace, v_guest_id, 'waiting', 'Palsu', actor_id);
    RAISE EXCEPTION 'Authenticated direct history insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  EXECUTE 'RESET ROLE';

  IF has_function_privilege('anon', 'public.correct_guest_record(uuid,text,integer,text,text,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous access to correction RPC is granted';
  END IF;
  IF has_function_privilege('anon', 'public.save_guest_operations(uuid,jsonb,jsonb,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous access to Guest Operations batch RPC is granted';
  END IF;
END;
$test$;
