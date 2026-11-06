-- The two indexes have identical definitions and neither backs a constraint.
-- Keep divisions_workspace_name_uidx; remove only the redundant duplicate.
DROP INDEX public.divisions_workspace_name_unique;
