-- Prevent authenticated users from inserting fabricated Guest Operations history.
-- The history tables remain readable under their existing workspace-scoped policies.
-- Only the parent-record status triggers may append history for authenticated users.

ALTER FUNCTION public.log_guest_status_change() SECURITY DEFINER;
ALTER FUNCTION public.log_guest_status_change() SET search_path = '';

ALTER FUNCTION public.log_reservation_status_change() SECURITY DEFINER;
ALTER FUNCTION public.log_reservation_status_change() SET search_path = '';

REVOKE INSERT ON TABLE public.guest_status_history FROM authenticated;
REVOKE INSERT ON TABLE public.reservation_status_history FROM authenticated;

DROP POLICY IF EXISTS guest_history_service_insert
  ON public.guest_status_history;

DROP POLICY IF EXISTS reservation_history_service_insert
  ON public.reservation_status_history;

COMMENT ON FUNCTION public.log_guest_status_change() IS
  'Internal AFTER trigger. Runs as owner with an empty search_path so authenticated users cannot insert fabricated history rows directly.';

COMMENT ON FUNCTION public.log_reservation_status_change() IS
  'Internal AFTER trigger. Runs as owner with an empty search_path so authenticated users cannot insert fabricated history rows directly.';
