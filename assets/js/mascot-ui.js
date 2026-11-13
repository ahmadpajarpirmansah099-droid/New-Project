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

    const isSidebarMascot = mascot.matches('.sidebar-mascot');
    const eyes = isSidebarMascot ? mascot.querySelector('.sidebar-mascot__eyes') : null;
    const animatedFace = mascot.querySelector('.sidebar-mascot__face') || img;
    let blinkTimer = 0;
    let blinkEndTimer = 0;

    function canAnimate() {
      return (!isSidebarMascot || desktop.matches) && !stillMotion.matches;
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

    function resetGaze() {
      if (!eyes) return;
      eyes.style.removeProperty('--gaze-x');
      eyes.style.removeProperty('--gaze-y');
    }

    function moveEyesTowardPointer(event) {
      if (!eyes || !canAnimate() || !finePointer.matches || document.hidden) {
        resetGaze();
        return;
      }

      const rect = mascot.getBoundingClientRect();
      const deltaX = event.clientX - (rect.left + rect.width / 2);
      const deltaY = event.clientY - (rect.top + rect.height / 2);
      const distance = Math.hypot(deltaX, deltaY);
      const glanceRange = 150;

      if (distance < 1 || distance >= glanceRange) {
        resetGaze();
        return;
      }

      const strength = 1 - distance / glanceRange;
      eyes.style.setProperty('--gaze-x', ((deltaX / distance) * 1.25 * strength).toFixed(2) + 'px');
      eyes.style.setProperty('--gaze-y', ((deltaY / distance) * .8 * strength).toFixed(2) + 'px');
    }

    function stopBlinking() {
      window.clearTimeout(blinkTimer);
      window.clearTimeout(blinkEndTimer);
      mascot.classList.remove('is-blinking');
    }

    function scheduleBlink() {
      window.clearTimeout(blinkTimer);
      if (!isSidebarMascot || !eyes || !canAnimate() || document.hidden) return;

      blinkTimer = window.setTimeout(function () {
        if (!canAnimate() || document.hidden) {
          scheduleBlink();
          return;
        }

        mascot.classList.add('is-blinking');
        blinkEndTimer = window.setTimeout(function () {
          mascot.classList.remove('is-blinking');
          scheduleBlink();
        }, 130);
      }, 2800 + Math.random() * 4200);
    }

    function handleMotionPreferenceChange() {
      if (canAnimate()) {
        scheduleBlink();
        return;
      }
      stopBlinking();
      resetGaze();
      resetTilt();
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

    animatedFace.addEventListener('animationend', function (event) {
      if (event.animationName === POKE_ANIMATION) mascot.classList.remove('is-poked');
    });

    if (isSidebarMascot && eyes) {
      window.addEventListener('pointermove', moveEyesTowardPointer, { passive: true });
      window.addEventListener('blur', resetGaze);
      window.addEventListener('pointerout', function (event) {
        if (!event.relatedTarget) resetGaze();
      });
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
          stopBlinking();
          resetGaze();
        } else {
          scheduleBlink();
        }
      });

      function listenForChange(mediaQuery) {
        if (typeof mediaQuery.addEventListener === 'function') {
          mediaQuery.addEventListener('change', handleMotionPreferenceChange);
        } else if (typeof mediaQuery.addListener === 'function') {
          mediaQuery.addListener(handleMotionPreferenceChange);
        }
      }

      listenForChange(desktop);
      listenForChange(stillMotion);
      scheduleBlink();
    }
  });
})();
