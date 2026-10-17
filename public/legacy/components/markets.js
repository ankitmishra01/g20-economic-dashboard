// Daily market layer (data/realtime.json, refreshed by realtime-refresh.yml):
// a strip under the command bar, policy rate + FX on country profiles, and freshness
// badges. Built from the existing wires-strip and risk-pill styles. Labelled daily,
// never "real-time": these are official reference series, not tick prices.

(function () {
  let _rt = null;
  let _loading = null;

  function load() {
    if (_rt) return Promise.resolve(_rt);
    if (!_loading) {
      _loading = fetch('data/realtime.json', { cache: 'no-cache' })
        .then(r => (r.ok ? r.json() : null))
        .then(j => { _rt = j; window.REALTIME = j; return j; })
        .catch(() => null);
    }
    return _loading;
  }

  const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  };

  const fmtMonth = (ym) => {
    const m = /^(\d{4})-(\d{2})$/.exec(ym || '');
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : ym;
  };

  // Freshness of a dated observation, judged in the browser at view time.
  function freshness(dateIso, cadence = 'daily') {
    if (!dateIso) return 'unavailable';
    const budget = { daily: 48, weekly: 240 }[cadence] || 48;
    const age = (Date.now() - new Date(`${dateIso}T23:59:59Z`).getTime()) / 36e5;
    return age <= budget ? 'current' : age <= budget * 1.25 ? 'delayed' : 'stale';
  }
  const FRESH_CLS = { current: 'risk-stable', delayed: 'risk-watch', stale: 'risk-high', unavailable: 'risk-watch' };
  function freshBadge(dateIso, cadence = 'daily') {
    const f = freshness(dateIso, cadence);
    const tip = { current: 'Within the source’s normal publication lag', delayed: 'Later than usual from the source', stale: 'Source has not updated recently; value may be out of date', unavailable: 'No date from the source' }[f];
    return `<span class="risk-pill ${FRESH_CLS[f]}" title="${tip}">${f === 'current' ? 'as of' : f} ${fmtDate(dateIso)}</span>`;
  }
  window.freshBadge = freshBadge;

  const arrow = (v, invert = false) => {
    if (v == null || Math.abs(v) < 1e-9) return '<span class="mkt-flat">·</span>';
    const up = v > 0;
    const good = invert ? !up : up;
    return `<span class="${good ? 'mkt-up' : 'mkt-down'}">${up ? '▲' : '▼'}</span>`;
  };

  function stripItems(rt) {
    const m = rt.markets || {};
    const items = [];
    const add = (k, fmt, chg, invert) => {
      const x = m[k]; if (!x) return;
      items.push(`<span class="news-strip__item mkt-item" title="${A.escapeAttr(`${x.label}: ${x.source}, ${x.date}`)}"><span class="news-strip__src">${A.escapeText(x.label)}</span> ${fmt(x.value)} ${arrow(x.change, invert)}<span class="mkt-chg">${chg(x)}</span></span>`);
    };
    add('US10Y', v => `${v.toFixed(2)}%`, x => x.change == null ? '' : `${x.change >= 0 ? '+' : ''}${(x.change * 100).toFixed(0)}bp`, true);
    add('BRENT', v => `$${v.toFixed(1)}`, x => x.changePct == null ? '' : `${x.changePct >= 0 ? '+' : ''}${x.changePct.toFixed(1)}%`);
    add('USD_BROAD', v => v.toFixed(1), x => x.changePct == null ? '' : `${x.changePct >= 0 ? '+' : ''}${x.changePct.toFixed(1)}%`);
    add('VIX', v => v.toFixed(1), x => x.change == null ? '' : `${x.change >= 0 ? '+' : ''}${x.change.toFixed(1)}`, true);
    const fx = rt.fx?.values || {};
    for (const [ccy, label, inv] of [['EUR', 'EUR/USD', true], ['JPY', 'USD/JPY', false], ['GBP', 'GBP/USD', true], ['CNY', 'USD/CNY', false], ['INR', 'USD/INR', false]]) {
      const x = fx[ccy]; if (!x) continue;
      // Quoted the conventional way: EUR and GBP as USD per unit, the rest as units per USD.
      const v = inv ? 1 / x.perUsd : x.perUsd;
      const chg = x.change1dPct == null ? null : (inv ? -x.change1dPct : x.change1dPct);
      items.push(`<span class="news-strip__item mkt-item" title="ECB reference rate, ${A.escapeAttr(rt.fx.date)}"><span class="news-strip__src">${label}</span> ${v >= 100 ? v.toFixed(1) : v.toFixed(4)} ${arrow(chg)}<span class="mkt-chg">${chg == null ? '' : `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`}</span></span>`);
    }
    return items;
  }

  window.mountMarketStrip = async function () {
    const el = document.getElementById('market-strip');
    if (!el) return;
    const rt = await load();
    if (!rt || !rt.markets) { el.hidden = true; return; }
    const dates = [...Object.values(rt.markets).map(x => x.date), rt.fx?.date].filter(Boolean).sort();
    const latest = dates.at(-1);
    el.innerHTML = `
      <div class="news-strip__lbl"><span class="news-strip__dot"></span>Markets · daily</div>
      <div class="news-strip__track mkt-track">${stripItems(rt).join('')}</div>
      <div class="mkt-asof" title="Official daily reference data from FRED (U.S. Treasury, EIA, Federal Reserve, Cboe) and the ECB; not tick-by-tick prices.">${freshBadge(latest)}</div>`;
    el.hidden = false;
  };

  // Policy rate + FX for one economy (country profile). Returns '' when nothing is covered.
  window.renderCountryMarkets = function (iso3) {
    const rt = _rt;
    if (!rt) return '';
    const pr = rt.policyRates?.values?.[iso3];
    const ccy = rt.fx?.currencyByIso3?.[iso3];
    const fx = ccy && ccy !== 'USD' ? rt.fx.values?.[ccy] : null;
    if (!pr && !fx) return '';
    const parts = [];
    if (pr) {
      const lc = pr.lastChange;
      // Policy moves are shown in a neutral colour: a hike or cut is not good or bad in itself.
      const move = lc ? ` <span class="mkt-move">${lc.change > 0 ? '▲' : '▼'} ${Math.abs(lc.change * 100).toFixed(0)}bp</span><span class="mkt-sub"> since ${A.escapeText(fmtMonth(lc.after))}</span>` : '';
      parts.push(`<div><div class="profile-hero__stat-lbl">${pr.euroArea ? 'ECB policy rate' : 'Policy rate'}</div><div class="profile-hero__stat-val">${pr.rate.toFixed(2)}%${move}</div></div>`);
    }
    if (fx) {
      const chg = fx.change30dPct;
      parts.push(`<div><div class="profile-hero__stat-lbl">${ccy} per USD</div><div class="profile-hero__stat-val">${fx.perUsd >= 100 ? fx.perUsd.toFixed(1) : fx.perUsd.toFixed(3)}${chg == null ? '' : ` <span class="${chg > 0 ? 'mkt-down-ink' : 'mkt-up-ink'}" title="Positive = ${ccy} weakened against the dollar over 30 days">${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%</span><span class="mkt-sub"> 30d</span>`}</div></div>`);
    }
    const asOf = [pr ? `Policy rate ${freshBadge(pr.date, 'weekly')} · BIS` : '', fx ? `FX ${freshBadge(rt.fx.date)} · ECB` : ''].filter(Boolean).join(' &nbsp; ');
    return `<div class="profile-hero__stats mkt-hero">${parts.join('')}</div><div class="mkt-hero-asof">${asOf}</div>`;
  };

  window.loadRealtime = load;
})();
