// IMF data endpoint — now reads from Supabase (seeded by sync/seed.js).
// Kept for debugging: GET /api/imf?indicator=DEBT_GDP

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qozknjenyhewmkapsizk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_8I4WpqENYtTkUNKzqfxkkQ_lrQKG3cG';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=3600');

  const { indicator = 'DEBT_GDP' } = req.query;

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/g20_economic_data?indicator_key=eq.${encodeURIComponent(indicator)}&source=eq.imf&select=country_iso3,year,value&order=year.asc`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      }
    );
    if (!r.ok) throw new Error(`Supabase ${r.status}`);
    const rows = await r.json();
    const data = rows.map(r => ({ country: r.country_iso3, year: r.year, value: r.value }));
    return res.status(200).json({ indicator, data });
  } catch (e) {
    return res.status(500).json({ error: e.message, data: [] });
  }
};
