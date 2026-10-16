CREATE OR REPLACE FUNCTION public.sync_normalized_from_legacy()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE written_count bigint;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required';
  END IF;

  INSERT INTO indicator_series (key, label, description, unit, source_name, source_code, source_url, frequency, coverage_tier)
  SELECT key, label, description, COALESCE(unit, 'index'), COALESCE(source_name, 'Official source'), COALESCE(source_code, key), source_url, 'annual', 1
  FROM g20_indicators
  ON CONFLICT (source_name, source_code, frequency) DO UPDATE
  SET key = EXCLUDED.key, label = EXCLUDED.label, description = EXCLUDED.description,
      unit = EXCLUDED.unit, source_url = EXCLUDED.source_url, updated_at = now();

  INSERT INTO indicator_series (key, label, description, unit, source_name, source_code, source_url, frequency, coverage_tier)
  SELECT key, label, description, COALESCE(unit, 'index'), 'OECD / national source', key, source_url, 'quarterly', 1
  FROM g20_indicators
  WHERE EXISTS (SELECT 1 FROM g20_quarterly_data q WHERE q.indicator_key = g20_indicators.key)
  ON CONFLICT (source_name, source_code, frequency) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, unit = EXCLUDED.unit,
      source_url = EXCLUDED.source_url, updated_at = now();

  INSERT INTO economic_observations
    (series_id, country_iso3, period, value, vintage_date, observation_status, fetched_at, source_payload)
  SELECT s.id, d.country_iso3, d.year::text, d.value, COALESCE(d.fetched_at::date, current_date),
         CASE WHEN d.year > EXTRACT(year FROM current_date)::integer THEN 'forecast'
              WHEN s.source_name ILIKE 'IMF%' AND d.year >= EXTRACT(year FROM current_date)::integer - 1 THEN 'estimate'
              ELSE 'actual' END,
         COALESCE(d.fetched_at, now()), jsonb_build_object('legacy_table','g20_economic_data','legacy_source',d.source)
  FROM g20_economic_data d
  JOIN g20_indicators m ON m.key = d.indicator_key
  JOIN indicator_series s ON s.source_name = COALESCE(m.source_name, 'Official source')
    AND s.source_code = COALESCE(m.source_code, m.key) AND s.frequency = 'annual'
  ON CONFLICT (series_id, country_iso3, period, vintage_date) DO NOTHING;

  INSERT INTO economic_observations
    (series_id, country_iso3, period, value, vintage_date, observation_status, fetched_at, source_payload)
  SELECT s.id, d.country_iso3, d.period, d.value, COALESCE(d.fetched_at::date, current_date),
         'actual', COALESCE(d.fetched_at, now()), jsonb_build_object('legacy_table','g20_quarterly_data','legacy_source',d.source)
  FROM g20_quarterly_data d
  JOIN indicator_series s ON s.key = d.indicator_key
    AND s.source_name = 'OECD / national source' AND s.frequency = 'quarterly'
  ON CONFLICT (series_id, country_iso3, period, vintage_date) DO NOTHING;

  SELECT count(*) INTO written_count FROM economic_observations;
  RETURN jsonb_build_object('observations', written_count, 'synced_at', now());
END $$;

REVOKE ALL ON FUNCTION public.sync_normalized_from_legacy() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_normalized_from_legacy() TO service_role;

ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_owner_key UNIQUE (id, user_id);
CREATE TABLE alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_rule_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  country_iso3 TEXT REFERENCES countries(iso3) ON DELETE CASCADE,
  series_id UUID REFERENCES indicator_series(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  triggered_value NUMERIC,
  comparator TEXT NOT NULL,
  threshold NUMERIC,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (alert_rule_id, user_id) REFERENCES alert_rules(id, user_id) ON DELETE CASCADE,
  UNIQUE NULLS NOT DISTINCT (alert_rule_id, country_iso3, series_id, period)
);
ALTER TABLE alert_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alert events owned" ON alert_events FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
GRANT SELECT ON alert_events TO authenticated;
CREATE INDEX idx_alert_events_owner_created ON alert_events(user_id, created_at DESC);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['economic_observations','economic_releases','alert_events']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = table_name) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END $$;
