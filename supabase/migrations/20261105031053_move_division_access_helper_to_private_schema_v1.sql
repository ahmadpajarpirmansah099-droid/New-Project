-- Keep the SECURITY DEFINER membership helper outside the exposed Data API schema.
-- Existing RLS policies reference the function by object identity; ALTER FUNCTION
-- SET SCHEMA preserves those dependencies without rewriting policy expressions.

CREATE SCHEMA IF NOT EXISTS private AUTHORIZATION postgres;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

ALTER FUNCTION public.has_division_access(uuid, uuid) SET SCHEMA private;

-- The function body already schema-qualifies all referenced objects.
-- An empty search_path prevents object-shadowing attacks.
ALTER FUNCTION private.has_division_access(uuid, uuid) SET search_path = '';

REVOKE EXECUTE ON FUNCTION private.has_division_access(uuid, uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.has_division_access(uuid, uuid)
TO authenticated;

-- Private helpers added in future migrations must be explicitly granted.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private
REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
