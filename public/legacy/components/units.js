// GDP unit helpers shared by the browser (window.Units) and the tests (require).
// One unit per chart, chosen from the largest value shown, so axis ticks never read
// "$0.00T" for a smaller economy or mix "$90.0B" with "$0.11T" on one axis.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Units = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const UNITS = [
    { min: 1e12, div: 1e12, suffix: 'T' },
    { min: 1e9,  div: 1e9,  suffix: 'B' },
    { min: 0,    div: 1e6,  suffix: 'M' },
  ];

  function gdpUnitFor(maxAbs) {
    const m = Math.abs(Number(maxAbs) || 0);
    return UNITS.find(u => m >= u.min) || UNITS[UNITS.length - 1];
  }

  // Formatter for a chart axis/tooltip given every value plotted on it.
  function gdpAxisFormatter(values) {
    const finite = (values || []).map(Number).filter(Number.isFinite);
    const max = finite.length ? Math.max(...finite.map(Math.abs)) : 0;
    const u = gdpUnitFor(max);
    const scaled = max / u.div;
    const dp = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
    return (v) => (v == null || !Number.isFinite(Number(v)) ? '—' : `$${(Number(v) / u.div).toFixed(dp)}${u.suffix}`);
  }

  return { gdpUnitFor, gdpAxisFormatter };
});
