// World heat map (Chart.js + chartjs-chart-geo), shown on Overview and Prosperity
// when the scope is wider than the G20. Built from the existing panel / sec-head
// components and colour tokens; libraries load on first use only.

(function () {
  const GEO_SRC = 'https://cdn.jsdelivr.net/npm/chartjs-chart-geo@4.3.6/build/index.umd.min.js';
  const TOPO_SRC = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json';

  // Indicator → colour direction. 'bad' = high is worse (red), 'good' = high is better
  // (blue), 'div' = diverging around zero (red below, green above).
  const MAP_INDICATORS = {
    GDP_GROWTH:     { label: 'Growth',       dir: 'div',  fmt: v => A.fmtSignedPct(v) },
    INFLATION:      { label: 'CPI',          dir: 'bad',  fmt: v => `${v.toFixed(1)}%` },
    DEBT_GDP:       { label: 'Debt/GDP',     dir: 'bad',  fmt: v => `${v.toFixed(0)}%` },
    UNEMPLOYMENT:   { label: 'Unemployment', dir: 'bad',  fmt: v => `${v.toFixed(1)}%` },
    GDP_CAPITA_PPP: { label: 'GDP/cap PPP',  dir: 'good', fmt: v => `$${Math.round(v / 1000)}K` },
  };

  let _geoLoading = null;
  function loadGeo() {
    if (_geoLoading) return _geoLoading;
    const script = window.ChartGeo ? Promise.resolve() : new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = GEO_SRC; s.async = true; s.onload = res; s.onerror = () => rej(new Error('map library failed to load'));
      document.head.appendChild(s);
    });
    _geoLoading = Promise.all([
      script,
      fetch(TOPO_SRC).then(r => { if (!r.ok) throw new Error('world map shapes failed to load'); return r.json(); }),
      fetch('data/iso-numeric.json').then(r => r.ok ? r.json() : {}),
    ]).then(([, topo, isoNum]) => {
      const G = window.ChartGeo;
      if (G.ChoroplethController) Chart.register(G.ChoroplethController, G.GeoFeature, G.ColorScale, G.ProjectionScale);
      const features = G.topojson.feature(topo, topo.objects.countries).features
        .filter(f => f.properties?.name !== 'Antarctica');
      for (const f of features) f.iso3 = isoNum[String(f.id).padStart(3, '0')] || null;
      return { features };
    });
    _geoLoading.catch(() => { _geoLoading = null; });
    return _geoLoading;
  }

  const css = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  function rgb(hex) {
    const h = hex.replace('#', '');
    if (h.length !== 6) return [128, 128, 128];
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  }
  const mix = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;

  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    const i = (sorted.length - 1) * q;
    const lo = Math.floor(i), hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  }

  window.renderWorldMapPanel = function (id = 'overview-map', key = 'GDP_GROWTH') {
    const tabs = Object.entries(MAP_INDICATORS).map(([k, m]) =>
      `<button class="sec-head__tab${k === key ? ' active' : ''}" onclick="worldMapShow('${id}','${k}',this)">${m.label}</button>`).join('');
    return `
  <div class="sec-head">
    <div class="sec-head__title">World map <span class="count">${A.escapeText(window.Scope ? Scope.label() : 'G20')}</span><span class="sec-head__sub">latest annual value · click an economy for its profile · grey = outside scope or no data</span></div>
    <div class="sec-head__actions">${tabs}</div>
  </div>
  <div class="panel mb-20">
    <div class="panel__body" style="position:relative;height:420px">
      <canvas id="${id}" data-key="${key}" aria-label="World map of the selected indicator" role="img"></canvas>
      <div class="worldmap-status" id="${id}-status">Loading map…</div>
    </div>
    <div class="worldmap-legend" id="${id}-legend"></div>
  </div>`;
  };

  window.worldMapShow = function (id, key, btn) {
    if (btn) btn.parentElement.querySelectorAll('.sec-head__tab').forEach(b => b.classList.toggle('active', b === btn));
    const canvas = document.getElementById(id);
    if (canvas) { canvas.dataset.key = key; mountWorldMap(id); }
  };

  window.mountWorldMap = async function (id = 'overview-map') {
    const canvas = document.getElementById(id);
    if (!canvas || !window.Chart) return;
    const status = document.getElementById(`${id}-status`);
    const key = canvas.dataset.key || 'GDP_GROWTH';
    const meta = MAP_INDICATORS[key];
    let geo;
    try { geo = await loadGeo(); } catch (e) {
      if (status) status.textContent = 'Map unavailable right now.';
      return;
    }
    if (!document.body.contains(canvas)) return; // navigated away while loading

    const scope = new Map(window.G20.map(c => [c.iso3, c]));
    const values = new Map();
    for (const iso3 of scope.keys()) {
      const l = window.G20Data.getLatest(iso3, key, { annualOnly: true });
      if (l && Number.isFinite(l.value)) values.set(iso3, l);
    }
    const sorted = [...values.values()].map(l => l.value).sort((a, b) => a - b);
    // Clip the colour domain to the 5th–95th percentile so one outlier (e.g. hyperinflation)
    // doesn't wash out every other economy; tooltips still show the true value.
    let lo = quantile(sorted, 0.05), hi = quantile(sorted, 0.95);
    if (meta.dir === 'div') { const m = Math.max(Math.abs(lo), Math.abs(hi)) || 1; lo = -m; hi = m; }
    if (hi === lo) hi = lo + 1;

    const base = rgb(css('--bg-3', '#F4F4F1'));
    const neg = rgb(css('--neg', '#B91C1C')), pos = rgb(css('--pos', '#047857')), info = rgb(css('--info', '#1E40AF'));
    const outside = css('--bg-2', '#FAFAF8');
    const rule = css('--rule', '#DEDAD4');
    const colorOf = (v) => {
      const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
      if (meta.dir === 'div') return t < 0.5 ? mix(neg, base, t * 2) : mix(base, pos, (t - 0.5) * 2);
      return mix(base, meta.dir === 'bad' ? neg : info, 0.12 + t * 0.88);
    };

    // Legend: the colour ramp with its capped ends, and which economies sit beyond them.
    const legend = document.getElementById(`${id}-legend`);
    if (legend) {
      const stops = [0, 0.25, 0.5, 0.75, 1].map(t => `${colorOf(lo + t * (hi - lo))} ${t * 100}%`).join(', ');
      const beyond = [...values.entries()].filter(([, l]) => l.value > hi || l.value < lo)
        .sort((a, b) => Math.abs(b[1].value) - Math.abs(a[1].value));
      const name = iso => scope.get(iso)?.name || iso;
      legend.innerHTML = values.size ? `
        <span class="worldmap-legend__end">${meta.fmt(lo)}${sorted[0] < lo ? ' or less' : ''}</span>
        <span class="worldmap-legend__ramp" style="background:linear-gradient(90deg, ${stops})"></span>
        <span class="worldmap-legend__end">${meta.fmt(hi)}${sorted[sorted.length - 1] > hi ? ' or more' : ''}</span>
        <span class="worldmap-legend__note">${beyond.length
          ? `Colours capped at the 5th–95th percentile so outliers don't wash out the map; ${beyond.length} beyond the range, e.g. ${beyond.slice(0, 3).map(([iso, l]) => `${A.escapeText(name(iso))} ${meta.fmt(l.value)}`).join(', ')}.`
          : 'Colour scale spans the 5th–95th percentile.'} Grey: outside scope or no data.</span>` : '';
    }

    const data = geo.features.map(f => {
      const l = f.iso3 && values.get(f.iso3);
      const name = (f.iso3 && scope.get(f.iso3)?.name) || f.properties?.name || f.iso3 || 'Unknown';
      return { feature: f, name, value: l ? l.value : null, year: l?.year, iso3: f.iso3, inScope: !!(f.iso3 && scope.has(f.iso3)) };
    });

    Chart.getChart(canvas)?.destroy();
    if (status) status.textContent = values.size ? '' : 'No data for this scope.';
    new Chart(canvas.getContext('2d'), {
      type: 'choropleth',
      data: {
        labels: data.map(d => d.name),
        datasets: [{
          outline: geo.features,
          data,
          backgroundColor: ctx => {
            const d = ctx.raw;
            return d && d.value != null && d.inScope ? colorOf(d.value) : outside;
          },
          borderColor: rule,
          borderWidth: 0.5,
          hoverBorderColor: css('--text-1', '#0A0A0A'),
        }],
      },
      options: {
        maintainAspectRatio: false,
        showOutline: false,
        showGraticule: false,
        animation: false,
        plugins: {
          legend: { display: false },
          datalabels: { display: false },
          tooltip: {
            callbacks: {
              // The choropleth controller does not fill ctx.label, so read the name from the data point.
              title: items => (items[0]?.raw?.name || ''),
              label: ctx => {
                const d = ctx.raw || {};
                if (!d.inScope) return `${meta.label}: outside scope`;
                return d.value == null ? `${meta.label}: no data` : `${meta.label}: ${meta.fmt(d.value)} (${d.year})`;
              },
            },
          },
        },
        scales: {
          projection: { axis: 'x', projection: 'equalEarth' },
          color: { axis: 'x', display: false },
        },
        onClick: (evt, els) => {
          const d = els?.[0] && data[els[0].index];
          if (d && d.inScope && d.iso3) navTo(`country/${d.iso3}`);
        },
      },
    });
  };
})();
