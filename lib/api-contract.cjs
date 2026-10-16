function paginate(rows, { limit = 50, cursor = null } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('limit must be between 1 and 500');
  const offset = cursor ? Number.parseInt(String(cursor), 10) : 0;
  if (!Number.isInteger(offset) || offset < 0) throw new Error('invalid cursor');
  const data = rows.slice(offset, offset + limit);
  const next = offset + data.length;
  return { data, meta: { count: data.length, nextCursor: next < rows.length ? String(next) : null } };
}

function mergeVintages(rows) {
  const unique = new Map();
  for (const row of rows) unique.set([row.series, row.country, row.period, row.vintage].join('|'), { ...row });
  return [...unique.values()].sort((a, b) => `${a.country}|${a.series}|${a.period}|${a.vintage}`.localeCompare(`${b.country}|${b.series}|${b.period}|${b.vintage}`));
}

function coverageSummary(availableCountries, expectedCountries) {
  const available = new Set(availableCountries);
  const missing = expectedCountries.filter((country) => !available.has(country));
  return { available: available.size, expected: expectedCountries.length, ratio: expectedCountries.length ? available.size / expectedCountries.length : 0, missing };
}

module.exports = { paginate, mergeVintages, coverageSummary };
