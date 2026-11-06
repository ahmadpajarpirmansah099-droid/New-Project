drop policy if exists divisions_developer_manage on public.divisions;
create policy divisions_developer_insert
  on public.divisions for insert to authenticated
  with check (public.is_current_user_developer());
create policy divisions_developer_update
  on public.divisions for update to authenticated
  using (public.is_current_user_developer())
  with check (public.is_current_user_developer());
create policy divisions_developer_delete
  on public.divisions for delete to authenticated
  using (public.is_current_user_developer());

drop policy if exists profiles_developer_manage on public.profiles;
drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own
  on public.profiles for select to authenticated
  using ((id = (select auth.uid())) or (select public.is_current_user_developer()));
create policy profiles_developer_insert
  on public.profiles for insert to authenticated
  with check (public.is_current_user_developer());
create policy profiles_developer_update
  on public.profiles for update to authenticated
  using (public.is_current_user_developer())
  with check (public.is_current_user_developer());
create policy profiles_developer_delete
  on public.profiles for delete to authenticated
  using (public.is_current_user_developer());

drop policy if exists units_developer_manage on public.units;
create policy units_developer_insert
  on public.units for insert to authenticated
  with check (public.is_current_user_developer());
create policy units_developer_update
  on public.units for update to authenticated
  using (public.is_current_user_developer())
  with check (public.is_current_user_developer());
create policy units_developer_delete
  on public.units for delete to authenticated
  using (public.is_current_user_developer());

drop policy if exists division_memberships_developer_manage on public.workspace_division_memberships;
create policy division_memberships_developer_insert
  on public.workspace_division_memberships for insert to authenticated
  with check (public.is_current_user_developer());
create policy division_memberships_developer_update
  on public.workspace_division_memberships for update to authenticated
  using (public.is_current_user_developer())
  with check (public.is_current_user_developer());
create policy division_memberships_developer_delete
  on public.workspace_division_memberships for delete to authenticated
  using (public.is_current_user_developer());

drop policy if exists memberships_developer_manage on public.workspace_memberships;
create policy memberships_developer_insert
  on public.workspace_memberships for insert to authenticated
  with check (public.is_current_user_developer());
create policy memberships_developer_update
  on public.workspace_memberships for update to authenticated
  using (public.is_current_user_developer())
  with check (public.is_current_user_developer());
create policy memberships_developer_delete
  on public.workspace_memberships for delete to authenticated
  using (public.is_current_user_developer());

drop policy if exists workspace_settings_admin_manage on public.workspace_settings;
create policy workspace_settings_admin_insert
  on public.workspace_settings for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['admin']::text[]));
create policy workspace_settings_admin_update
  on public.workspace_settings for update to authenticated
  using (public.has_workspace_role(workspace_id, array['admin']::text[]))
  with check (public.has_workspace_role(workspace_id, array['admin']::text[]));
create policy workspace_settings_admin_delete
  on public.workspace_settings for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['admin']::text[]));

drop policy if exists workspaces_developer_manage on public.workspaces;
create policy workspaces_developer_insert
  on public.workspaces for insert to authenticated
  with check (public.is_current_user_developer());
create policy workspaces_developer_update
  on public.workspaces for update to authenticated
  using (public.is_current_user_developer())
  with check (public.is_current_user_developer());
create policy workspaces_developer_delete
  on public.workspaces for delete to authenticated
  using (public.is_current_user_developer());
