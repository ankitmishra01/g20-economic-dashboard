// Economic Flags view — countries with red-flag metrics (mirrors Holocene's Flags & Watch page).

function renderFlags() {
  // Compute flags for each G20 country
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
      flagged.push({ ...country, badges, worstSeverity: badges.some(b => b.severity === 'high') ? 'high' : badges.some(b => b.severity === 'medium') ? 'medium' : 'low' });
    }
  }

  // Sort: high severity first, then medium, then low
  const order = { high: 0, medium: 1, low: 2 };
  flagged.sort((a, b) => order[a.worstSeverity] - order[b.worstSeverity]);

  const healthy = G20.filter(c => !flagged.find(f => f.iso3 === c.iso3));

  return `
    <div class="page-head hc-enter">
      <div class="page-head__eyebrow">Risk Monitor</div>
      <h1 class="page-head__title">Economic Flags</h1>
      <p class="page-head__lede">
        Countries breaching key thresholds: inflation above 8%, govt debt above 120% of GDP,
        negative GDP growth, or unemployment above 10%.
      </p>
    </div>

    <div class="kpi-strip hc-enter" style="grid-template-columns:repeat(4,1fr)">
      <div class="kpi-card">
        <div class="kpi-label">Flagged Countries</div>
        <div class="kpi-value" style="color:${flagged.length > 10 ? 'var(--g20-red)' : 'var(--g20-amber)'}">
          ${flagged.length}
        </div>
        <div class="kpi-sub">of ${G20.length} G20 members</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">High Severity</div>
        <div class="kpi-value" style="color:var(--g20-red)">
          ${flagged.filter(c => c.worstSeverity === 'high').length}
        </div>
        <div class="kpi-sub">contraction or very high inflation</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Medium Severity</div>
        <div class="kpi-value" style="color:var(--g20-amber)">
          ${flagged.filter(c => c.worstSeverity === 'medium').length}
        </div>
        <div class="kpi-sub">high debt or unemployment</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">On Track</div>
        <div class="kpi-value" style="color:var(--g20-green)">${healthy.length}</div>
        <div class="kpi-sub">within normal ranges</div>
      </div>
    </div>

    ${flagged.length ? `
      <div class="section-divider hc-enter">
        <span class="section-divider-label">Flagged — ${flagged.length} countries</span>
      </div>
      <div class="flags-grid">
        ${flagged.map(c => `
          <div class="flag-row sev-${c.worstSeverity} hc-enter" onclick="navTo('country/${c.iso3}')">
            <div class="flag-country">
              <span style="font-size:22px">${c.flag}</span>
              <span class="flag-name">${A.escapeText(c.name)}</span>
            </div>
            <div class="flag-badges">
              ${c.badges.map(b => `
                <span class="status-badge ${b.severity}">
                  ${A.escapeText(b.label)}: ${A.fmtPct(b.value)} (${b.year})
                </span>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    ` : `<div class="error-state">No flags detected — all G20 economies within normal ranges.</div>`}

    ${healthy.length ? `
      <div class="section-divider hc-enter" style="margin-top:28px">
        <span class="section-divider-label">On Track — ${healthy.length} countries</span>
      </div>
      <div class="flags-grid">
        ${healthy.map(c => `
          <div class="flag-row hc-enter" style="border-left:3px solid var(--g20-green)" onclick="navTo('country/${c.iso3}')">
            <div class="flag-country">
              <span style="font-size:22px">${c.flag}</span>
              <span class="flag-name">${A.escapeText(c.name)}</span>
            </div>
            <div class="flag-badges">
              <span class="status-badge ok">Within thresholds</span>
            </div>
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;
}
