// UI helpers — formatting, icons, colour utilities.

(function (global) {
  const ICON_PATHS = {
    home:          'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
    chart:         'M3 21h18M5 21V8m4 13V13m4 8V5m4 16v-7',
    users:         'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    flag:          'M4 21V4M4 4h12l-2 4 2 4H4',
    inbox:         'M22 12h-6l-2 3h-4l-2-3H2M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    sparkles:      'M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z',
    chevron_right: 'M9 6l6 6-6 6',
    arrow_up:      'M12 19V5M5 12l7-7 7 7',
    arrow_down:    'M12 5v14M5 12l7 7 7-7',
    close:         'M18 6L6 18M6 6l12 12',
    menu:          'M3 6h18M3 12h18M3 18h18',
    search:        'M21 21l-4.35-4.35M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z',
    globe:         'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20',
  };

  function icon(name, size) {
    const d = ICON_PATHS[name] || ICON_PATHS.globe;
    const s = size || 16;
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="${d}"/></svg>`;
  }

  // Deterministic hash 1–8 for avatar colour palette.
  function colorHash(name) {
    if (!name) return 1;
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return (h % 8) + 1;
  }

  // Format a raw GDP number into trillions / billions.
  function fmtGDP(n) {
    if (n == null || isNaN(n)) return '—';
    if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (Math.abs(n) >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`;
    return `$${Math.round(n).toLocaleString()}`;
  }

  function fmtPct(n, decimals) {
    if (n == null || isNaN(n)) return '—';
    return `${n.toFixed(decimals ?? 1)}%`;
  }

  function fmtMillions(n) {
    if (n == null || isNaN(n)) return '—';
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    return n.toLocaleString();
  }

  function fmtThousands(n) {
    if (n == null || isNaN(n)) return '—';
    if (n >= 1000) return `$${Math.round(n / 1000)}K`;
    return `$${Math.round(n)}`;
  }

  function fmtDecimal(n) {
    if (n == null || isNaN(n)) return '—';
    return n.toFixed(1);
  }

  // Format a value by INDICATORS format key.
  function fmtByFormat(value, format) {
    if (value == null || isNaN(value)) return '—';
    switch (format) {
      case 'trillions': return fmtGDP(value);
      case 'percent':   return fmtPct(value);
      case 'thousands': return fmtThousands(value);
      case 'millions':  return fmtMillions(value);
      case 'decimal':   return fmtDecimal(value);
      default:          return String(Math.round(value));
    }
  }

  // Delta badge: +1.2% in green or -0.5% in red.
  function deltaBadge(value, goodDir) {
    if (value == null || isNaN(value)) return '';
    const sign = value >= 0 ? '+' : '';
    const cls = (goodDir === 'up' ? value >= 0 : value <= 0) ? 'badge-good' : 'badge-bad';
    return `<span class="delta-badge ${cls}">${sign}${value.toFixed(1)}</span>`;
  }

  function escapeText(s) {
    return String(s ?? '').replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
  }
  function escapeAttr(s) {
    return String(s ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  global.A = { icon, colorHash, fmtGDP, fmtPct, fmtMillions, fmtThousands, fmtDecimal,
               fmtByFormat, deltaBadge, escapeText, escapeAttr };
})(window);
