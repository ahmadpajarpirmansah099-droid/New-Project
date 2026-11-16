-- Preserve deterministic order for multiple audit entries created by one row change.
CREATE OR REPLACE FUNCTION public.log_guest_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_changes text[] := ARRAY[]::text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.guest_status_history
      (workspace_id, guest_id, status, label, detail, changed_by, changed_at)
    VALUES
      (NEW.workspace_id, NEW.id, NEW.status, 'Terdaftar',
       NEW.pack::text || ' pack', auth.uid(), clock_timestamp());

    IF NEW.status = 'seated' THEN
      INSERT INTO public.guest_status_history
        (workspace_id, guest_id, status, label, detail, changed_by, changed_at)
      VALUES
        (NEW.workspace_id, NEW.id, NEW.status, 'Langsung Duduk',
         'Meja ' || COALESCE(NULLIF(btrim(NEW.table_label), ''), 'Belum ditentukan'),
         auth.uid(), clock_timestamp());
    END IF;
  ELSE
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.guest_status_history
        (workspace_id, guest_id, status, label, detail, reason, changed_by, changed_at)
      VALUES (
        NEW.workspace_id, NEW.id, NEW.status,
        CASE NEW.status
          WHEN 'called' THEN 'Dipanggil'
          WHEN 'seated' THEN 'Duduk'
          WHEN 'done' THEN 'Selesai'
          WHEN 'missed' THEN 'Lupa diselesaikan'
          WHEN 'cancelled' THEN 'Dibatalkan'
          ELSE 'Menunggu'
        END,
        CASE
          WHEN NEW.status = 'seated' THEN
            'Meja ' || COALESCE(NULLIF(btrim(NEW.table_label), ''), 'Belum ditentukan')
          WHEN NEW.status = 'missed' THEN
            'Otomatis ditutup saat reset operasional 00:00 WIB'
          ELSE NULL
        END,
        CASE WHEN NEW.status = 'missed'
          THEN 'Antrean belum diselesaikan sampai pergantian tanggal.'
          ELSE NULL
        END,
        auth.uid(), clock_timestamp()
      );
    END IF;

    IF OLD.status = 'seated' AND NEW.status = 'seated'
       AND OLD.table_label IS DISTINCT FROM NEW.table_label THEN
      INSERT INTO public.guest_status_history
        (workspace_id, guest_id, status, label, detail, changed_by, changed_at)
      VALUES (
        NEW.workspace_id, NEW.id, NEW.status, 'Pindah Meja',
        'Meja ' || COALESCE(NULLIF(btrim(OLD.table_label), ''), '—')
          || ' → Meja ' || COALESCE(NULLIF(btrim(NEW.table_label), ''), '—'),
        auth.uid(), clock_timestamp()
      );
    END IF;

    IF OLD.ticket IS DISTINCT FROM NEW.ticket THEN
      v_changes := array_append(v_changes, format('Nomor antrean: %s → %s', OLD.ticket, NEW.ticket));
    END IF;
    IF OLD.service_date IS DISTINCT FROM NEW.service_date THEN
      v_changes := array_append(v_changes, format('Tanggal layanan: %s → %s', OLD.service_date, NEW.service_date));
    END IF;
    IF OLD.guest_name IS DISTINCT FROM NEW.guest_name THEN
      v_changes := array_append(v_changes, format('Nama: %s → %s', OLD.guest_name, NEW.guest_name));
    END IF;
    IF OLD.pack IS DISTINCT FROM NEW.pack THEN
      v_changes := array_append(v_changes, format('Jumlah pack: %s → %s', OLD.pack, NEW.pack));
    END IF;
    IF OLD.phone IS DISTINCT FROM NEW.phone THEN
      v_changes := array_append(v_changes,
        format('WhatsApp: %s → %s', COALESCE(OLD.phone, '(kosong)'), COALESCE(NEW.phone, '(kosong)')));
    END IF;
    IF OLD.smoking IS DISTINCT FROM NEW.smoking THEN
      v_changes := array_append(v_changes,
        'Area merokok: '
        || CASE OLD.smoking WHEN true THEN 'Smoking' WHEN false THEN 'Non Smoking' ELSE 'Belum diisi' END
        || ' → '
        || CASE NEW.smoking WHEN true THEN 'Smoking' WHEN false THEN 'Non Smoking' ELSE 'Belum diisi' END);
    END IF;
    IF OLD.reservation_id IS DISTINCT FROM NEW.reservation_id THEN
      v_changes := array_append(v_changes, 'Tautan reservasi diperbarui');
    END IF;

    IF cardinality(v_changes) > 0 THEN
      INSERT INTO public.guest_status_history
        (workspace_id, guest_id, status, label, detail, changed_by, changed_at)
      VALUES
        (NEW.workspace_id, NEW.id, NEW.status, 'Koreksi Data',
         array_to_string(v_changes, '; '), auth.uid(), clock_timestamp());
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
