-- Store the manually assigned table for each seated guest.
-- Existing guest rows remain unchanged; table_label is nullable for historical data.
ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS table_label text;
