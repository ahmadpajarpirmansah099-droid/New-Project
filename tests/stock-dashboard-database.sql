-- Execute inside BEGIN/ROLLBACK after the dashboard migration.
do $test$
declare
  admin_id uuid; dev_id uuid; service_id uuid; test_workspace uuid := gen_random_uuid();
  test_division uuid := gen_random_uuid(); test_other_division uuid := gen_random_uuid();
  result jsonb; before_state jsonb; catalog jsonb;
begin
  select id into strict admin_id from public.profiles where role='admin' limit 1;
  select id into strict dev_id from public.profiles where role='developer' limit 1;
  select id into strict service_id from public.profiles where role='service' limit 1;
  insert into public.workspaces(id,name,created_by) values(test_workspace,'Dashboard rollback fixture',admin_id);
  insert into public.divisions(id,workspace_id,name,is_active) values
    (test_division,test_workspace,'Test Bar',true),(test_other_division,test_workspace,'Test Other',true);
  insert into public.workspace_memberships(workspace_id,user_id,role) values(test_workspace,admin_id,'division_admin');
  insert into public.workspace_division_memberships(workspace_id,user_id,division_id) values(test_workspace,admin_id,test_division);
  insert into public.stock_opname_scopes(division_id,workspace_id,enabled) values(test_division,test_workspace,true),(test_other_division,test_workspace,true);
  insert into public.stock_opname_state(division_id,payload) values(test_division,'{"periods":[],"documents":[]}');
  select payload into before_state from public.stock_opname_state where division_id=test_division;

  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  execute 'set local role authenticated';
  result := public.stock_opname_dashboard_read(test_division);
  if result->'state' is distinct from before_state then raise exception 'Admin read mismatch'; end if;
  begin
    perform public.stock_opname_dashboard_read(test_other_division);
    raise exception 'Cross-test_division read unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',dev_id::text,true);
  execute 'set local role authenticated';
  result := public.stock_opname_dashboard_read(test_division);
  if result->'state' is distinct from before_state then raise exception 'Dev read mismatch'; end if;
  begin
    perform public.stock_opname_read(test_division);
    raise exception 'Dev operational read unexpectedly allowed';
  exception when raise_exception then
    if sqlerrm <> 'Akses Stock Opname ditolak.' then raise; end if;
  end;
  execute 'reset role';

  update public.stock_opname_scopes set enabled=false where division_id=test_other_division;
  begin
    perform public.stock_opname_dashboard_read(test_other_division);
    raise exception 'Disabled test_division read unexpectedly allowed';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub',service_id::text,true);
  execute 'set local role authenticated';
  begin
    perform public.stock_opname_dashboard_read(test_division);
    raise exception 'Service read unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.stock_opname_dashboard_read(test_division);
    raise exception 'Missing identity unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('anon','public.stock_opname_dashboard_read(uuid)','execute') then raise exception 'Anonymous RPC grant'; end if;
  if has_function_privilege('anon','private.so_dashboard_view(uuid)','execute') then raise exception 'Anonymous helper grant'; end if;

  catalog := '{"active_scope_id":"fixture","masterItems":[{"id":"cup","scope_id":"fixture","status":"active","nama_barang":"Cup","satuan_dasar":"PCS","konversi_satuan":[{"unit":"PCS","factor":1}],"harga_per_satuan_dasar":2000,"is_supply":true}]}';
  result := private.so_item(catalog,'m:cup');
  if (result->>'is_supply')::boolean is distinct from true or (result->>'price')::numeric<>2000 then raise exception 'Supply snapshot mismatch'; end if;
  if (select payload from public.stock_opname_state where division_id=test_division) is distinct from before_state then raise exception 'Read changed stored state'; end if;
end;
$test$;
