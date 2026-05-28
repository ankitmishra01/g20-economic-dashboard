// IMF DataMapper API proxy — government debt / GDP (GGXWDG_NGDP) and other fiscal data.
// GET /api/imf?indicator=GGXWDG_NGDP
// Returns { indicator, data: [{country, year, value}] }
// Cached 24h at Vercel edge.

const G20_IMF = ['USA','GBR','CAN','DEU','FRA','ITA','JPN','AUS','KOR','CHN',
                 'IND','BRA','MEX','ARG','RUS','SAU','ZAF','IDN','TUR'];

// Map ISO2/IMF codes → our ISO3 codes for consistency with World Bank data.
const IMF_TO_ISO3 = {
  USA:'USA', GBR:'GBR', CAN:'CAN', DEU:'DEU', FRA:'FRA', ITA:'ITA',
  JPN:'JPN', AUS:'AUS', KOR:'KOR', CHN:'CHN', IND:'IND', BRA:'BRA',
  MEX:'MEX', ARG:'ARG', RUS:'RUS', SAU:'SAU', ZAF:'ZAF', IDN:'IDN', TUR:'TUR',
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=3600');

  const { indicator = 'GGXWDG_NGDP' } = req.query;

  const url = `https://www.imf.org/external/datamapper/api/v1/${indicator}?periods=2015,2016,2017,2018,2019,2020,2021,2022,2023,2024`;

  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'G20Dashboard/1.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return res.status(502).json({ error: `IMF API returned ${r.status}` });

    const json = await r.json();
    const values = json?.values?.[indicator] || {};

    const data = [];
    for (const [imfCode, years] of Object.entries(values)) {
      const iso3 = IMF_TO_ISO3[imfCode];
      if (!iso3 || !G20_IMF.includes(imfCode)) continue;
      for (const [yearStr, value] of Object.entries(years)) {
        if (value !== null && value !== undefined) {
          data.push({ country: iso3, year: parseInt(yearStr, 10), value });
        }
      }
    }

    return res.status(200).json({ indicator, data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
