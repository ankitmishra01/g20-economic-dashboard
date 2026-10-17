// Demo tour for present mode: walks the five-minute storyline with the existing
// strip and pill-button styles. Global Overview → What changed → world map →
// an emerging-market profile → risk radar → Ask AI. Arrow keys move between
// steps, Esc ends the tour. Shown only in present mode (or with ?tour in the URL).

(function () {
  const STEPS = [
    { label: 'Global overview', run: () => goScope('global', 'overview', null) },
    { label: 'What changed', run: () => goScope('global', 'overview', 'overview-what-changed') },
    { label: 'World map', run: () => goScope('global', 'overview', 'overview-map') },
    { label: 'Nigeria profile', run: () => { setScope('global'); navTo('country/NGA'); } },
    { label: 'Risk radar', run: () => goScope('global', 'flags', null) },
    { label: 'Ask AI', run: () => askAI("What does Brazil's latest policy rate move mean for importers?") },
  ];
  let step = -1;

  function setScope(id) { if (window.Scope && Scope.id() !== id) Scope.set(id); }

  // Navigate, then scroll to an element once the page (and any async card) has rendered.
  function goScope(scope, page, targetId) {
    setScope(scope);
    if ((location.hash.replace('#', '') || 'overview') !== page) navTo(page);
    if (!targetId) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    let tries = 0;
    const t = setInterval(() => {
      const el = document.getElementById(targetId);
      if (el || ++tries > 40) {
        clearInterval(t);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 150);
  }

  function askAI(question) {
    const drawer = document.getElementById('agent-drawer');
    if (drawer && !drawer.classList.contains('open') && window.toggleAgentDrawer) window.toggleAgentDrawer();
    const input = document.getElementById('agent-input');
    if (input) { input.value = question; input.focus(); } // the presenter presses Send
  }

  function strip() {
    let el = document.getElementById('tour-strip');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tour-strip';
      el.className = 'news-strip';
      el.setAttribute('aria-label', 'Demo tour');
      const anchor = document.getElementById('market-strip') || document.getElementById('news-strip');
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(el, anchor.nextSibling);
      else document.body.prepend(el);
    }
    return el;
  }

  function render() {
    const el = strip();
    if (step < 0) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.innerHTML = `
      <div class="news-strip__lbl"><span class="news-strip__dot"></span>Demo tour · ${step + 1}/${STEPS.length}</div>
      <div class="news-strip__track" style="gap:6px;align-items:center">
        ${STEPS.map((s, i) => `<button class="pill-btn" ${i === step ? 'aria-pressed="true"' : ''} onclick="tourGo(${i})">${i + 1}. ${A.escapeText(s.label)}</button>`).join('')}
      </div>
      <div style="display:flex;gap:6px;padding:0 10px">
        <button class="pill-btn" onclick="tourGo(${Math.max(0, step - 1)})" aria-label="Previous step">←</button>
        <button class="pill-btn" onclick="tourGo(${Math.min(STEPS.length - 1, step + 1)})" aria-label="Next step">→</button>
        <button class="pill-btn" onclick="tourEnd()">End</button>
      </div>`;
  }

  window.tourGo = function (i) {
    step = Math.max(0, Math.min(STEPS.length - 1, i));
    render();
    STEPS[step].run();
  };
  window.tourEnd = function () { step = -1; render(); };
  window.tourStart = function () { window.tourGo(0); };

  // Tour button next to Present, visible in present mode only.
  function syncButton() {
    const present = document.documentElement.classList.contains('present') || /[?&]tour\b/.test(location.search);
    let btn = document.getElementById('tour-btn');
    const presentBtn = document.getElementById('present-btn');
    if (!btn && presentBtn) {
      btn = document.createElement('button');
      btn.id = 'tour-btn';
      btn.className = 'pill-btn';
      btn.title = 'Walk through the demo storyline (arrow keys to move, Esc to end)';
      btn.textContent = 'Tour';
      btn.onclick = () => (step < 0 ? window.tourStart() : window.tourEnd());
      presentBtn.parentNode.insertBefore(btn, presentBtn.nextSibling);
    }
    // .pill-btn sets display, which overrides the hidden attribute, so toggle display directly.
    if (btn) btn.style.display = present ? '' : 'none';
    if (!present && step >= 0) window.tourEnd();
  }

  document.addEventListener('keydown', (e) => {
    if (step < 0) return;
    const tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); window.tourGo(step + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); window.tourGo(step - 1); }
    else if (e.key === 'Escape') { window.tourEnd(); }
  });

  document.addEventListener('DOMContentLoaded', () => {
    syncButton();
    new MutationObserver(syncButton).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    if (/[?&]tour\b/.test(location.search)) setTimeout(() => window.tourStart(), 1200);
  });
})();
