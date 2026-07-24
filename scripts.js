// ============================================================
// scripts.js — Insight Chronicles shared JavaScript
// ============================================================

// --- Hamburger menu toggle ---
(function() {
  var hamburger = document.getElementById('hamburger');
  var nav = document.getElementById('mainNav');
  if (hamburger && nav) {
    hamburger.addEventListener('click', function() {
      nav.classList.toggle('open');
      var expanded = nav.classList.contains('open');
      hamburger.setAttribute('aria-expanded', String(expanded));
      hamburger.setAttribute('aria-label', expanded ? 'Close menu' : 'Open menu');
      hamburger.innerHTML = expanded ? '&#10005;' : '&#9776;';
    });
    // Close nav when a link is clicked
    nav.querySelectorAll('a').forEach(function(link) {
      link.addEventListener('click', function() {
        nav.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        hamburger.setAttribute('aria-label', 'Open menu');
        hamburger.innerHTML = '&#9776;';
      });
    });
    // Close nav on Escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        nav.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        hamburger.setAttribute('aria-label', 'Open menu');
        hamburger.innerHTML = '&#9776;';
        hamburger.focus();
      }
    });
  }
})();

// --- Back-to-top button ---
(function() {
  var btn = document.getElementById('backToTop');
  if (!btn) return;
  var ticking = false;
  window.addEventListener('scroll', function() {
    if (!ticking) {
      requestAnimationFrame(function() {
        btn.style.display = window.scrollY > 500 ? 'flex' : 'none';
        ticking = false;
      });
      ticking = true;
    }
  });
  btn.addEventListener('click', function() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();

// --- Reading progress indicator ---
(function() {
  var bar = document.getElementById('readingProgressBar');
  if (!bar) return;
  window.addEventListener('scroll', function() {
    var docH = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    var pct = docH > 0 ? (window.scrollY / docH) * 100 : 0;
    bar.style.width = pct + '%';
  });
})();
