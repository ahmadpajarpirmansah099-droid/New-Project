-- Run after migration 20261115120000_secure_guest_correction_and_move_destination_access_v1
-- inside BEGIN, then ROLLBACK. Uses a disposable workspace and a real service profile.

DO $test$
DECLARE
  service_id uuid;
  test_workspace uuid := gen_random_uuid();
  v_guest_id uuid := gen_random_uuid();
  original_updated_at timestamptz;
  result jsonb;
  history_count integer;
  history_changed_at timestamptz;
BEGIN
  SELECT id INTO STRICT service_id FROM public.profiles WHERE role = 'service' LIMIT 1;

  INSERT INTO public.workspaces(id, name, created_by)
  VALUES (test_workspace, 'Guest correction rollback fixture', service_id);
  INSERT INTO public.workspace_memberships(workspace_id, user_id, role)
  VALUES (test_workspace, service_id, 'service');

  INSERT INTO public.guests(id, workspace_id, ticket, service_date, guest_name, pack, phone, status, created_by)
  VALUES (
    v_guest_id, test_workspace, 'WL-TEST-001',
    (now() AT TIME ZONE 'Asia/Jakarta')::date,
    'Tamu Awal', 2, '081111111111', 'waiting', service_id
  )
  RETURNING updated_at INTO original_updated_at;

  PERFORM set_config('request.jwt.claim.sub', service_id::text, true);
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
  WHERE h.guest_id = v_guest_id AND h.label = 'Dikoreksi' AND h.changed_by = service_id;
  IF history_count <> 1 THEN
    RAISE EXCEPTION 'Correction audit was not committed exactly once';
  END IF;
  IF history_changed_at IS DISTINCT FROM (result->'audit'->>'changed_at')::timestamptz THEN
    RAISE EXCEPTION 'Correction RPC returned a different audit timestamp than the stored row';
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
    VALUES (test_workspace, v_guest_id, 'waiting', 'Palsu', service_id);
    RAISE EXCEPTION 'Authenticated direct history insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  EXECUTE 'RESET ROLE';

  IF has_function_privilege('anon', 'public.correct_guest_record(uuid,text,integer,text,text,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous access to correction RPC is granted';
  END IF;
END;
$test$;
