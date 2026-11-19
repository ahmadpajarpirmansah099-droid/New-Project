-- Serialize reservation seating and prevent a second guest link for the same reservation.
-- Historical duplicate links are intentionally retained; no existing guest rows are changed.

CREATE OR REPLACE FUNCTION private.prevent_duplicate_reservation_guest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.reservation_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.reservation_id IS NOT DISTINCT FROM OLD.reservation_id
       AND NEW.workspace_id IS NOT DISTINCT FROM OLD.workspace_id THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Lock the parent reservation so inserts from every client path serialize.
  PERFORM 1
  FROM public.reservations AS r
  WHERE r.id = NEW.reservation_id
    AND r.workspace_id = NEW.workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'Reservasi tidak ditemukan pada workspace aktif.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.guests AS g
    WHERE g.workspace_id = NEW.workspace_id
      AND g.reservation_id = NEW.reservation_id
      AND g.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'Reservasi ini sudah memiliki data tamu. Tidak ada data baru yang dibuat.';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.prevent_duplicate_reservation_guest()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guests_guard_single_reservation_guest ON public.guests;
CREATE TRIGGER guests_guard_single_reservation_guest
BEFORE INSERT OR UPDATE ON public.guests
FOR EACH ROW
EXECUTE FUNCTION private.prevent_duplicate_reservation_guest();

COMMENT ON FUNCTION private.prevent_duplicate_reservation_guest() IS
  'Serializes Guest Operations reservation links on the parent reservation row and blocks a second guest link without modifying historical duplicates.';

CREATE OR REPLACE FUNCTION public.seat_guest_reservation(
  p_reservation_id uuid,
  p_table_label text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_reservation public.reservations%ROWTYPE;
  v_guest public.guests%ROWTYPE;
  v_guest_count integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_service_date date := (pg_catalog.now() AT TIME ZONE 'Asia/Jakarta')::date;
  v_table_label text := pg_catalog.btrim(COALESCE(p_table_label, ''));
  v_ticket text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sesi akun tidak valid.';
  END IF;

  IF p_reservation_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Reservasi tidak valid.';
  END IF;

  IF v_table_label = '' OR pg_catalog.length(v_table_label) > 80 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Nomor atau nama meja wajib diisi (maksimal 80 karakter).';
  END IF;

  -- RLS limits this lookup to reservations available to the current user.
  SELECT r.*
  INTO v_reservation
  FROM public.reservations AS r
  WHERE r.id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Reservasi tidak ditemukan atau akses ditolak.';
  END IF;

  IF NOT public.has_workspace_role(v_reservation.workspace_id, ARRAY['service']::text[]) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Akses Guest Operations ditolak.';
  END IF;

  IF v_reservation.reservation_date <> v_service_date THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Tamu hanya bisa didudukkan pada tanggal reservasinya.';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_guest_count
  FROM public.guests AS g
  WHERE g.workspace_id = v_reservation.workspace_id
    AND g.reservation_id = v_reservation.id;

  IF v_guest_count > 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'Reservasi ini sudah memiliki beberapa data tamu lama. Tidak ada data yang diubah; hubungi Global Developer.';
  END IF;

  IF v_guest_count = 1 THEN
    SELECT g.*
    INTO v_guest
    FROM public.guests AS g
    WHERE g.workspace_id = v_reservation.workspace_id
      AND g.reservation_id = v_reservation.id
    ORDER BY g.created_at ASC, g.id ASC
    LIMIT 1;

    IF v_reservation.status <> 'seated' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'Data tamu untuk reservasi ini sudah ada, tetapi status reservasi belum duduk. Perlu pemeriksaan.';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'created', false,
      'guest', pg_catalog.to_jsonb(v_guest),
      'reservation', pg_catalog.to_jsonb(v_reservation)
    );
  END IF;

  IF v_reservation.status <> 'pending' THEN
    IF v_reservation.status = 'seated' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'Reservasi sudah berstatus duduk, tetapi data tamunya tidak ditemukan. Perlu pemeriksaan.';
    END IF;
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Hanya reservasi berstatus menunggu yang dapat didudukkan.';
  END IF;

  -- The counter increment, guest insert, status update, and history triggers
  -- are part of this same transaction and roll back together on any failure.
  v_ticket := public.next_guest_ticket(v_reservation.workspace_id, v_service_date);

  INSERT INTO public.guests (
    workspace_id,
    reservation_id,
    ticket,
    service_date,
    guest_name,
    pack,
    phone,
    smoking,
    status,
    created_by,
    created_at,
    seated_at,
    resolved_at,
    table_label
  )
  VALUES (
    v_reservation.workspace_id,
    v_reservation.id,
    v_ticket,
    v_service_date,
    v_reservation.guest_name,
    v_reservation.pack,
    v_reservation.phone,
    CASE pg_catalog.lower(COALESCE(v_reservation.smoking, ''))
      WHEN 'smoking' THEN true
      WHEN 'non smoking' THEN false
      ELSE NULL
    END,
    'seated',
    auth.uid(),
    v_now,
    v_now,
    v_now,
    v_table_label
  )
  RETURNING *
  INTO v_guest;

  UPDATE public.reservations
  SET status = 'seated',
      table_label = v_table_label,
      updated_at = v_now
  WHERE id = v_reservation.id
    AND workspace_id = v_reservation.workspace_id
  RETURNING *
  INTO v_reservation;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Reservasi berubah saat proses dudukkan. Coba muat ulang.';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'created', true,
    'guest', pg_catalog.to_jsonb(v_guest),
    'reservation', pg_catalog.to_jsonb(v_reservation)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.seat_guest_reservation(uuid, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.seat_guest_reservation(uuid, text)
TO authenticated;

COMMENT ON FUNCTION public.seat_guest_reservation(uuid, text) IS
  'Atomically seats a pending Guest Operations reservation and returns the created guest; retries return the already-linked guest without creating another row.';
