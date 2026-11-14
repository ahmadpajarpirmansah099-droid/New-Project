(function () {
  'use strict';
  const system = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  let manual = false;
  function apply(dark) {
    if (dark) document.documentElement.dataset.desktopTheme = 'dark';
    else delete document.documentElement.dataset.desktopTheme;
    const button = document.getElementById('desktopThemeToggle');
    const description = document.getElementById('desktopThemeDescription');
    if (!button || !description) return;
    const label = dark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap';
    button.setAttribute('aria-pressed', String(dark));
    button.setAttribute('aria-label', label);
    button.title = label;
    description.textContent = (dark ? 'Mode gelap' : 'Mode terang') + (manual ? ' · pilihan manual sampai halaman dimuat ulang' : ' · mengikuti sistem');
  }
  apply(!!system?.matches);
  const systemChanged = event => { if (!manual) apply(event.matches); };
  if (system?.addEventListener) system.addEventListener('change', systemChanged);
  else if (system?.addListener) system.addListener(systemChanged);
  function initialize() {
    const button = document.getElementById('desktopThemeToggle');
    if (!button) return;
    apply(document.documentElement.dataset.desktopTheme === 'dark');
    button.addEventListener('click', function () {
      manual = true;
      apply(document.documentElement.dataset.desktopTheme !== 'dark');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
