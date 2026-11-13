(function () {
  const mascots = Array.from(document.querySelectorAll('.sidebar-mascot, .auth-mascot'));
  if (!mascots.length || window.MascotInteractionsInitialized) return;

  const desktop = window.matchMedia('(min-width: 900px)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const stillMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const POKE_ANIMATION = 'mascot-poke';

  window.MascotInteractionsInitialized = true;

  mascots.forEach(function (mascot) {
    const img = mascot.querySelector('img');
    if (!img) return;

    function canAnimate() {
      return (!mascot.matches('.sidebar-mascot') || desktop.matches) && !stillMotion.matches;
    }

    function tiltTo(event) {
      if (!canAnimate() || !finePointer.matches) return;
      const rect = mascot.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const ratioX = (event.clientX - centerX) / (rect.width / 2);
      const ratioY = (event.clientY - centerY) / (rect.height / 2);
      const tilt = Math.max(-8, Math.min(8, ratioX * 7));
      const lift = Math.max(-2, Math.min(0, ratioY * -1.5));
      mascot.style.setProperty('--mascot-tilt', tilt.toFixed(2) + 'deg');
      mascot.style.setProperty('--mascot-lift', lift.toFixed(2) + 'px');
    }

    function resetTilt() {
      mascot.style.removeProperty('--mascot-tilt');
      mascot.style.removeProperty('--mascot-lift');
    }

    function poke() {
      if (!canAnimate()) return;
      mascot.classList.remove('is-poked');
      void mascot.offsetWidth;
      mascot.classList.add('is-poked');
    }

    mascot.addEventListener('pointerenter', tiltTo);
    mascot.addEventListener('pointermove', tiltTo);
    mascot.addEventListener(mascot.matches('.auth-mascot') ? 'click' : 'pointerdown', poke);
    mascot.addEventListener('pointerleave', function () {
      resetTilt();
      mascot.classList.remove('is-poked');
    });

    img.addEventListener('animationend', function (event) {
      if (event.animationName === POKE_ANIMATION) mascot.classList.remove('is-poked');
    });
  });
})();
