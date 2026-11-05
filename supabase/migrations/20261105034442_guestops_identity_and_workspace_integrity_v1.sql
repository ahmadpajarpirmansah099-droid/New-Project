-- Draft migration: Guest Operations identity and workspace integrity.
-- Review required before applying to the live Supabase project.
--
-- Scope:
--   1. Bind guest/reservation creator identity to auth.uid() on insert.
--   2. Keep creator and workspace ownership immutable on update.
--   3. Bind audit actor/time to the authenticated database request.
--   4. Enforce same-workspace references for guests and audit history.
--
-- This migration intentionally does not change roles, RLS policies, app data,
-- localStorage, or frontend behavior.

-- Fail early with a clear message if existing data is inconsistent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.guests g
    JOIN public.reservations r ON r.id = g.reservation_id
    WHERE g.workspace_id IS DISTINCT FROM r.workspace_id
  ) THEN
    RAISE EXCEPTION
      'Guest Operations integrity migration blocked: a guest references a reservation in another workspace.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.guest_status_history h
    JOIN public.guests g ON g.id = h.guest_id
    WHERE h.workspace_id IS DISTINCT FROM g.workspace_id
  ) THEN
    RAISE EXCEPTION
      'Guest Operations integrity migration blocked: guest history contains a workspace mismatch.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.reservation_status_history h
    JOIN public.reservations r ON r.id = h.reservation_id
    WHERE h.workspace_id IS DISTINCT FROM r.workspace_id
  ) THEN
    RAISE EXCEPTION
      'Guest Operations integrity migration blocked: reservation history contains a workspace mismatch.';
  END IF;
END;
$$;

-- Composite unique keys allow foreign keys to validate both the record ID
-- and its workspace, rather than trusting an ID by itself.
ALTER TABLE public.guests
  ADD CONSTRAINT guests_id_workspace_key UNIQUE (id, workspace_id);

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_id_workspace_key UNIQUE (id, workspace_id);

-- A guest may reference a reservation only inside the same workspace.
-- Preserve existing delete behavior: when a reservation is deleted, only
-- reservation_id is cleared; the guest and its workspace remain intact.
ALTER TABLE public.guests
  DROP CONSTRAINT guests_reservation_id_fkey;

ALTER TABLE public.guests
  ADD CONSTRAINT guests_reservation_workspace_fkey
  FOREIGN KEY (reservation_id, workspace_id)
  REFERENCES public.reservations (id, workspace_id)
  ON DELETE SET NULL (reservation_id)
  NOT VALID;

ALTER TABLE public.guests
  VALIDATE CONSTRAINT guests_reservation_workspace_fkey;

-- Each audit row must belong to the same workspace as its parent record.
ALTER TABLE public.guest_status_history
  DROP CONSTRAINT guest_status_history_guest_id_fkey;

ALTER TABLE public.guest_status_history
  ADD CONSTRAINT guest_history_guest_workspace_fkey
  FOREIGN KEY (guest_id, workspace_id)
  REFERENCES public.guests (id, workspace_id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.guest_status_history
  VALIDATE CONSTRAINT guest_history_guest_workspace_fkey;

ALTER TABLE public.reservation_status_history
  DROP CONSTRAINT reservation_status_history_reservation_id_fkey;

ALTER TABLE public.reservation_status_history
  ADD CONSTRAINT reservation_history_reservation_workspace_fkey
  FOREIGN KEY (reservation_id, workspace_id)
  REFERENCES public.reservations (id, workspace_id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.reservation_status_history
  VALIDATE CONSTRAINT reservation_history_reservation_workspace_fkey;

-- Support the new composite FK checks and parent-delete actions.
CREATE INDEX guests_reservation_workspace_idx
  ON public.guests (reservation_id, workspace_id)
  WHERE reservation_id IS NOT NULL;

CREATE INDEX reservation_history_reservation_workspace_idx
  ON public.reservation_status_history (reservation_id, workspace_id);

-- Authenticated inserts cannot claim another user's identity. Creator,
-- record ID, and workspace ownership cannot be rewritten after creation.
-- Trusted server-side writes without a user JWT retain their explicit creator;
-- ordinary browser requests always carry auth.uid().
CREATE OR REPLACE FUNCTION private.enforce_guest_record_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  actor_id uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF actor_id IS NOT NULL
       AND NEW.created_by IS DISTINCT FROM actor_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'The creator identity must match the signed-in account.';
    END IF;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'Guest Operations record IDs cannot be changed.';
    END IF;

    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'The original creator identity cannot be changed.';
    END IF;

    IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'A Guest Operations record cannot be moved to another workspace.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.enforce_guest_record_identity()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guests_enforce_record_identity ON public.guests;
CREATE TRIGGER guests_enforce_record_identity
  BEFORE INSERT OR UPDATE ON public.guests
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_guest_record_identity();

DROP TRIGGER IF EXISTS reservations_enforce_record_identity ON public.reservations;
CREATE TRIGGER reservations_enforce_record_identity
  BEFORE INSERT OR UPDATE ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_guest_record_identity();

-- The database, not the request payload, determines the audit actor and time.
-- If a trusted server-side operation has no end-user JWT, changed_by is NULL
-- rather than accepting a caller-supplied identity.
CREATE OR REPLACE FUNCTION private.enforce_guest_audit_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  NEW.changed_by := auth.uid();
  NEW.changed_at := now();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.enforce_guest_audit_actor()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guest_history_enforce_actor ON public.guest_status_history;
CREATE TRIGGER guest_history_enforce_actor
  BEFORE INSERT ON public.guest_status_history
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_guest_audit_actor();

DROP TRIGGER IF EXISTS reservation_history_enforce_actor ON public.reservation_status_history;
CREATE TRIGGER reservation_history_enforce_actor
  BEFORE INSERT ON public.reservation_status_history
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_guest_audit_actor();
