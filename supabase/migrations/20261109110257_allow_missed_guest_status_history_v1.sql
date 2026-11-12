-- Keep guest status history aligned with the statuses written by the
-- automatic end-of-day waitlist close function.
-- No guest records are deleted or access policies are changed.

alter table public.guest_status_history
  drop constraint if exists guest_status_history_status_check;

alter table public.guest_status_history
  add constraint guest_status_history_status_check
  check (status = any (array[
    'waiting',
    'called',
    'seated',
    'done',
    'missed',
    'cancelled'
  ]::text[]));
