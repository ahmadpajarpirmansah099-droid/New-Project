-- Internal audit triggers are executed by PostgreSQL when their table events fire.
-- They are not application RPC endpoints and should not be callable by API roles.
REVOKE EXECUTE ON FUNCTION public.log_guest_status_change()
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.log_reservation_status_change()
FROM PUBLIC, anon, authenticated;
