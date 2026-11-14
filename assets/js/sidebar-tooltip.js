(function () {
  const desktop = window.matchMedia('(min-width: 900px)');
  const selector = '.drawer-item, .drawer-guide-icon, #authLogoutButton, .sidebar-mascot';
  const tooltip = document.createElement('div');
  tooltip.className = 'sidebar-tooltip';
  tooltip.setAttribute('aria-hidden', 'true');
  tooltip.hidden = true;
  document.body.appendChild(tooltip);
  let current = null;
  let savedTitle = '';

  function hide() {
    if (current && savedTitle && !current.hasAttribute('title')) current.setAttribute('title', savedTitle);
    current = null;
    savedTitle = '';
    tooltip.hidden = true;
  }

  function show(target) {
    if (!desktop.matches || !target || target === current) return;
    hide();
    const title = target.getAttribute('title');
    const label = target.classList.contains('sidebar-mascot') ? 'Maskot' : (title || target.getAttribute('aria-label'));
    if (!label) return;
    current = target;
    if (title) {
      if (!target.hasAttribute('aria-label')) target.setAttribute('aria-label', title);
      savedTitle = title;
      target.removeAttribute('title');
    }
    tooltip.textContent = label;
    tooltip.hidden = false;
    const rect = target.getBoundingClientRect();
    const halfHeight = tooltip.getBoundingClientRect().height / 2;
    tooltip.style.left = (rect.right + 10) + 'px';
    tooltip.style.top = Math.max(halfHeight + 4, Math.min(window.innerHeight - halfHeight - 4, rect.top + rect.height / 2)) + 'px';
  }

  document.addEventListener('mouseover', function (event) {
    const target = event.target.closest(selector);
    if (target && !target.contains(event.relatedTarget)) show(target);
  });
  document.addEventListener('mouseout', function (event) {
    if (current && current.contains(event.target) && !current.contains(event.relatedTarget) && !current.matches(':focus-visible')) hide();
  });
  document.addEventListener('focusin', function (event) { show(event.target.closest(selector)); });
  document.addEventListener('focusout', function (event) { if (current === event.target && !current.matches(':hover')) hide(); });
  document.addEventListener('click', function (event) { if (current && current.contains(event.target)) hide(); });
  window.addEventListener('resize', hide);
  document.addEventListener('scroll', hide, true);
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') hide(); });
})();
