// Scroll animations + animated number counters.
// Ported from the Holocene source — IntersectionObserver fade-in + count-up.

(function () {
  // Fade-in elements with .hc-enter when they scroll into view.
  function initScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('hc-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.hc-enter').forEach(el => observer.observe(el));
  }

  // Animated number counters: data-target="14" data-format="raw|trillions|percent"
  function initCounters() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        animateCounter(entry.target);
      });
    }, { threshold: 0.3 });

    document.querySelectorAll('[data-counter]').forEach(el => observer.observe(el));
  }

  function animateCounter(el) {
    const target = parseFloat(el.dataset.target) || 0;
    const format = el.dataset.format || 'raw';
    const duration = 1200;
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const current = target * eased;
      el.textContent = formatCounter(current, format, progress >= 1 ? target : null);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function formatCounter(n, format, final) {
    const v = final !== null ? final : n;
    switch (format) {
      case 'trillions': return `$${(v / 1e12).toFixed(1)}T`;
      case 'percent':   return `${v.toFixed(1)}%`;
      default:          return Math.round(v).toLocaleString();
    }
  }

  window.Motion = { initScrollAnimations, initCounters };
})();
