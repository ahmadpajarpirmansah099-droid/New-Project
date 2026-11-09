(function () {
  const page = document.getElementById('page-user-guide');
  const root = document.getElementById('userGuideRoot');
  if (!page || !root || window.UserGuideInitialized) return;

  const frame = document.createElement('iframe');
  frame.className = 'ug-frame';
  frame.title = 'Panduan Guest Operational';
  frame.src = 'assets/user-guide-guest-operational.html';
  frame.setAttribute('scrolling', 'auto');

  root.replaceChildren(frame);
  window.UserGuideInitialized = true;
})();