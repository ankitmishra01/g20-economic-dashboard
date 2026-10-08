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

-- RLS: public clients may read; only the server-side refresh role may write.
ALTER TABLE g20_economic_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read"   ON g20_economic_data;
DROP POLICY IF EXISTS "Public write"  ON g20_economic_data;
DROP POLICY IF EXISTS "Public upsert" ON g20_economic_data;

CREATE POLICY "Public read" ON g20_economic_data
  FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON g20_economic_data FROM anon, authenticated;
GRANT SELECT ON g20_economic_data TO anon, authenticated;

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_g20_country   ON g20_economic_data (country_iso3);
CREATE INDEX IF NOT EXISTS idx_g20_indicator ON g20_economic_data (indicator_key);
CREATE INDEX IF NOT EXISTS idx_g20_year      ON g20_economic_data (year);

-- ── Indicator metadata table ──────────────────────────────────────────────────
-- Stores definitions, source codes, and coverage notes for every indicator.
-- Seeded by sync/seed.js; loaded by the frontend data layer.

-- ── Quarterly data table ─────────────────────────────────────────────────────
-- Stores high-frequency (quarterly) data from OECD, Statistics Canada, FRED, etc.
-- Period format: '2026Q1', '2025Q4' — YYYY + Qn, sortable as string.
-- Separate from g20_economic_data (annual) to avoid breaking existing pipeline.

CREATE TABLE IF NOT EXISTS g20_quarterly_data (
  country_iso3  TEXT    NOT NULL,
  indicator_key TEXT    NOT NULL,
  period        TEXT    NOT NULL,
  value         FLOAT8  NOT NULL,
  source        TEXT    NOT NULL DEFAULT 'oecd',
  fetched_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (country_iso3, indicator_key, period)
);

ALTER TABLE g20_quarterly_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read"   ON g20_quarterly_data;
DROP POLICY IF EXISTS "Public write"  ON g20_quarterly_data;
DROP POLICY IF EXISTS "Public upsert" ON g20_quarterly_data;
CREATE POLICY "Public read" ON g20_quarterly_data
  FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON g20_quarterly_data FROM anon, authenticated;
GRANT SELECT ON g20_quarterly_data TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_g20q_country   ON g20_quarterly_data (country_iso3);
CREATE INDEX IF NOT EXISTS idx_g20q_indicator ON g20_quarterly_data (indicator_key);
CREATE INDEX IF NOT EXISTS idx_g20q_period    ON g20_quarterly_data (period);

-- ── Indicator metadata table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS g20_indicators (
  key           TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  unit          TEXT,
  description   TEXT,
  source_name   TEXT,   -- 'World Bank', 'IMF WEO', 'OECD MSTI', etc.
  source_code   TEXT,   -- 'NY.GDP.MKTP.CD', 'NGDP_RPCH', etc.
  source_url    TEXT,
  coverage_note TEXT,   -- '19/19 G20 economies'
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE g20_indicators ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read"   ON g20_indicators;
DROP POLICY IF EXISTS "Public write"  ON g20_indicators;
DROP POLICY IF EXISTS "Public upsert" ON g20_indicators;
CREATE POLICY "Public read" ON g20_indicators
  FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON g20_indicators FROM anon, authenticated;
GRANT SELECT ON g20_indicators TO anon, authenticated;

-- Prevent future public-schema tables from inheriting write privileges.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT ON TABLES TO anon, authenticated;
