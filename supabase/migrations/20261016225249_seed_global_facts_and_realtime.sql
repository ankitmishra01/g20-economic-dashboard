-- Backfill the normalized fact model from the proven legacy tables. The legacy
-- tables remain available for rollback; all inserts are idempotent.
INSERT INTO countries (iso3, name)
VALUES
  ('ARG','Argentina'),('AUS','Australia'),('BRA','Brazil'),('CAN','Canada'),
  ('CHN','China'),('FRA','France'),('DEU','Germany'),('IND','India'),
  ('IDN','Indonesia'),('ITA','Italy'),('JPN','Japan'),('MEX','Mexico'),
  ('RUS','Russia'),('SAU','Saudi Arabia'),('ZAF','South Africa'),
  ('KOR','South Korea'),('TUR','Türkiye'),('GBR','United Kingdom'),
  ('USA','United States'),('EUU','European Union')
ON CONFLICT (iso3) DO UPDATE SET name = EXCLUDED.name, updated_at = now();

INSERT INTO country_collections (slug, name, description)
VALUES ('g20', 'G20', 'Major advanced and emerging economies')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO collection_members (collection_slug, country_iso3, sort_order)
SELECT 'g20', iso3, row_number() OVER (ORDER BY iso3)
FROM countries
WHERE iso3 IN ('ARG','AUS','BRA','CAN','CHN','FRA','DEU','IND','IDN','ITA','JPN','MEX','RUS','SAU','ZAF','KOR','TUR','GBR','USA','EUU')
ON CONFLICT (collection_slug, country_iso3) DO NOTHING;

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
SELECT s.id, d.country_iso3, d.year::text, d.value,
       COALESCE(d.fetched_at::date, current_date),
       CASE
         WHEN d.year > EXTRACT(year FROM current_date)::integer THEN 'forecast'
         WHEN s.source_name ILIKE 'IMF%' AND d.year >= EXTRACT(year FROM current_date)::integer - 1 THEN 'estimate'
         ELSE 'actual'
       END,
       COALESCE(d.fetched_at, now()),
       jsonb_build_object('legacy_table','g20_economic_data','legacy_source',d.source)
FROM g20_economic_data d
JOIN g20_indicators m ON m.key = d.indicator_key
JOIN indicator_series s ON s.source_name = COALESCE(m.source_name, 'Official source')
  AND s.source_code = COALESCE(m.source_code, m.key) AND s.frequency = 'annual'
ON CONFLICT (series_id, country_iso3, period, vintage_date) DO NOTHING;

INSERT INTO economic_observations
  (series_id, country_iso3, period, value, vintage_date, observation_status, fetched_at, source_payload)
SELECT s.id, d.country_iso3, d.period, d.value, COALESCE(d.fetched_at::date, current_date),
       'actual', COALESCE(d.fetched_at, now()),
       jsonb_build_object('legacy_table','g20_quarterly_data','legacy_source',d.source)
FROM g20_quarterly_data d
JOIN indicator_series s ON s.key = d.indicator_key
  AND s.source_name = 'OECD / national source' AND s.frequency = 'quarterly'
ON CONFLICT (series_id, country_iso3, period, vintage_date) DO NOTHING;

-- Postgres Changes subscriptions remain owner-filtered by the existing RLS
-- policies. Add only the small personal workflow tables to the publication.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['watchlists','watchlist_items','alert_rules','brief_preferences','brief_deliveries']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END $$;
