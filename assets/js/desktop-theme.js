(function () {
  'use strict';
  const button = document.getElementById('desktopThemeToggle');
  const description = document.getElementById('desktopThemeDescription');
  if (!button || !description) return;
  button.addEventListener('click', function () {
    const dark = document.documentElement.dataset.desktopTheme !== 'dark';
    if (dark) document.documentElement.dataset.desktopTheme = 'dark';
    else delete document.documentElement.dataset.desktopTheme;
    const label = dark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap';
    button.setAttribute('aria-pressed', String(dark));
    button.setAttribute('aria-label', label);
    button.title = label;
    description.textContent = (dark ? 'Mode gelap' : 'Mode terang') + ' aktif · berlaku sampai halaman dimuat ulang';
  });
})();
