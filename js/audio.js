/*
 * VOID RAIDERS - procedural chiptune audio.
 *
 * No sample files: every sound is synthesised with oscillators and a small
 * noise buffer. The AudioContext is created lazily on the first user gesture
 * because browsers refuse to start audio before one.
 */
var Sound = (function () {
  'use strict';

  var ctx = null;
  var master = null;
  var muted = false;
  var noiseBuffer = null;
  var ufoNode = null;
  var marchStep = 0;
  var lastMarch = 0;

  var MARCH_NOTES = [104, 98, 92, 87];

  function init() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.45;
    master.connect(ctx.destination);

    var len = Math.floor(ctx.sampleRate * 0.5);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function resume() {
    if (!ctx) init();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function ready() {
    return ctx && !muted;
  }

  /* A single oscillator blip with an optional pitch sweep. */
  function tone(opts) {
    if (!ready()) return;
    var now = ctx.currentTime + (opts.delay || 0);
    var dur = opts.dur || 0.12;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = opts.type || 'square';
    osc.frequency.setValueAtTime(opts.from, now);
    if (opts.to && opts.to !== opts.from) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), now + dur);
    }
    var vol = opts.vol == null ? 0.2 : opts.vol;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(vol, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  /* Filtered white noise - used for explosions. */
  function noise(opts) {
    if (!ready()) return;
    var now = ctx.currentTime + (opts.delay || 0);
    var dur = opts.dur || 0.2;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(opts.from || 2000, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, opts.to || 200), now + dur);
    var gain = ctx.createGain();
    var vol = opts.vol == null ? 0.25 : opts.vol;
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  var api = {
    init: init,
    resume: resume,

    isMuted: function () { return muted; },

    toggleMute: function () {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.45;
      if (muted) api.ufoStop();
      return muted;
    },

    shoot: function () {
      tone({ type: 'square', from: 880, to: 240, dur: 0.14, vol: 0.14 });
    },

    invaderKilled: function () {
      noise({ from: 3200, to: 300, dur: 0.22, vol: 0.22 });
      tone({ type: 'sawtooth', from: 420, to: 60, dur: 0.22, vol: 0.12 });
    },

    playerKilled: function () {
      noise({ from: 1600, to: 80, dur: 0.75, vol: 0.32 });
      tone({ type: 'sawtooth', from: 300, to: 40, dur: 0.8, vol: 0.18 });
      tone({ type: 'square', from: 180, to: 30, dur: 0.8, vol: 0.12, delay: 0.05 });
    },

    shieldHit: function () {
      noise({ from: 1200, to: 400, dur: 0.08, vol: 0.12 });
    },

    /* The four-note bass loop that speeds up as the fleet thins out. */
    march: function () {
      if (!ready()) return;
      var now = ctx.currentTime;
      if (now - lastMarch < 0.07) return;
      lastMarch = now;
      tone({ type: 'square', from: MARCH_NOTES[marchStep % 4], dur: 0.11, vol: 0.22 });
      marchStep++;
    },

    ufoStart: function () {
      if (!ready() || ufoNode) return;
      var osc = ctx.createOscillator();
      var lfo = ctx.createOscillator();
      var lfoGain = ctx.createGain();
      var gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 620;
      lfo.type = 'sine';
      lfo.frequency.value = 14;
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      gain.gain.value = 0.1;
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      lfo.start();
      ufoNode = { osc: osc, lfo: lfo, gain: gain };
    },

    ufoStop: function () {
      if (!ufoNode) return;
      var n = ufoNode;
      ufoNode = null;
      try {
        n.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.02);
        n.osc.stop(ctx.currentTime + 0.1);
        n.lfo.stop(ctx.currentTime + 0.1);
      } catch (e) { /* already stopped */ }
    },

    ufoKilled: function () {
      api.ufoStop();
      noise({ from: 4000, to: 500, dur: 0.3, vol: 0.2 });
      [740, 880, 1100, 1320].forEach(function (f, i) {
        tone({ type: 'square', from: f, dur: 0.07, vol: 0.16, delay: i * 0.06 });
      });
    },

    extraLife: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone({ type: 'square', from: f, dur: 0.12, vol: 0.18, delay: i * 0.09 });
      });
    },

    levelClear: function () {
      [392, 523, 659, 784, 1047].forEach(function (f, i) {
        tone({ type: 'square', from: f, dur: 0.14, vol: 0.16, delay: i * 0.11 });
      });
    },

    gameOver: function () {
      api.ufoStop();
      [392, 349, 311, 262, 196].forEach(function (f, i) {
        tone({ type: 'sawtooth', from: f, dur: 0.3, vol: 0.18, delay: i * 0.18 });
      });
    },

    start: function () {
      marchStep = 0;
      [262, 330, 392, 523].forEach(function (f, i) {
        tone({ type: 'square', from: f, dur: 0.1, vol: 0.16, delay: i * 0.07 });
      });
    },

    resetMarch: function () { marchStep = 0; }
  };

  return api;
})();
