/*
 * VOID RAIDERS - keyboard, touch and gamepad-free input.
 *
 * Exposes a tiny edge-triggered API: held() for continuous movement and
 * pressed() for one-shot actions that must not auto-repeat.
 */
var Input = (function () {
  'use strict';

  var KEY_MAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Space: 'fire', ArrowUp: 'fire', KeyW: 'fire',
    Enter: 'start', NumpadEnter: 'start',
    KeyP: 'pause', Escape: 'pause',
    KeyM: 'mute'
  };

  var held = Object.create(null);
  var edge = Object.create(null);
  var listeners = [];

  function press(action) {
    if (!held[action]) edge[action] = true;
    held[action] = true;
    for (var i = 0; i < listeners.length; i++) listeners[i](action);
  }

  function release(action) {
    held[action] = false;
  }

  function onKeyDown(e) {
    var action = KEY_MAP[e.code];
    if (!action) return;
    e.preventDefault();
    if (e.repeat) return;
    press(action);
  }

  function onKeyUp(e) {
    var action = KEY_MAP[e.code];
    if (!action) return;
    e.preventDefault();
    release(action);
  }

  function bindButton(el, action) {
    if (!el) return;
    var down = function (e) {
      e.preventDefault();
      el.classList.add('is-down');
      press(action);
    };
    var up = function (e) {
      e.preventDefault();
      el.classList.remove('is-down');
      release(action);
    };
    el.addEventListener('touchstart', down, { passive: false });
    el.addEventListener('touchend', up, { passive: false });
    el.addEventListener('touchcancel', up, { passive: false });
    el.addEventListener('mousedown', down);
    el.addEventListener('mouseup', up);
    el.addEventListener('mouseleave', up);
  }

  return {
    attach: function (target) {
      target.addEventListener('keydown', onKeyDown);
      target.addEventListener('keyup', onKeyUp);
      // Losing focus mid-press would otherwise leave a key stuck down.
      window.addEventListener('blur', function () { held = Object.create(null); });
    },
    bindButton: bindButton,
    onPress: function (fn) { listeners.push(fn); },
    held: function (action) { return !!held[action]; },
    pressed: function (action) {
      if (edge[action]) { edge[action] = false; return true; }
      return false;
    },
    clearEdges: function () { edge = Object.create(null); }
  };
})();
