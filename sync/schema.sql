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

-- ── Global economic intelligence schema ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS countries (
  iso3 TEXT PRIMARY KEY CHECK (iso3 ~ '^[A-Z]{3}$'),
  iso2 TEXT UNIQUE CHECK (iso2 IS NULL OR iso2 ~ '^[A-Z]{2}$'),
  name TEXT NOT NULL,
  region TEXT,
  income_group TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS country_collections (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collection_members (
  collection_slug TEXT NOT NULL REFERENCES country_collections(slug) ON DELETE CASCADE,
  country_iso3 TEXT NOT NULL REFERENCES countries(iso3) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_slug, country_iso3)
);

CREATE TABLE IF NOT EXISTS indicator_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  unit TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_code TEXT NOT NULL,
  source_url TEXT,
  frequency TEXT NOT NULL CHECK (frequency IN ('realtime','hourly','daily','weekly','monthly','quarterly','annual')),
  seasonal_adjustment TEXT,
  coverage_tier SMALLINT NOT NULL DEFAULT 1 CHECK (coverage_tier BETWEEN 1 AND 3),
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_name, source_code, frequency)
);

CREATE TABLE IF NOT EXISTS economic_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES indicator_series(id) ON DELETE CASCADE,
  country_iso3 TEXT REFERENCES countries(iso3) ON DELETE CASCADE,
  period TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','released','delayed','cancelled')),
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (series_id, country_iso3, period)
);

CREATE TABLE IF NOT EXISTS economic_observations (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  series_id UUID NOT NULL REFERENCES indicator_series(id) ON DELETE CASCADE,
  country_iso3 TEXT NOT NULL REFERENCES countries(iso3) ON DELETE CASCADE,
  period TEXT NOT NULL,
  value NUMERIC NOT NULL,
  vintage_date DATE NOT NULL,
  observation_status TEXT NOT NULL DEFAULT 'actual' CHECK (observation_status IN ('actual','preliminary','estimate','forecast')),
  released_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  release_id UUID REFERENCES economic_releases(id) ON DELETE SET NULL,
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (series_id, country_iso3, period, vintage_date)
);

CREATE TABLE IF NOT EXISTS ingestion_job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_key TEXT NOT NULL,
  source_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','partial','failed')),
  rows_seen INTEGER NOT NULL DEFAULT 0 CHECK (rows_seen >= 0),
  rows_written INTEGER NOT NULL DEFAULT 0 CHECK (rows_written >= 0),
  error_code TEXT,
  error_message TEXT,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_observations_country_period ON economic_observations(country_iso3, period DESC);
CREATE INDEX IF NOT EXISTS idx_observations_series_period ON economic_observations(series_id, period DESC);
CREATE INDEX IF NOT EXISTS idx_observations_status ON economic_observations(observation_status, period DESC);
CREATE INDEX IF NOT EXISTS idx_releases_scheduled ON economic_releases(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_job_runs_key_started ON ingestion_job_runs(job_key, started_at DESC);

CREATE OR REPLACE VIEW latest_economic_observations
WITH (security_invoker = true) AS
SELECT DISTINCT ON (series_id, country_iso3, period)
  id, series_id, country_iso3, period, value, vintage_date,
  observation_status, released_at, fetched_at, release_id
FROM economic_observations
ORDER BY series_id, country_iso3, period, vintage_date DESC;

-- Public economic facts are readable but writable only by privileged server roles.
ALTER TABLE countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE country_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicator_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE economic_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE economic_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read countries" ON countries FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read collections" ON country_collections FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read collection members" ON collection_members FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read indicator series" ON indicator_series FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read releases" ON economic_releases FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read observations" ON economic_observations FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON
  countries, country_collections, collection_members, indicator_series,
  economic_releases, economic_observations, ingestion_job_runs
FROM anon, authenticated;
GRANT SELECT ON countries, country_collections, collection_members, indicator_series,
  economic_releases, economic_observations, latest_economic_observations
TO anon, authenticated;

-- ── Optional authenticated workflows ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Toronto',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name),
  UNIQUE (id, user_id)
);

CREATE TABLE IF NOT EXISTS watchlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id UUID NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  country_iso3 TEXT REFERENCES countries(iso3) ON DELETE CASCADE,
  series_id UUID REFERENCES indicator_series(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (country_iso3 IS NOT NULL OR series_id IS NOT NULL),
  FOREIGN KEY (watchlist_id, user_id) REFERENCES watchlists (id, user_id) ON DELETE CASCADE,
  UNIQUE (watchlist_id, country_iso3, series_id)
);

CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  watchlist_id UUID REFERENCES watchlists(id) ON DELETE CASCADE,
  country_iso3 TEXT REFERENCES countries(iso3) ON DELETE CASCADE,
  series_id UUID REFERENCES indicator_series(id) ON DELETE CASCADE,
  comparator TEXT NOT NULL CHECK (comparator IN ('above','below','change_up','change_down','new_release','stale')),
  threshold NUMERIC,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (watchlist_id, user_id) REFERENCES watchlists (id, user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS brief_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  watchlist_id UUID REFERENCES watchlists(id) ON DELETE SET NULL,
  cadence TEXT NOT NULL DEFAULT 'weekly' CHECK (cadence IN ('daily','weekly')),
  delivery_hour SMALLINT NOT NULL DEFAULT 8 CHECK (delivery_hour BETWEEN 0 AND 23),
  delivery_weekday SMALLINT DEFAULT 1 CHECK (delivery_weekday BETWEEN 0 AND 6),
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (watchlist_id, user_id) REFERENCES watchlists (id, user_id) ON DELETE SET NULL (watchlist_id)
);

CREATE TABLE IF NOT EXISTS brief_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  watchlist_id UUID REFERENCES watchlists(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  cadence TEXT NOT NULL CHECK (cadence IN ('daily','weekly')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','rendered','sent','failed','skipped')),
  subject TEXT,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  provider_message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  FOREIGN KEY (watchlist_id, user_id) REFERENCES watchlists (id, user_id) ON DELETE SET NULL (watchlist_id),
  UNIQUE NULLS NOT DISTINCT (user_id, watchlist_id, period_start, cadence)
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE brief_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE brief_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles owned" ON profiles FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Watchlists owned" ON watchlists FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Watchlist items owned" ON watchlist_items FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Alerts owned" ON alert_rules FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Brief preferences owned" ON brief_preferences FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Brief deliveries owned" ON brief_deliveries FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON profiles, watchlists, watchlist_items,
  alert_rules, brief_preferences TO authenticated;
GRANT SELECT ON brief_deliveries TO authenticated;

CREATE INDEX IF NOT EXISTS idx_watchlists_user ON watchlists(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_watchlist_items_owner ON watchlist_items(user_id, watchlist_id);
CREATE INDEX IF NOT EXISTS idx_alert_rules_owner_active ON alert_rules(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_brief_deliveries_owner_period ON brief_deliveries(user_id, period_start DESC);
