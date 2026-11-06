-- The ALL policy already grants the same read scope:
-- developers may read rows with or without division_id, while staff must
-- have access to the assigned division. The helper includes developer access.
DROP POLICY module_state_scoped_read ON public.workspace_module_state;
