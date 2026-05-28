// World Bank Open Data API proxy.
// GET /api/wb?indicator=NY.GDP.MKTP.KD.ZG&countries=USA;GBR&years=2010:2024
// Returns { indicator, data: [{country, year, value}] }
// Cached 24h at Vercel edge — WB data updates annually.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=3600');

  const { indicator, countries, years = '2010:2024' } = req.query;
  if (!indicator) return res.status(400).json({ error: 'indicator is required' });

  // Default: all G20 ISO3 codes (semicolon-separated for WB API)
  const G20_ISO3 = 'USA;GBR;CAN;DEU;FRA;ITA;JPN;AUS;KOR;CHN;IND;BRA;MEX;ARG;RUS;SAU;ZAF;IDN;TUR;EUU';
  const countryParam = (countries || G20_ISO3).replace(/,/g, ';');

  const url = `https://api.worldbank.org/v2/country/${countryParam}/indicator/${indicator}?format=json&date=${years}&per_page=1000&mrv=15`;

  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'G20Dashboard/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return res.status(502).json({ error: `World Bank API returned ${r.status}` });

    const json = await r.json();
    if (!Array.isArray(json) || json.length < 2) {
      return res.status(502).json({ error: 'Unexpected World Bank response shape' });
    }

    const data = (json[1] || [])
      .filter(d => d.value !== null && d.value !== undefined)
      .map(d => ({
        country: d.country?.id || d.countryiso3code,
        name: d.country?.value,
        year: parseInt(d.date, 10),
        value: d.value,
      }));

    return res.status(200).json({ indicator, data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
