function buildBrief(rows, { cadence, periodStart }) {
  const label = cadence === 'daily' ? 'Daily' : 'Weekly';
  const sorted = [...rows].sort((a, b) => `${a.country}|${a.indicator}|${a.period}`.localeCompare(`${b.country}|${b.indicator}|${b.period}`));
  return {
    subject: `${label} economic intelligence brief · ${periodStart}`,
    periodStart,
    cadence,
    summary: sorted.length ? `${sorted.length} supported observations in your watchlist changed or released.` : 'No supported observations changed in this period.',
    evidence: sorted.map((row) => ({ label: `${row.country} · ${row.indicator} · ${row.period}`, value: row.value, source: row.source, url: row.sourceUrl })),
  };
}
module.exports = { buildBrief };
