(function () {
  const page = document.getElementById('page-user-guide');
  const root = document.getElementById('userGuideRoot');
  if (!page || !root || window.UserGuideInitialized) return;

  const frame = document.createElement('iframe');
  frame.className = 'ug-frame';
  frame.title = 'Panduan Guest Operational';
  frame.src = 'assets/user-guide-guest-operational.html';
  frame.setAttribute('scrolling', 'auto');

  function syncTheme() {
    try {
      const guide = frame.contentDocument;
      if (!guide?.head || !guide.documentElement) return;
      if (!guide.getElementById('workspace-guide-dark-style')) {
        const link = guide.createElement('link');
        link.id = 'workspace-guide-dark-style'; link.rel = 'stylesheet'; link.href = 'css/user-guide-dark.css?v=1';
        guide.head.appendChild(link);
      }
      const desktop = typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 900px)').matches;
      if (desktop && document.documentElement.dataset.desktopTheme === 'dark') guide.documentElement.dataset.guideDark = 'true';
      else delete guide.documentElement.dataset.guideDark;
    } catch (_) { /* The guide may be unavailable or not same-origin. */ }
  }
  frame.addEventListener('load', syncTheme);
  window.addEventListener('app:desktop-theme-change', syncTheme);
  window.addEventListener('resize', syncTheme);
  root.replaceChildren(frame);
  window.UserGuideInitialized = true;
})();