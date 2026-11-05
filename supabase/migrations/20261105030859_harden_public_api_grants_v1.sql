-- Stage 1: harden API-role grants on existing public objects.
-- No application rows or table structures are changed.

-- This app has no signed-out data access. Keep all public tables unavailable to anon.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;

-- API roles should never be able to bypass RLS with TRUNCATE or create
-- references/triggers/maintenance operations on application tables.
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
ON ALL TABLES IN SCHEMA public
FROM PUBLIC, anon, authenticated;

-- No public sequences currently exist, but keep anon away from future ones
-- and prevent authenticated clients from resetting sequence values.
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE UPDATE ON ALL SEQUENCES IN SCHEMA public FROM authenticated;

-- This policy helper must remain callable by authenticated users because
-- existing RLS policies depend on it, but it is not needed by anon visitors.
REVOKE EXECUTE ON FUNCTION public.has_division_access(uuid, uuid)
FROM PUBLIC, anon;

-- Apply the same minimum-privilege posture to future objects created by postgres.
-- Future tables/functions must receive explicit grants in their migrations.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
REVOKE ALL ON TABLES FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES FROM authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
REVOKE ALL ON SEQUENCES FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
REVOKE UPDATE ON SEQUENCES FROM authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
