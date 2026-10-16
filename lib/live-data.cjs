'use strict';

function latestSourceVintages(rows) {
  const sorted = [...rows].sort((a, b) => String(b.vintage_date).localeCompare(String(a.vintage_date)));
  const seen = new Set();
  return sorted.filter((row) => { const key = `${row.series_id}|${row.country_iso3}|${row.period}`; if (seen.has(key)) return false; seen.add(key); return true; });
}

module.exports = { latestSourceVintages };
