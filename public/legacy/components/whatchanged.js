// "What changed" card at the top of Overview (data/what-changed.json, built by
// sync/what-changed.js on every refresh). A deterministic list of policy-rate
// moves, large FX and market moves, new annual prints, revisions and risk-flag
// crossings, ranked by materiality and filtered to the selected scope. An AI
// paragraph narrates the top items; it is generated on the server from these
// items only, and the list is shown on its own if the AI is unavailable.
// Built from the existing sec-head, panel and risk-row styles.

(function () {
  let _wc = null;
  let _loading = null;
  let _showAll = false;
  const TOP_N = 8;

  function load() {
    if (_wc) return Promise.resolve(_wc);
    if (!_loading) {
      _loading = fetch('data/what-changed.json', { cache: 'no-cache' })
        .then(r => (r.ok ? r.json() : null))
        .then(j => { _wc = j; window.WHAT_CHANGED = j; return j; })
        .catch(() => null);
    }
    return _loading;
  }

  const KIND = {
    policy:   { label: 'Policy rate', cls: 'risk-elevated' },
    fx:       { label: 'FX',          cls: 'risk-watch' },
    market:   { label: 'Markets',     cls: 'risk-watch' },
    print:    { label: 'New data',    cls: 'risk-stable' },
    revision: { label: 'Revision',    cls: 'risk-watch' },
    flag:     { label: 'Risk flag',   cls: 'risk-high' },
  };

  // Items for the selected scope: market items are global, country items must be in scope.
  // The euro area item is shown whenever any euro member is in scope.
  function scoped(items) {
    if (!window.Scope || Scope.id() === 'global') return items;
    const inScope = new Set((window.G20 || []).map(c => c.iso3));
    const euroMembers = new Set(Object.entries(window.REALTIME?.policyRates?.values || {}).filter(([, v]) => v.euroArea).map(([iso]) => iso));
    const anyEuro = [...inScope].some(iso => euroMembers.has(iso)) || inScope.has('EUU');
    return items.filter(i => !i.iso3 || inScope.has(i.iso3) || (i.iso3 === 'EUU' && anyEuro));
  }

  // Same wording as the country profile: the rate has moved since this month.
  const fmtMonth = (ym) => {
    const m = /^(\d{4})-(\d{2})$/.exec(ym || '');
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
  };

  function valueCell(i) {
    if (i.kind === 'policy') return `${Number(i.value).toFixed(2)}%<span class="sub">${i.change > 0 ? '▲' : '▼'} ${Math.abs(Math.round(i.change * 100))}bp</span>`;
    if (i.kind === 'fx') return `${i.change > 0 ? '+' : ''}${Number(i.change).toFixed(1)}%<span class="sub">${A.escapeText(i.currency)} per USD · ${i.window}</span>`;
    if (i.kind === 'market') return `${i.unit === 'pp' ? `${i.change > 0 ? '+' : ''}${Math.round(i.change * 100)}bp` : `${i.change > 0 ? '+' : ''}${Number(i.change).toFixed(1)}%`}<span class="sub">${A.escapeText(i.market)}</span>`;
    const v = i.value == null ? '—' : Number(i.value).toFixed(1);
    return `${v}<span class="sub">${A.escapeText(i.unit || '')}${i.year ? ` · ${i.year}` : ''}</span>`;
  }

  function rowHtml(i) {
    const econ = i.iso3 ? (window.findEconomy?.(i.iso3) || null) : null;
    const name = i.iso3 === 'EUU' ? 'Euro area' : econ?.name || (i.kind === 'market' ? 'Global markets' : i.iso3 || '');
    const code = econ?.code;
    const flag = code && /^[A-Z]{2}$/.test(code)
      ? `<span class="flag-rect" style="background-image:url('https://flagcdn.com/${A.escapeAttr(code.toLowerCase())}.svg');background-size:cover;background-position:center;"></span>` : '';
    const nav = i.iso3 && econ ? A.navRowAttrs(i.iso3, name) : '';
    const kind = KIND[i.kind] || { label: i.kind, cls: 'risk-watch' };
    const since = i.kind === 'policy' && i.since ? ` · moved since ${fmtMonth(i.since)}` : '';
    const badge = window.freshBadge ? window.freshBadge(i.asOf, i.kind === 'daily' ? 'daily' : ['fx', 'market'].includes(i.kind) ? 'daily' : 'weekly') : A.escapeText(i.asOf || '');
    return `
      <div class="risk-row"${nav ? ` ${nav}` : ' style="cursor:default"'}>
        <div class="risk-row__main">
          <span class="risk-row__country">${flag}${A.escapeText(name)} <span class="risk-pill ${kind.cls}">${kind.label}</span>${i.newSinceLastRefresh ? ' <span class="risk-pill risk-stable" title="New since the previous refresh">new</span>' : i.carried ? ' <span class="risk-pill risk-watch" title="Reported in an earlier refresh; kept for 14 days">earlier</span>' : ''}</span>
          <span class="risk-row__desc">${A.escapeText(i.title)}${since} · ${A.escapeText(i.source || '')} · ${badge}</span>
        </div>
        <div class="risk-row__val">${valueCell(i)}</div>
      </div>`;
  }

  // Placeholder emitted by renderOverview(); filled by mountWhatChanged().
  window.renderWhatChangedShell = function () {
    return `
  <div id="overview-what-changed">
    <div class="sec-head">
      <div class="sec-head__title">What changed <span class="sec-head__sub">since the last refresh · ranked by materiality</span></div>
    </div>
    <div class="panel mb-20"><div class="panel__body"><span class="v-mute">Loading the latest changes…</span></div></div>
  </div>`;
  };

  async function narrate(items, asOf) {
    const el = document.getElementById('wc-narration');
    if (!el) return;
    const scopeId = window.Scope ? Scope.id() : 'g20';
    const cacheKey = `g20-wc-brief:${asOf}:${scopeId}:${items.slice(0, TOP_N).map(i => i.id).join('|')}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) { el.innerHTML = cached; return; }
    } catch (_) { /* storage blocked */ }
    try {
      const r = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'brief', scope: scopeId }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.text) { el.closest('.wc-brief-wrap')?.remove(); return; }
      const html = `${A.escapeText(data.text)}<div class="risk-row__desc" style="margin-top:8px">AI summary of the items listed below, written only from those figures${data.model ? ` · ${A.escapeText(data.model)}` : ''}</div>`;
      el.innerHTML = html;
      try { localStorage.setItem(cacheKey, html); } catch (_) { /* ignore */ }
    } catch (_) {
      el.closest('.wc-brief-wrap')?.remove();
    }
  }

  window.mountWhatChanged = async function () {
    const host = document.getElementById('overview-what-changed');
    if (!host) return;
    const [wc] = await Promise.all([load(), window.loadRealtime ? window.loadRealtime() : null]);
    if (!document.getElementById('overview-what-changed')) return; // navigated away
    if (!wc || !Array.isArray(wc.items)) { host.remove(); return; }
    const items = scoped(wc.items);
    const shown = _showAll ? items : items.slice(0, TOP_N);
    const noun = window.Scope ? Scope.noun() : 'G20';
    host.innerHTML = `
    <div class="sec-head">
      <div class="sec-head__title">What changed <span class="count">/ ${items.length}</span><span class="sec-head__sub">${A.escapeText(noun)} · policy rates, FX, markets, new data and risk flags · ranked by materiality</span></div>
      <div class="sec-head__actions">
        ${items.length > TOP_N ? `<button class="sec-head__tab${_showAll ? '' : ' active'}" onclick="whatChangedShow(false)">Top ${TOP_N}</button><button class="sec-head__tab${_showAll ? ' active' : ''}" onclick="whatChangedShow(true)">All</button>` : ''}
        ${window.freshBadge ? window.freshBadge(wc.asOf) : ''}
      </div>
    </div>
    <div class="panel mb-20">
      ${items.length ? `<div class="wc-brief-wrap"><div class="panel__body" id="wc-narration"><span class="v-mute">Summarising the top changes…</span></div></div>` : ''}
      ${shown.length ? shown.map(rowHtml).join('') : `<div class="risk-row" style="cursor:default"><div class="risk-row__main"><span class="risk-row__desc">No material changes for ${A.escapeText(noun)} in the last ${14} days.</span></div><div></div></div>`}
      <div class="panel__body"><span class="risk-row__desc">${A.escapeText(wc.note || '')} Compared with the previous refresh; items stay listed for 14 days.</span></div>
    </div>`;
    if (items.length) narrate(items, wc.asOf);
  };

  window.whatChangedShow = function (all) {
    _showAll = !!all;
    window.mountWhatChanged();
  };

  window.loadWhatChanged = load;
})();
