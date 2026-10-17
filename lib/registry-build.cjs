'use strict';

// Pure builders for the country registry (sync/registry.js writes the files).
// The World Bank country API lists ~217 economies plus ~79 aggregates; the
// aggregates (region.id === "NA") are kept separately as comparators and never
// counted as countries.

// Dashboard membership and the presentation fields the G20 pages already use.
// Order, names and regions match the original public/legacy/config.js exactly,
// so the default view does not change. `advanced` drives the AE / EM filter
// (overview.js) and `commodityExporter` the scenario layer (projections.js).
const G20_MEMBERS = Object.freeze([
  { iso3: 'USA', iso2: 'US', name: 'United States',  region: 'Americas',    advanced: true,  commodityExporter: false,
    newsTerms: ['United States', 'US', 'U\\.S\\.', 'USA', 'American', 'Americans', 'Washington', 'Wall Street', 'Fed', 'Federal Reserve', 'White House', 'Trump'] },
  { iso3: 'GBR', iso2: 'GB', name: 'United Kingdom', region: 'Europe',      advanced: true,  commodityExporter: false,
    newsTerms: ['United Kingdom', 'UK', 'U\\.K\\.', 'Britain', 'British', 'England', 'London', 'Bank of England', 'BoE', 'Scotland', 'Wales', 'Reeves'] },
  { iso3: 'CAN', iso2: 'CA', name: 'Canada',         region: 'Americas',    advanced: true,  commodityExporter: true,
    newsTerms: ['Canada', 'Canadian', 'Canadians', 'Ottawa', 'Bank of Canada', 'Carney'] },
  { iso3: 'DEU', iso2: 'DE', name: 'Germany',        region: 'Europe',      advanced: true,  commodityExporter: false,
    newsTerms: ['Germany', 'German', 'Germans', 'Berlin', 'Bundesbank', 'Frankfurt'] },
  { iso3: 'FRA', iso2: 'FR', name: 'France',         region: 'Europe',      advanced: true,  commodityExporter: false,
    newsTerms: ['France', 'French', 'Paris', 'Macron'] },
  { iso3: 'ITA', iso2: 'IT', name: 'Italy',          region: 'Europe',      advanced: true,  commodityExporter: false,
    newsTerms: ['Italy', 'Italian', 'Rome', 'Milan', 'Meloni'] },
  { iso3: 'JPN', iso2: 'JP', name: 'Japan',          region: 'Asia',        advanced: true,  commodityExporter: false,
    newsTerms: ['Japan', 'Japanese', 'Tokyo', 'Bank of Japan', 'BoJ', 'BOJ', 'Nikkei', 'yen'] },
  { iso3: 'AUS', iso2: 'AU', name: 'Australia',      region: 'Asia',        advanced: true,  commodityExporter: true,
    newsTerms: ['Australia', 'Australian', 'Canberra', 'Sydney', 'RBA'] },
  { iso3: 'KOR', iso2: 'KR', name: 'South Korea',    region: 'Asia',        advanced: true,  commodityExporter: false,
    newsTerms: ['South Korea', 'Korea', 'Korean', 'Seoul', 'Samsung'] },
  { iso3: 'CHN', iso2: 'CN', name: 'China',          region: 'Asia',        advanced: false, commodityExporter: false,
    newsTerms: ['China', 'Chinese', 'Beijing', 'Shanghai', 'PBoC', 'PBOC', 'yuan', 'renminbi', 'Xi'] },
  { iso3: 'IND', iso2: 'IN', name: 'India',          region: 'Asia',        advanced: false, commodityExporter: false,
    newsTerms: ['India', 'Indian', 'Delhi', 'New Delhi', 'Mumbai', 'RBI', 'rupee', 'Modi'] },
  { iso3: 'BRA', iso2: 'BR', name: 'Brazil',         region: 'Americas',    advanced: false, commodityExporter: true,
    newsTerms: ['Brazil', 'Brazilian', 'Brasília', 'Brasilia', 'Lula', 'real'] },
  { iso3: 'MEX', iso2: 'MX', name: 'Mexico',         region: 'Americas',    advanced: false, commodityExporter: false,
    newsTerms: ['Mexico', 'Mexican', 'Mexico City', 'Banxico', 'peso'] },
  { iso3: 'ARG', iso2: 'AR', name: 'Argentina',      region: 'Americas',    advanced: false, commodityExporter: false,
    newsTerms: ['Argentina', 'Argentine', 'Argentinian', 'Buenos Aires', 'Milei'] },
  { iso3: 'RUS', iso2: 'RU', name: 'Russia',         region: 'Europe',      advanced: false, commodityExporter: true,
    newsTerms: ['Russia', 'Russian', 'Moscow', 'Kremlin', 'Putin', 'rouble', 'ruble'] },
  { iso3: 'SAU', iso2: 'SA', name: 'Saudi Arabia',   region: 'Middle East', advanced: false, commodityExporter: true,
    newsTerms: ['Saudi Arabia', 'Saudi', 'Riyadh', 'Aramco'] },
  { iso3: 'ZAF', iso2: 'ZA', name: 'South Africa',   region: 'Africa',      advanced: false, commodityExporter: true,
    newsTerms: ['South Africa', 'South African', 'Pretoria', 'Johannesburg', 'rand'] },
  { iso3: 'IDN', iso2: 'ID', name: 'Indonesia',      region: 'Asia',        advanced: false, commodityExporter: true,
    newsTerms: ['Indonesia', 'Indonesian', 'Jakarta'] },
  { iso3: 'TUR', iso2: 'TR', name: 'Turkey',         region: 'Europe',      advanced: false, commodityExporter: false,
    newsTerms: ['Turkey', 'Türkiye', 'Turkish', 'Ankara', 'Istanbul', 'lira'] },
  { iso3: 'EUU', iso2: 'EU', name: 'European Union', region: 'Europe',      advanced: false, commodityExporter: false, aggregate: true,
    newsTerms: ['European Union', 'EU', 'Eurozone', 'eurozone', 'euro area', 'Brussels', 'ECB', 'European Commission', 'Lagarde', 'Europe', 'European'] },
]);

const clean = (s) => String(s || '').trim();
const num = (s) => { const n = parseFloat(s); return Number.isFinite(n) ? n : null; };

function isAggregate(row) {
  return clean(row?.region?.id) === 'NA' || clean(row?.region?.value) === 'Aggregates';
}

function buildRegistry(worldBankCountries, { generatedAt = new Date().toISOString() } = {}) {
  const countries = [];
  const aggregates = [];
  for (const row of worldBankCountries || []) {
    const iso3 = clean(row.id);
    if (!/^[A-Z]{3}$/.test(iso3)) continue;
    if (isAggregate(row)) { aggregates.push({ iso3, iso2: clean(row.iso2Code), name: clean(row.name) }); continue; }
    countries.push({
      iso3,
      iso2: clean(row.iso2Code),
      name: clean(row.name),
      region: clean(row.region?.value),
      regionCode: clean(row.region?.id),
      incomeLevel: clean(row.incomeLevel?.value),
      incomeCode: clean(row.incomeLevel?.id),
      capital: clean(row.capitalCity) || null,
      lat: num(row.latitude),
      lon: num(row.longitude),
    });
  }
  countries.sort((a, b) => a.name.localeCompare(b.name));
  aggregates.sort((a, b) => a.name.localeCompare(b.name));

  const known = new Set(countries.map((c) => c.iso3));
  const missing = G20_MEMBERS.filter((m) => !m.aggregate && !known.has(m.iso3)).map((m) => m.iso3);
  if (missing.length) throw new Error(`Registry is missing G20 members: ${missing.join(', ')}`);
  if (countries.length < 150) throw new Error(`Registry has only ${countries.length} countries; refusing to write`);

  const group = (keyCode, keyName) => {
    const out = {};
    for (const c of countries) {
      if (!c[keyCode]) continue;
      if (!out[c[keyCode]]) out[c[keyCode]] = { code: c[keyCode], name: c[keyName], members: [] };
      out[c[keyCode]].members.push(c.iso3);
    }
    return Object.values(out).sort((a, b) => a.name.localeCompare(b.name));
  };

  return {
    schemaVersion: 1,
    generatedAt,
    source: 'World Bank country API (api.worldbank.org/v2/country)',
    countries,
    aggregates,
    collections: {
      g20: { name: 'G20', members: G20_MEMBERS.map((m) => ({ ...m })) },
      regions: group('regionCode', 'region'),
      income: group('incomeCode', 'incomeLevel'),
    },
  };
}

module.exports = { G20_MEMBERS, buildRegistry, isAggregate };
