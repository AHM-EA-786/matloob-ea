/* Matloob EA — site scripts */
(function () {
  'use strict';

  // ========== THEME TOGGLE ==========
  const html = document.documentElement;
  const themeToggle = document.getElementById('theme-toggle');
  function applyTheme(t) {
    html.setAttribute('data-theme', t);
    localStorage.setItem('matloob-theme', t);
  }
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      const current = html.getAttribute('data-theme') ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });
  }

  // ========== MEGA MENU ==========
  const triggers = document.querySelectorAll('[data-menu-trigger]');
  const scrim = document.getElementById('nav-scrim');
  const menus = {};
  triggers.forEach(function (btn) {
    const name = btn.getAttribute('data-menu-trigger');
    const menu = document.getElementById('mega-' + name);
    if (!menu) return;
    menus[name] = { btn: btn, menu: menu };
  });

  function closeAllMenus() {
    Object.values(menus).forEach(function (m) {
      m.menu.classList.remove('is-open');
      m.btn.setAttribute('aria-expanded', 'false');
    });
    if (scrim) scrim.classList.remove('is-open');
  }

  function openMenu(name) {
    const m = menus[name];
    if (!m) return;
    m.menu.classList.add('is-open');
    m.btn.setAttribute('aria-expanded', 'true');
    if (scrim) scrim.classList.add('is-open');
  }

  // Hover intent + click
  Object.entries(menus).forEach(function ([name, m]) {
    let closeTimer = null;
    function cancelClose() { if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; } }
    function scheduleClose() {
      cancelClose();
      closeTimer = setTimeout(closeAllMenus, 180);
    }
    m.btn.addEventListener('mouseenter', function () { cancelClose(); openMenu(name); });
    m.btn.addEventListener('focus', function () { cancelClose(); openMenu(name); });
    m.btn.addEventListener('mouseleave', scheduleClose);
    m.btn.addEventListener('click', function (e) {
      e.preventDefault();
      const isOpen = m.menu.classList.contains('is-open');
      if (isOpen) closeAllMenus(); else openMenu(name);
    });
    m.menu.addEventListener('mouseenter', cancelClose);
    m.menu.addEventListener('mouseleave', scheduleClose);
  });

  // Close on escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAllMenus();
  });

  // Close when clicking scrim
  if (scrim) scrim.addEventListener('click', closeAllMenus);

  // ========== MOBILE DRAWER ==========
  const mobileToggle = document.getElementById('mobile-toggle');
  const mobileDrawer = document.getElementById('mobile-drawer');
  if (mobileToggle && mobileDrawer) {
    mobileToggle.addEventListener('click', function () {
      const isOpen = mobileDrawer.classList.toggle('is-open');
      mobileToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      mobileDrawer.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    });
    // Close drawer when any link is clicked
    mobileDrawer.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        mobileDrawer.classList.remove('is-open');
        mobileToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // ========== SMOOTH ANCHOR FIX for sticky header ==========
  // Handled via CSS scroll-padding-top, so no JS needed
})();
