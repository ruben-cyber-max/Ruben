/*
 * VOID RAIDERS - boot, integer-scaled letterboxing and touch wiring.
 */
(function () {
  'use strict';

  var canvas = document.getElementById('game');
  var screen = document.getElementById('screen');
  var controls = document.getElementById('touch-controls');

  var marquee = document.querySelector('.marquee');
  var legend = document.querySelector('.legend');

  /*
   * Prefer whole-number scaling: fractional scaling of a 224x256 buffer makes
   * some pixels a device-pixel taller than their neighbours, which shows badly
   * on art drawn a pixel at a time. Below 2x though, rounding down would leave
   * a postage-stamp screen on a phone, so there we take the fractional fit.
   */
  function resize() {
    var used = 16 + 18; // body padding + bezel/shadow allowance
    var gap = 10;
    if (marquee) used += marquee.offsetHeight + gap;
    if (legend && window.getComputedStyle(legend).display !== 'none') used += legend.offsetHeight + gap;
    if (controls.classList.contains('is-active')) used += controls.offsetHeight + gap;

    var availW = window.innerWidth - 24;
    var availH = window.innerHeight - used;

    var scale = Math.min(availW / Game.WIDTH, availH / Game.HEIGHT);
    scale = scale >= 2 ? Math.floor(scale) : Math.max(0.4, scale);

    var w = Math.round(Game.WIDTH * scale);
    var h = Math.round(Game.HEIGHT * scale);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    screen.style.width = w + 'px';
  }

  function isTouchDevice() {
    return ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  }

  function setupTouch() {
    if (!isTouchDevice()) return;
    controls.classList.add('is-active');
    controls.setAttribute('aria-hidden', 'false');
    Input.bindButton(document.getElementById('btn-left'), 'left');
    Input.bindButton(document.getElementById('btn-right'), 'right');
    Input.bindButton(document.getElementById('btn-fire'), 'fire');
    // Tapping the screen also starts a game / dismisses game over.
    screen.addEventListener('touchstart', function (e) {
      e.preventDefault();
      Sound.resume();
    }, { passive: false });
  }

  Input.attach(window);
  // Browsers only allow audio to start inside a user gesture.
  Input.onPress(function () { Sound.resume(); });
  window.addEventListener('pointerdown', function () { Sound.resume(); }, { once: true });

  setupTouch();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  Game.init(canvas);
  resize();
})();
