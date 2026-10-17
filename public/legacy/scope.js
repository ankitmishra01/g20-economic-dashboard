// Scope: which economies every page iterates over.
// Global (default: every registry economy) · G20 · a World Bank region ·
// an income group · the viewer's watchlist (localStorage). Pages read `G20` / `window.G20`,
// which setScope() reassigns, so existing components follow the selected scope.

(function () {
  const REG = window.COUNTRY_REGISTRY || { countries: [], collections: { regions: [], income: [] } };
  const flagEmoji = (iso2) => /^[A-Z]{2}$/.test(iso2 || '')
    ? String.fromCodePoint(...[...iso2].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65)) : '';

  const G20_MEMBERS = window.G20.slice();             // original G20 objects (config.js)
  const g20ByIso = new Map(G20_MEMBERS.map(c => [c.iso3, c]));

  // Every registry economy in the shape components expect ({ code, iso3, name, flag, region }).
  const ALL = REG.countries.map(c => g20ByIso.get(c.iso3) ? { ...g20ByIso.get(c.iso3), region: c.region, wbRegion: c.region, regionCode: c.regionCode, incomeLevel: c.incomeLevel, incomeCode: c.incomeCode } : ({
    code: c.iso2, iso3: c.iso3, name: c.name, flag: flagEmoji(c.iso2),
    region: c.region, wbRegion: c.region, regionCode: c.regionCode, incomeLevel: c.incomeLevel, incomeCode: c.incomeCode,
  }));
  const allByIso = new Map(ALL.map(c => [c.iso3, c]));
  for (const c of G20_MEMBERS) if (!allByIso.has(c.iso3)) allByIso.set(c.iso3, c); // EU comparator

  const WATCH_KEY = 'g20-watchlist';
  const SCOPE_KEY = 'gei-scope-v2'; // v2: Global became the default, so earlier saved G20 choices reset
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* private mode */ } };

  function watchlist() { return read(WATCH_KEY, []).filter(iso => allByIso.has(iso)); }

  // Scope definitions: id → { label, short, members() }.
  const SCOPES = [{ id: 'global', label: 'Global', short: 'Global', group: 'Default', members: () => ALL.slice() },
    { id: 'g20', label: 'G20', short: 'G20', group: 'Default', members: () => G20_MEMBERS.slice() }];
  for (const r of REG.collections.regions || []) {
    SCOPES.push({ id: `region:${r.code}`, label: r.name, short: r.name, group: 'Region',
      members: () => r.members.map(iso => allByIso.get(iso)).filter(Boolean) });
  }
  for (const g of REG.collections.income || []) {
    SCOPES.push({ id: `income:${g.code}`, label: g.name, short: g.name, group: 'Income group',
      members: () => g.members.map(iso => allByIso.get(iso)).filter(Boolean) });
  }
  SCOPES.push({ id: 'watchlist', label: 'Watchlist', short: 'Watchlist', group: 'Mine',
    members: () => watchlist().map(iso => allByIso.get(iso)).filter(Boolean) });
  const byId = new Map(SCOPES.map(s => [s.id, s]));

  // ?scope=global (or region:SSF, income:LIC, watchlist) gives a shareable link to a scope.
  const fromUrl = new URLSearchParams(location.search).get('scope');
  // Global is the default view (every economy); a saved choice or ?scope= overrides it.
  let current = byId.has(fromUrl) ? fromUrl : byId.has(read(SCOPE_KEY, 'global')) ? read(SCOPE_KEY, 'global') : 'global';

  function apply(id) {
    const s = byId.get(id) || byId.get('g20');
    current = s.id;
    const members = s.members();
    // `G20` is a global `let` in config.js; reassigning it moves every page to the scope.
    G20 = members; // eslint-disable-line no-global-assign
    window.G20 = members;
  }

  window.Scope = {
    list: () => SCOPES,
    id: () => current,
    isG20: () => current === 'g20',
    label: () => (byId.get(current) || byId.get('g20')).label,
    // Noun for headlines: "G20", "Global", "Sub-Saharan Africa", "Your watchlist".
    noun: () => current === 'watchlist' ? 'Your watchlist' : (byId.get(current) || byId.get('g20')).label,
    members: () => window.G20,
    g20Members: () => G20_MEMBERS.slice(),
    all: () => ALL.slice(),
    find: (iso3) => allByIso.get(iso3) || null,
    set(id) {
      if (!byId.has(id) || id === current) return;
      write(SCOPE_KEY, id);
      apply(id);
      if (typeof window.onScopeChange === 'function') window.onScopeChange(id);
    },
    watchlist,
    isWatched: (iso3) => watchlist().includes(iso3),
    toggleWatch(iso3) {
      const list = watchlist();
      const next = list.includes(iso3) ? list.filter(i => i !== iso3) : [...list, iso3];
      write(WATCH_KEY, next);
      if (current === 'watchlist') apply('watchlist');
      return next.includes(iso3);
    },
  };
  // Peer-group wording for headlines and comparisons. The G20 reads exactly as before.
  const peerWord = () => {
    if (current === 'g20') return 'G20';
    if (current === 'global') return 'world';
    if (current === 'watchlist') return 'watchlist';
    return (byId.get(current) || {}).label || 'G20';
  };
  window.PEER = peerWord;                                                    // "the G20 median" -> "the world median"
  window.PEER_CAP = () => { const w = peerWord(); return w.charAt(0).toUpperCase() + w.slice(1); };
  window.PEER_IN = () => current === 'g20' ? 'G20' : `the ${peerWord()}`;   // "highest in G20" -> "highest in the world"
  window.G20_MEMBERS = G20_MEMBERS;
  window.findEconomy = (iso3) => allByIso.get(iso3) || null;
  apply(current);
})();
