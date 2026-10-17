// Share menu (header) + one-page brief for print / PDF.
// - Copy link: a clean /c/{ISO3} (country profile) or /s/{scope} link whose preview card
//   is built server-side (src/app/c, src/app/s, src/app/og).
// - Download brief: fills #print-brief from the published shards and calls window.print();
//   styles/print.css lays it out on one A4/Letter page.
// - ?print=brief opens the current view straight in brief layout (used for PDF checks).
(function () {
  const A = window.Atoms || {};
  const esc = (s) => (A.escapeText ? A.escapeText(String(s ?? '')) : String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const cache = {};
  const getJson = (path) => (cache[path] ||= fetch(path, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null));

  function currentTarget() {
    const hash = location.hash.replace('#', '');
    const origin = location.origin;
    if (hash.startsWith('country/')) {
      const iso3 = hash.split('/')[1].toUpperCase();
      const c = (window.COUNTRY_REGISTRY?.countries || []).find((x) => x.iso3 === iso3);
      return { type: 'country', iso3, name: c?.name || iso3, url: `${origin}/c/${iso3}` };
    }
    const id = window.Scope ? Scope.id() : 'global';
    return { type: 'scope', scope: id, name: window.Scope ? Scope.label() : 'Global', url: `${origin}/s/${encodeURIComponent(id)}` };
  }

  // ── Menu ──────────────────────────────────────────────────────────────────
  function menuEl() { return document.getElementById('share-menu'); }
  function closeMenu() {
    const m = menuEl(); if (!m) return;
    m.hidden = true;
    document.getElementById('share-btn')?.setAttribute('aria-expanded', 'false');
  }
  window.toggleShareMenu = function () {
    const m = menuEl(); if (!m) return;
    if (!m.hidden) return closeMenu();
    const t = currentTarget();
    m.innerHTML = `
      <div class="share-menu__head">${esc(t.type === 'country' ? t.name : `${t.name} view`)}</div>
      <button class="share-menu__item" role="menuitem" onclick="shareCopyLink()"><span>Copy link</span><span class="share-menu__meta" id="share-copy-state">${esc(t.url.replace(/^https?:\/\//, ''))}</span></button>
      <button class="share-menu__item" role="menuitem" onclick="shareDownloadBrief()"><span>Download one-page brief</span><span class="share-menu__meta">PDF · print</span></button>
      <a class="share-menu__item" role="menuitem" href="mailto:?subject=${encodeURIComponent(`${t.name}: economic brief`)}&body=${encodeURIComponent(t.url)}"><span>Email link</span><span class="share-menu__meta">mail app</span></a>
      <a class="share-menu__item" role="menuitem" target="_blank" rel="noopener" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(t.url)}"><span>Share on LinkedIn</span><span class="share-menu__meta">new tab</span></a>`;
    m.hidden = false;
    document.getElementById('share-btn')?.setAttribute('aria-expanded', 'true');
  };
  window.shareCopyLink = async function () {
    const t = currentTarget();
    const state = document.getElementById('share-copy-state');
    try {
      await navigator.clipboard.writeText(t.url);
      if (state) state.textContent = 'Copied';
    } catch (_) {
      window.prompt('Copy this link', t.url);
    }
    setTimeout(closeMenu, 900);
  };
  document.addEventListener('click', (e) => {
    const m = menuEl();
    if (m && !m.hidden && !m.contains(e.target) && e.target.id !== 'share-btn' && !e.target.closest('#share-btn')) closeMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  // ── Brief content ─────────────────────────────────────────────────────────
  const latestOf = (iso, key) => window.G20Data?.getLatest(iso, key, { annualOnly: true }) || null;
  const usd = (v) => {
    if (!Number.isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a >= 1e12) return `$${(v / 1e12).toFixed(v >= 1e13 ? 1 : 2)}T`;
    if (a >= 1e9) return `$${Math.round(v / 1e9)}B`;
    if (a >= 1e6) return `$${Math.round(v / 1e6)}M`;
    if (a >= 1e3) return `$${(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`;
    return `$${Math.round(v)}`;
  };
  const pct = (v, signed) => (Number.isFinite(v) ? `${signed && v > 0 ? '+' : ''}${v.toFixed(1)}%` : '—');
  const kpi = (label, l, fmt) => `<div class="pb-kpi"><div class="pb-kpi__lbl">${esc(label)}</div><div class="pb-kpi__val">${l ? fmt(l.value) : '—'}</div><div class="pb-kpi__sub">${l?.year ?? 'no data'}</div></div>`;
  const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const head = (title, subtitle, flagIso2) => `
    <header class="pb-head">
      <div class="pb-brand"><span class="pb-mark">G20</span><span><strong>Monitor</strong><em>Global economic intelligence</em></span></div>
      <div class="pb-date">Brief · ${esc(today())}</div>
    </header>
    <div class="pb-title">${flagIso2 ? `<img class="pb-flag" src="https://flagcdn.com/w80/${esc(flagIso2.toLowerCase())}.png" alt="">` : ''}<div><h1>${esc(title)}</h1><div class="pb-sub">${esc(subtitle || '')}</div></div></div>`;
  const foot = (url) => `<footer class="pb-foot"><span>Sources: World Bank · IMF · OECD · BIS · ECB · FRED. Annual values are the latest actual year shown; IMF projections are never shown as actuals. Market data are official daily references, not tick prices.</span><span>${esc(url.replace(/^https?:\/\//, ''))}</span></footer>`;

  async function countryBrief(t) {
    const [brief, wc, ai] = await Promise.all([getJson(`data/briefs/${t.iso3}.json`), getJson('data/what-changed.json'), getJson('data/ai-index.json')]);
    const reg = (window.COUNTRY_REGISTRY?.countries || []).find((x) => x.iso3 === t.iso3) || {};
    const rt = window.REALTIME || null;
    const pr = rt?.policyRates?.values?.[t.iso3];
    const ccy = rt?.fx?.currencyByIso3?.[t.iso3];
    const fx = ccy && ccy !== 'USD' ? rt?.fx?.values?.[ccy] : null;
    const a = ai?.countries?.[t.iso3];
    const risk = typeof window.computeRiskScore === 'function' ? window.computeRiskScore(t.iso3) : null;
    const items = (wc?.items || []).filter((i) => i.iso3 === t.iso3).slice(0, 5);
    const sections = Array.isArray(brief?.sections) ? brief.sections.slice(0, 5) : [];
    const sigs = (risk?.signals || []).filter((x) => typeof x === 'string' && x).slice(0, 5);
    const markets = [
      pr ? `<div class="pb-mk"><span>${pr.euroArea ? 'ECB policy rate' : 'Policy rate'}</span><strong>${Number(pr.rate.toFixed(3))}%</strong><em>${pr.lastChange ? `${pr.lastChange.change > 0 ? '+' : ''}${Math.round(pr.lastChange.change * 100)}bp last move · ` : ''}as of ${esc(pr.date || '')} · BIS</em></div>` : '',
      fx ? `<div class="pb-mk"><span>${esc(ccy)} per USD</span><strong>${fx.perUsd >= 100 ? fx.perUsd.toFixed(1) : fx.perUsd.toFixed(4)}</strong><em>${Number.isFinite(fx.change30dPct) ? `${fx.change30dPct > 0 ? '+' : ''}${fx.change30dPct.toFixed(1)}% over 30 days (positive = weaker) · ` : ''}as of ${esc(rt.fx.date || '')} · ECB</em></div>` : '',
      a ? `<div class="pb-mk"><span>AI readiness</span><strong>${a.total_score}/100</strong><em>${a.projected_score_2028 != null ? `${a.projected_score_2028} projected for 2028 · ` : ''}${esc(a.trajectory_label || '')} · ${a.data_source === 'live' ? 'live score' : 'baseline'} · AI Trajectory Index</em></div>` : '',
    ].join('');
    return `
      ${head(reg.name || t.name, [reg.region, reg.incomeLevel].filter(Boolean).join(' · '), reg.iso2)}
      ${brief?.headline ? `<p class="pb-headline">${esc(brief.headline)}</p>` : ''}
      <section class="pb-kpis">
        ${kpi('GDP', latestOf(t.iso3, 'GDP'), usd)}
        ${kpi('Real growth', latestOf(t.iso3, 'GDP_GROWTH'), (v) => pct(v, true))}
        ${kpi('Inflation', latestOf(t.iso3, 'INFLATION'), (v) => pct(v))}
        ${kpi('Unemployment', latestOf(t.iso3, 'UNEMPLOYMENT'), (v) => pct(v))}
        ${kpi('Debt / GDP', latestOf(t.iso3, 'DEBT_GDP'), (v) => `${Math.round(v)}%`)}
        ${kpi('Fiscal balance', latestOf(t.iso3, 'FISCAL_BAL'), (v) => pct(v, true))}
        ${kpi('Current account', latestOf(t.iso3, 'CURRENT_ACC'), (v) => pct(v, true))}
        ${kpi('GDP / capita PPP', latestOf(t.iso3, 'GDP_CAPITA_PPP'), usd)}
      </section>
      ${markets ? `<section class="pb-markets">${markets}</section>` : ''}
      <div class="pb-cols">
        <section class="pb-text"><h2>Assessment</h2>${sections.map((p) => `<p>${esc(p)}</p>`).join('') || '<p>No generated brief for this economy yet.</p>'}</section>
        <aside class="pb-side">
          <h2>What changed</h2>
          ${items.length ? `<ul>${items.map((i) => `<li>${esc(i.title)} <em>${esc(i.asOf || '')}</em></li>`).join('')}</ul>` : '<p class="pb-muted">No material change in the latest refresh.</p>'}
          <h2>Risk view</h2>
          ${risk ? `<p><strong>${esc(risk.label || '')}</strong>${Number.isFinite(risk.score) ? ` · fragility ${Math.round(risk.score)}/100` : ''}</p>${sigs.length ? `<ul>${sigs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="pb-muted">No risk signals triggered.</p>'}` : '<p class="pb-muted">Not enough data.</p>'}
        </aside>
      </div>
      ${foot(t.url)}`;
  }

  async function scopeBrief(t) {
    const wc = await getJson('data/what-changed.json');
    const members = (window.G20 || []).filter((c) => c && c.iso3 && !c.aggregate);
    const isos = new Set(members.map((c) => c.iso3));
    const vals = (key) => members.map((c) => latestOf(c.iso3, key)?.value).filter(Number.isFinite).sort((x, y) => x - y);
    const med = (key) => { const a = vals(key); if (!a.length) return null; const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
    const gdp = vals('GDP').reduce((x, y) => x + y, 0);
    const items = (wc?.items || []).filter((i) => !i.iso3 || isos.has(i.iso3)).slice(0, 10);
    const risks = typeof window.computeRiskScore === 'function'
      ? members.map((c) => ({ c, r: window.computeRiskScore(c.iso3) })).filter((x) => x.r && Number.isFinite(x.r.score)).sort((a, b) => b.r.score - a.r.score).slice(0, 10)
      : [];
    const box = (label, value, sub) => `<div class="pb-kpi"><div class="pb-kpi__lbl">${esc(label)}</div><div class="pb-kpi__val">${value}</div><div class="pb-kpi__sub">${esc(sub || '')}</div></div>`;
    const year = window.LATEST_ACTUAL_YEAR || '';
    return `
      ${head(t.scope === 'global' ? 'The world economy' : t.name, `${members.length} economies · latest actual year ${year}`, null)}
      <section class="pb-kpis">
        ${box('Combined GDP', usd(gdp), String(year))}
        ${box('Median growth', pct(med('GDP_GROWTH'), true), 'real, annual')}
        ${box('Median inflation', pct(med('INFLATION')), 'consumer prices')}
        ${box('Median unemployment', pct(med('UNEMPLOYMENT')), 'of labour force')}
        ${box('Median debt / GDP', Number.isFinite(med('DEBT_GDP')) ? `${Math.round(med('DEBT_GDP'))}%` : '—', 'general government')}
        ${box('Median fiscal balance', pct(med('FISCAL_BAL'), true), 'of GDP')}
        ${box('Median current account', pct(med('CURRENT_ACC'), true), 'of GDP')}
        ${box('Economies with data', String(members.filter((c) => latestOf(c.iso3, 'GDP')).length), `of ${members.length}`)}
      </section>
      <div class="pb-cols">
        <section class="pb-text"><h2>What changed</h2>${items.length ? `<ul>${items.map((i) => `<li>${esc(i.title)} <em>${esc(i.asOf || '')} · ${esc(i.source || '')}</em></li>`).join('')}</ul>` : '<p class="pb-muted">No material change in the latest refresh.</p>'}</section>
        <aside class="pb-side"><h2>Highest fragility scores</h2>${risks.length ? `<ol>${risks.map(({ c, r }) => `<li>${esc(c.name)} <em>${Math.round(r.score)}/100 · ${esc(r.label || '')}</em></li>`).join('')}</ol>` : '<p class="pb-muted">Not enough data.</p>'}</aside>
      </div>
      ${foot(t.url)}`;
  }

  async function buildBrief() {
    let el = document.getElementById('print-brief');
    if (!el) { el = document.createElement('div'); el.id = 'print-brief'; el.className = 'print-brief'; document.body.appendChild(el); }
    const t = currentTarget();
    el.innerHTML = t.type === 'country' ? await countryBrief(t) : await scopeBrief(t);
    // Flags are remote images: give them a moment so they print.
    await Promise.all([...el.querySelectorAll('img')].map((img) => (img.complete ? null : new Promise((res) => { img.onload = img.onerror = res; setTimeout(res, 1500); }))));
    return el;
  }

  window.shareDownloadBrief = async function () {
    closeMenu();
    await buildBrief();
    document.body.classList.add('printing-brief');
    const done = () => { document.body.classList.remove('printing-brief'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  };

  // ?print=brief: render the brief layout on load (no dialog), for PDF generation.
  if (new URLSearchParams(location.search).get('print') === 'brief') {
    const ready = () => (window.G20Data && window.COUNTRY_REGISTRY ? Promise.resolve() : new Promise((r) => setTimeout(r, 300)).then(ready));
    window.addEventListener('load', () => {
      ready().then(() => new Promise((r) => setTimeout(r, 1200))).then(buildBrief).then(() => document.body.classList.add('printing-brief', 'print-preview'));
    });
  }
})();
