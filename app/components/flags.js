// Economic Flags view — Direction B design

function renderFlags() {
  const flagged = [];

  for (const country of G20) {
    const badges = [];
    for (const [, cfg] of Object.entries(FLAGS_CONFIG)) {
      const latest = window.G20Data.getLatest(country.iso3, cfg.key);
      if (!latest) continue;
      const v = latest.value;
      const breached = cfg.dir === 'above' ? v >= cfg.threshold : v <= cfg.threshold;
      if (breached) {
        badges.push({ label: cfg.label, value: v, severity: cfg.severity, key: cfg.key, year: latest.year });
      }
    }
    if (badges.length > 0) {
      flagged.push({
        ...country,
        badges,
        worstSeverity: badges.some(b => b.severity === 'high') ? 'high'
                     : badges.some(b => b.severity === 'medium') ? 'medium' : 'low',
      });
    }
  }

  const order = { high: 0, medium: 1, low: 2 };
  flagged.sort((a, b) => order[a.worstSeverity] - order[b.worstSeverity]);
  const healthy = G20.filter(c => !flagged.find(f => f.iso3 === c.iso3));

  return `
<div class="page-body">
  <div class="sec-head">
    <div class="sec-head__title">Risk flags <span class="count">/ ${flagged.length}</span><span class="sec-head__sub">automated · latest data</span></div>
    <div class="sec-head__actions">
      <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-3)">${healthy.length} on track</span>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px">
    <div class="panel">
      <div class="panel__body">
        <div class="kpi-tile__lbl">Flagged countries</div>
        <div class="kpi-tile__val ${flagged.length > 10 ? 'v-neg' : 'v-warn'}" style="font-size:20px;margin:8px 0">${flagged.length}</div>
        <div class="kpi-tile__delta">of ${G20.length} G20 members</div>
      </div>
    </div>
    <div class="panel">
      <div class="panel__body">
        <div class="kpi-tile__lbl">High severity</div>
        <div class="kpi-tile__val v-neg" style="font-size:20px;margin:8px 0">${flagged.filter(c => c.worstSeverity === 'high').length}</div>
        <div class="kpi-tile__delta">contraction or high inflation</div>
      </div>
    </div>
    <div class="panel">
      <div class="panel__body">
        <div class="kpi-tile__lbl">Medium severity</div>
        <div class="kpi-tile__val v-warn" style="font-size:20px;margin:8px 0">${flagged.filter(c => c.worstSeverity === 'medium').length}</div>
        <div class="kpi-tile__delta">high debt or unemployment</div>
      </div>
    </div>
    <div class="panel">
      <div class="panel__body">
        <div class="kpi-tile__lbl">On track</div>
        <div class="kpi-tile__val v-pos" style="font-size:20px;margin:8px 0">${healthy.length}</div>
        <div class="kpi-tile__delta">within normal ranges</div>
      </div>
    </div>
  </div>

  ${flagged.length ? `
  <div class="flags-section">
    <div class="flags-section-title">Flagged — ${flagged.length} countries</div>
    <div class="panel" style="overflow:hidden">
      ${flagged.map((c, i) => `
        <div class="flag-item" onclick="navTo('country/${c.iso3}')">
          <div class="flag-item__rank">${String(i+1).padStart(2,'0')}</div>
          <span class="flag-rect" style="background-image:url('https://flagcdn.com/${c.code.toLowerCase()}.svg');background-size:cover;background-position:center;"></span>
          <div>
            <div class="flag-item__name">${A.escapeText(c.name)}</div>
            <div class="flag-item__desc">${A.escapeText(c.region)}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${c.badges.map(b => `<span class="flag-badge ${b.severity}">${b.label}</span>`).join('')}
          </div>
          <div class="flag-item__val ${c.worstSeverity === 'high' ? 'v-neg' : 'v-warn'}">
            ${c.badges[0]?.value?.toFixed(1) ?? '—'}${c.badges[0]?.key === 'GDP' ? 'T' : '%'}
          </div>
        </div>`).join('')}
    </div>
  </div>` : ''}

  ${healthy.length ? `
  <div class="flags-section">
    <div class="flags-section-title">On track — ${healthy.length} countries</div>
    <div class="panel" style="overflow:hidden">
      ${healthy.map(c => `
        <div class="flag-item" onclick="navTo('country/${c.iso3}')">
          <div class="flag-item__rank"></div>
          <span class="flag-rect" style="background-image:url('https://flagcdn.com/${c.code.toLowerCase()}.svg');background-size:cover;background-position:center;"></span>
          <div>
            <div class="flag-item__name">${A.escapeText(c.name)}</div>
            <div class="flag-item__desc">${A.escapeText(c.region)}</div>
          </div>
          <div><span class="flag-badge low">On track</span></div>
          <div class="flag-item__val v-pos">—</div>
        </div>`).join('')}
    </div>
  </div>` : ''}
</div>`;
}
