-- G20 Economic Dashboard — Supabase schema
-- Run this in the Supabase SQL editor at:
-- https://qozknjenyhewmkapsizk.supabase.co

CREATE TABLE IF NOT EXISTS g20_economic_data (
  country_iso3  TEXT    NOT NULL,
  indicator_key TEXT    NOT NULL,
  year          INTEGER NOT NULL,
  value         FLOAT8  NOT NULL,
  source        TEXT    NOT NULL DEFAULT 'worldbank',
  fetched_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (country_iso3, indicator_key, year)
);

-- RLS: all data is public World Bank / IMF data — allow public read + write
ALTER TABLE g20_economic_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read"   ON g20_economic_data;
DROP POLICY IF EXISTS "Public write"  ON g20_economic_data;
DROP POLICY IF EXISTS "Public upsert" ON g20_economic_data;

CREATE POLICY "Public read"   ON g20_economic_data FOR SELECT USING (true);
CREATE POLICY "Public write"  ON g20_economic_data FOR INSERT WITH CHECK (true);
CREATE POLICY "Public upsert" ON g20_economic_data FOR UPDATE USING (true);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_g20_country   ON g20_economic_data (country_iso3);
CREATE INDEX IF NOT EXISTS idx_g20_indicator ON g20_economic_data (indicator_key);
CREATE INDEX IF NOT EXISTS idx_g20_year      ON g20_economic_data (year);
