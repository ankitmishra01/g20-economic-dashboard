BEGIN;

ALTER TABLE public.g20_economic_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.g20_quarterly_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.g20_indicators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read" ON public.g20_economic_data;
DROP POLICY IF EXISTS "Public write" ON public.g20_economic_data;
DROP POLICY IF EXISTS "Public upsert" ON public.g20_economic_data;
DROP POLICY IF EXISTS "Public read" ON public.g20_quarterly_data;
DROP POLICY IF EXISTS "Public write" ON public.g20_quarterly_data;
DROP POLICY IF EXISTS "Public upsert" ON public.g20_quarterly_data;
DROP POLICY IF EXISTS "Public read" ON public.g20_indicators;
DROP POLICY IF EXISTS "Public write" ON public.g20_indicators;
DROP POLICY IF EXISTS "Public upsert" ON public.g20_indicators;

CREATE POLICY "Public read" ON public.g20_economic_data
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read" ON public.g20_quarterly_data
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read" ON public.g20_indicators
  FOR SELECT TO anon, authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.g20_economic_data, public.g20_quarterly_data, public.g20_indicators
  FROM anon, authenticated;
GRANT SELECT
  ON public.g20_economic_data, public.g20_quarterly_data, public.g20_indicators
  TO anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT ON TABLES TO anon, authenticated;

-- This security-definer event-trigger function is internal to Supabase and
-- should not be executable by API roles.
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;

COMMIT;
