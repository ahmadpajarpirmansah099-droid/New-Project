-- Secure guest corrections and require destination membership for Stock Opname Move.
-- Corrections update the guest row and append trusted history in one transaction.

CREATE OR REPLACE FUNCTION private.correct_guest_record(
  p_guest_id uuid,
  p_guest_name text,
  p_pack integer,
  p_phone text,
  p_reason text,
  p_expected_updated_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_guest public.guests%rowtype;
  v_updated public.guests%rowtype;
  v_detail text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesi akun tidak valid.';
  END IF;
  IF p_guest_id IS NULL OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'Data koreksi tidak lengkap. Muat ulang sebelum mencoba lagi.';
  END IF;
  IF p_guest_name IS NULL OR length(btrim(p_guest_name)) NOT BETWEEN 1 AND 70 THEN
    RAISE EXCEPTION 'Nama tamu wajib diisi dan maksimal 70 karakter.';
  END IF;
  IF p_pack IS NULL OR p_pack NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'Jumlah pack harus antara 1 dan 30.';
  END IF;
  IF coalesce(length(p_phone), 0) > 80 THEN
    RAISE EXCEPTION 'Nomor WhatsApp maksimal 80 karakter.';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Alasan koreksi wajib diisi dan maksimal 500 karakter.';
  END IF;

  SELECT *
  INTO v_guest
  FROM public.guests
  WHERE id = p_guest_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data tamu tidak ditemukan.';
  END IF;
  IF NOT public.has_workspace_role(v_guest.workspace_id, ARRAY['service']::text[]) THEN
    RAISE EXCEPTION 'Akses koreksi tamu ditolak.';
  END IF;
  IF v_guest.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Data tamu sudah berubah. Muat ulang sebelum mengoreksi.';
  END IF;

  IF v_guest.guest_name IS NOT DISTINCT FROM btrim(p_guest_name)
     AND v_guest.pack IS NOT DISTINCT FROM p_pack
     AND v_guest.phone IS NOT DISTINCT FROM nullif(btrim(coalesce(p_phone, '')), '') THEN
    RAISE EXCEPTION 'Tidak ada perubahan data tamu.';
  END IF;

  v_detail := pg_catalog.concat_ws('; ',
    CASE WHEN v_guest.guest_name IS DISTINCT FROM btrim(p_guest_name)
      THEN pg_catalog.format('Nama: %s → %s', v_guest.guest_name, btrim(p_guest_name)) END,
    CASE WHEN v_guest.pack IS DISTINCT FROM p_pack
      THEN pg_catalog.format('Pack: %s → %s', v_guest.pack, p_pack) END,
    CASE WHEN v_guest.phone IS DISTINCT FROM nullif(btrim(coalesce(p_phone, '')), '')
      THEN pg_catalog.format('WhatsApp: %s → %s', coalesce(v_guest.phone, '—'), coalesce(nullif(btrim(coalesce(p_phone, '')), ''), '—')) END
  );

  UPDATE public.guests
  SET guest_name = btrim(p_guest_name),
      pack = p_pack,
      phone = nullif(btrim(coalesce(p_phone, '')), ''),
      updated_at = pg_catalog.clock_timestamp()
  WHERE id = p_guest_id
  RETURNING * INTO v_updated;

  INSERT INTO public.guest_status_history (
    workspace_id, guest_id, status, label, detail, reason, changed_by, changed_at
  ) VALUES (
    v_updated.workspace_id, v_updated.id, v_updated.status,
    'Dikoreksi', v_detail, btrim(p_reason), auth.uid(), v_updated.updated_at
  );

  RETURN pg_catalog.jsonb_build_object(
    'guest', pg_catalog.to_jsonb(v_updated),
    'audit', pg_catalog.jsonb_build_object(
      'changed_at', v_updated.updated_at,
      'label', 'Dikoreksi',
      'detail', v_detail,
      'reason', btrim(p_reason)
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION private.correct_guest_record(uuid, text, integer, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.correct_guest_record(uuid, text, integer, text, text, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.correct_guest_record(
  p_guest_id uuid,
  p_guest_name text,
  p_pack integer,
  p_phone text,
  p_reason text,
  p_expected_updated_at timestamptz
) RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT private.correct_guest_record(
    p_guest_id, p_guest_name, p_pack, p_phone, p_reason, p_expected_updated_at
  );
$function$;

REVOKE ALL ON FUNCTION public.correct_guest_record(uuid, text, integer, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_guest_record(uuid, text, integer, text, text, timestamptz) TO authenticated;
