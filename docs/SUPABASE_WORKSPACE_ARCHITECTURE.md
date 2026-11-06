# Supabase Workspace Architecture

This project uses one Supabase workspace boundary for all business modules.

## Current workspace and roles

- `developer`: global access across workspaces.
- `admin`: manage data and settings inside assigned workspace.
- `service`: operate Guest Operations inside assigned workspace; read-only access to master data.

Workspace membership is stored in `workspace_memberships`. Do not authorize users by email in frontend code. The authenticated profile and membership are verified from Supabase.

## Frontend connection

- Use `window.AppAuth.getClient()` for the authenticated Supabase client.
- Use `window.AppAuth.getContext()` for the verified user, role, and `workspaceId`.
- Do not put a service-role key or private credentials in frontend files.
- Business data must not be stored as the source of truth in localStorage.

## Existing module storage

- Guest Operations: `guests`, `guest_status_history`, `reservations`, `reservation_status_history`, and atomic daily counters.
- Guest Operations preferences: `workspace_settings`.
- Master Barang, WIP, and Menu: currently synchronized through the `workspace_module_state` record with module key `master_data`. This keeps the existing UI compatible while the structured-table adapter is developed.
- The normalized master-data tables (`divisions`, `units`, `items`, `item_unit_conversions`, `wip_recipes`, `wip_recipe_lines`, `menus`, `menu_recipe_lines`) are workspace-scoped and ready for a later normalized adapter.

## Rules for every new module

1. Add a `workspace_id uuid not null references public.workspaces(id)` to every business-data table.
2. Enable RLS on every exposed table.
3. Use `is_workspace_member(workspace_id)` for workspace reads.
4. Use `has_workspace_role(workspace_id, array['admin'])` for configuration/master-data writes.
5. Use `has_workspace_role(workspace_id, array['admin','service'])` for operational writes where Service is allowed.
6. Keep history/audit rows append-only for ordinary users; do not let Service delete records.
7. Generate sequential ticket or reference numbers with database RPCs, not browser counters.
8. Add the module to the authenticated initialization flow and use the verified workspace ID.
9. Keep all new UI icons from Lucide and preserve the mobile-first layout.

## Empty starting state

Business tables and module payloads start empty. The developer profile, primary workspace, and developer membership are setup records and must remain.
