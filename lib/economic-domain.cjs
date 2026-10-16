'use strict';

const FRESHNESS_BUDGET_HOURS = Object.freeze({
  realtime: 1,
  hourly: 4,
  daily: 48,
  weekly: 24 * 10,
  monthly: 24 * 75,
  quarterly: 24 * 180,
  annual: 24 * 550,
});

function normalizeStatus(row, currentYear) {
  const explicit = String(row.status || row.observation_status || '').toLowerCase();
  if (['actual', 'preliminary', 'estimate', 'forecast'].includes(explicit)) return explicit;
  if (row.is_forecast === true || Number(row.year) > currentYear) return 'forecast';
  return 'actual';
}

function classifySnapshotObservation({ source, period, generatedAt, frequency = 'annual' }) {
  const generatedYear = new Date(generatedAt).getUTCFullYear();
  const periodYear = Number(String(period).slice(0, 4));
  if (!Number.isFinite(generatedYear) || !Number.isFinite(periodYear)) return 'actual';
  if (periodYear > generatedYear) return 'forecast';
  if (frequency === 'annual' && /IMF(?:\s+WEO|\s+DataMapper)?/i.test(String(source)) && periodYear >= generatedYear - 1) {
    return 'estimate';
  }
  return 'actual';
}

function periodOf(row) {
  return String(row.period || row.year || '');
}

function classifyFreshness(input, now = new Date()) {
  const frequency = String(input.frequency || 'annual').toLowerCase();
  const budget = FRESHNESS_BUDGET_HOURS[frequency] || FRESHNESS_BUDGET_HOURS.annual;
  const timestamp = input.releasedAt || input.release_date || input.fetchedAt || input.fetched_at;
  const basis = (input.releasedAt || input.release_date) ? 'release' : 'fetch';
  if (!timestamp) return { state: 'unavailable', ageHours: null, basis: null };

  const instant = new Date(timestamp);
  if (Number.isNaN(instant.getTime())) return { state: 'failed', ageHours: null, basis };
  const ageHours = Math.max(0, Math.round((now.getTime() - instant.getTime()) / 36e5));
  const state = ageHours <= budget ? 'current' : ageHours <= budget * 1.25 ? 'delayed' : 'stale';
  return { state, ageHours, basis };
}

function formatObservationLabel(observation) {
  const period = String(observation.period || observation.year || 'Unknown period');
  const status = String(observation.status || 'actual').toLowerCase();
  let readable = period.replace(/^(\d{4})-?Q([1-4])$/, '$1 Q$2');
  const monthly = period.match(/^(\d{4})-(\d{2})$/);
  if (monthly) {
    readable = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${monthly[1]}-${monthly[2]}-01T00:00:00Z`));
  }
  const suffix = status === 'actual' ? 'official release' : status;
  return `${readable} · ${suffix}`;
}

function summarizeIndicators(rows, options = {}) {
  const countries = options.countries || [];
  const now = options.now || new Date();
  const currentYear = now.getUTCFullYear();
  const grouped = new Map();

  for (const row of rows) {
    if (!grouped.has(row.indicator_key)) grouped.set(row.indicator_key, []);
    grouped.get(row.indicator_key).push({ ...row, _status: normalizeStatus(row, currentYear) });
  }

  const result = {};
  for (const [key, indicatorRows] of grouped) {
    const observed = indicatorRows.filter(row => row._status !== 'forecast');
    const forecasts = indicatorRows.filter(row => row._status === 'forecast');
    const latestByCountry = new Map();
    for (const row of observed) {
      const previous = latestByCountry.get(row.country_iso3);
      if (!previous || periodOf(row) > periodOf(previous)) latestByCountry.set(row.country_iso3, row);
    }

    const observedPeriods = observed.map(periodOf).filter(Boolean).sort();
    const forecastPeriods = forecasts.map(periodOf).filter(Boolean).sort();
    const newestFetch = indicatorRows.map(row => row.fetched_at).filter(Boolean).sort().at(-1) || null;
    const frequency = indicatorRows.find(row => row.frequency)?.frequency || 'annual';
    const freshness = classifyFreshness({ frequency, fetchedAt: newestFetch }, now);

    result[key] = {
      covered: latestByCountry.size,
      latestObservedPeriod: observedPeriods.at(-1) || null,
      latestForecastPeriod: forecastPeriods.at(-1) || null,
      missing: countries.filter(code => !latestByCountry.has(code)),
      frequency,
      freshness,
    };
  }
  return result;
}

module.exports = {
  FRESHNESS_BUDGET_HOURS,
  classifyFreshness,
  classifySnapshotObservation,
  formatObservationLabel,
  normalizeStatus,
  summarizeIndicators,
};
