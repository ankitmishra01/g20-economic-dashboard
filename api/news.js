// Server-side RSS aggregator for economic news ticker + news page.
// Fetches G20/global economy feeds, parses XML, filters by keyword, returns JSON.
// Vercel caches the response for 15 min at the edge.

const FEEDS = [
  { url: 'https://feeds.bbci.co.uk/news/business/rss.xml',           name: 'BBC Business',    filter: false },
  { url: 'https://www.imf.org/en/News/rss?type=pressreleases',        name: 'IMF',             filter: false },
  { url: 'https://feeds.reuters.com/reuters/businessNews',            name: 'Reuters Business', filter: true  },
  { url: 'https://www.ft.com/global-economy?format=rss',             name: 'FT',              filter: true  },
];

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

const ECON_KEYWORDS = [
  'gdp', 'inflation', 'interest rate', 'central bank', 'federal reserve', 'ecb',
  'imf', 'world bank', 'g20', 'g7', 'recession', 'growth', 'unemployment', 'jobs',
  'trade', 'tariff', 'sanctions', 'debt', 'deficit', 'surplus', 'currency', 'dollar',
  'euro', 'yuan', 'yen', 'oil', 'energy', 'commodity', 'supply chain', 'cpi',
  'ppi', 'fiscal', 'monetary policy', 'quantitative', 'rate hike', 'rate cut',
  'bond', 'yield', 'treasury', 'budget', 'tax', 'investment', 'export', 'import',
  'emerging market', 'developing', 'poverty', 'inequality', 'climate finance',
];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=900, stale-while-revalidate=300');

  try {
    const results = await Promise.allSettled(FEEDS.map(f => fetchAndParse(f)));

    const all = [];
    results.forEach(r => { if (r.status === 'fulfilled') all.push(...r.value); });

    const cutoff = Date.now() - SIXTY_DAYS_MS;
    const recent = all.filter(a => {
      if (!a.pubDate) return true;
      const t = new Date(a.pubDate).getTime();
      return isNaN(t) || t >= cutoff;
    });

    const filtered = recent.filter(a => {
      if (!a._filter) return true;
      const text = ((a.title || '') + ' ' + (a.description || '')).toLowerCase();
      return ECON_KEYWORDS.some(kw => text.includes(kw));
    });

    const seen = new Set();
    const unique = filtered.filter(a => {
      const key = (a.title || '').slice(0, 60).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    unique.sort((a, b) => (new Date(b.pubDate || 0)) - (new Date(a.pubDate || 0)));
    const clean = unique.slice(0, 50).map(({ _filter, ...a }) => a);
    return res.status(200).json({ articles: clean });
  } catch (e) {
    return res.status(500).json({ error: e.message, articles: [] });
  }
};

async function fetchAndParse({ url, name, filter }) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; G20DashBot/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const xml = await r.text();
    return parseRSS(xml, name, filter);
  } catch (_) {
    return [];
  }
}

function parseRSS(xml, source, needsFilter) {
  const items = [];
  for (const tag of ['item', 'entry']) {
    const re = new RegExp(`<${tag}[\\s>]([\\s\\S]*?)<\\/${tag}>`, 'gi');
    let m;
    while ((m = re.exec(xml)) !== null) {
      const chunk = m[1];
      const title = extractTag(chunk, 'title');
      const link  = extractLink(chunk);
      const pubDate = extractTag(chunk, 'pubDate') || extractTag(chunk, 'published') || extractTag(chunk, 'dc:date');
      const description = stripHTML(extractTag(chunk, 'description') || extractTag(chunk, 'summary') || '');
      if (title && link) {
        items.push({ title, link, pubDate, description: description.slice(0, 240), source, _filter: needsFilter });
      }
    }
    if (items.length) break;
  }
  return items;
}

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))`, 'i');
  const m = xml.match(re);
  if (!m) return '';
  return decodeEntities((m[1] !== undefined ? m[1] : m[2] || '').trim());
}

function extractLink(xml) {
  const rss = xml.match(/<link[^>]*>\s*(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))/i);
  if (rss) {
    const v = (rss[1] !== undefined ? rss[1] : rss[2] || '').trim();
    if (v.startsWith('http')) return v;
  }
  const atom = xml.match(/<link[^>]+href=["']([^"']+)["']/i);
  if (atom) return atom[1];
  const guid = xml.match(/<guid[^>]*>\s*(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))/i);
  if (guid) {
    const v = (guid[1] !== undefined ? guid[1] : guid[2] || '').trim();
    if (v.startsWith('http')) return v;
  }
  return '';
}

function stripHTML(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g,  '&').replace(/&lt;/g,   '<').replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#8217;/g, '’').replace(/&#8216;/g, '‘')
    .replace(/&#8220;/g, '“').replace(/&#8221;/g, '”');
}
