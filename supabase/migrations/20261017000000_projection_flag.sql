-- Phase 1: flag projected values so they are never treated as latest actuals.
-- IMF debt paths run several years past the latest observed year; the seed now
-- writes is_projection = true for those rows. Additive and idempotent.
ALTER TABLE public.g20_economic_data
  ADD COLUMN IF NOT EXISTS is_projection boolean NOT NULL DEFAULT false;

-- Backfill existing rows: anything after the latest observed year is a projection.
UPDATE public.g20_economic_data
   SET is_projection = true
 WHERE year > (EXTRACT(YEAR FROM now())::int - 1)
   AND is_projection = false;

COMMENT ON COLUMN public.g20_economic_data.is_projection IS
  'True when the value is a projection (year after the latest observed year), e.g. IMF debt paths.';
