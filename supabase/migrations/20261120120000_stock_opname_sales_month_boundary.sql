-- Calendar-month boundaries are authoritative for Sales documents.
-- A multi-day Sales range may not span two calendar months because the app only
-- stores one aggregate quantity per menu and cannot allocate it by day.
DO $patch$
DECLARE
 v_definition text;
 v_old text := 'if start_date is null or end_date is null or end_date<start_date or start_date<(p->>''start'')::date or end_date>(now() at time zone ''Asia/Jakarta'')::date then raise exception ''Tanggal transaksi di luar periode aktif.''; end if;';
 v_new text := v_old || E'\n     if typ=''sales'' and date_trunc(''month'',start_date)<>date_trunc(''month'',end_date) then raise exception ''Rentang Sales tidak boleh melewati pergantian bulan. Pisahkan menjadi dua transaksi.''; end if;';
BEGIN
 SELECT pg_get_functiondef('private.so_mutate(uuid,bigint,uuid,text,jsonb)'::regprocedure)
 INTO v_definition;
 IF position(v_old IN v_definition)=0
    OR (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old)<>1 THEN
  RAISE EXCEPTION 'Pola validasi tanggal Stock Opname berubah; patch dibatalkan.';
 END IF;
 v_definition:=replace(v_definition,v_old,v_new);
 EXECUTE v_definition;
END;
$patch$;
