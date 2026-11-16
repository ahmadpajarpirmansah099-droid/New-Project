-- Preserve unknown smoking preferences for existing guest records.
-- New guest registrations collect an explicit choice in the application.
ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS smoking boolean;
