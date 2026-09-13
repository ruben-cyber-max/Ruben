/*
 * VOID RAIDERS - game rules and rendering.
 *
 * Everything runs on a 224x256 logical canvas (the classic arcade resolution)
 * and is stepped at a fixed 60Hz so behaviour is identical on any display.
 */
var Game = (function () {
  'use strict';

  var W = 224, H = 256;
  var STEP_MS = 1000 / 60;

  var COLS = 11, ROWS = 5;
  var CELL_W = 16, CELL_H = 14;
  var FLEET_MIN_X = 6, FLEET_MAX_X = W - 6;
  var FLEET_STEP_X = 2, FLEET_DROP_Y = 8;

  var PLAYER_Y = 226;
  var PLAYER_SPEED = 1.4;
  var GROUND_Y = 240;
  var SHIELD_Y = 188;
  var HUD_TOP = 6;

  var SHOT_SPEED = 4.2;
  var BOMB_SPEED = 1.9;
  var MAX_BOMBS = 3;
  var EXTRA_LIFE_AT = 1500;

  var C = {
    player: '#57ff6e',
    shield: '#4dff5a',
    ufo: '#ff4f5a',
    shot: '#ffffff',
    bomb: '#ffe66d',
    hud: '#ffffff',
    dim: '#7c8aa0',
    accent: '#59f8ff',
    ground: '#4dff5a'
  };

  // Row 0 is the squid (hardest to hit, worth most), rows 3-4 the octopus.
  var ROW_KINDS = [
    { sprite: 'squid', w: 8, points: 30, color: '#59f8ff' },
    { sprite: 'crab', w: 11, points: 20, color: '#ffffff' },
    { sprite: 'crab', w: 11, points: 20, color: '#ffffff' },
    { sprite: 'octo', w: 12, points: 10, color: '#c58cff' },
    { sprite: 'octo', w: 12, points: 10, color: '#c58cff' }
  ];

  var UFO_POINTS = [50, 100, 150, 200, 300];
  var STATE = {
    ATTRACT: 'attract',
    READY: 'ready',
    PLAY: 'play',
    DEAD: 'dead',
    CLEAR: 'clear',
    OVER: 'over'
  };

  var ctx = null;
  var canvas = null;
  var acc = 0;
  var lastTime = 0;
  var frame = 0;   // simulation frames - stops while paused
  var uiFrame = 0; // render frames - always advances, drives blinking text

  var state, stateTimer, paused;
  var score, hiScore, lives, level, nextExtra;
  var player, shot, bombs, invaders, shields, ufo, booms, stars;
  var fleetX, fleetY, fleetDir, fleetTimer, fleetFrame, aliveCount, fleetBombTimer;

  // ---------------------------------------------------------------- helpers

  function rnd(n) { return Math.floor(Math.random() * n); }

  function pad(n, width) {
    var s = String(n);
    while (s.length < width) s = '0' + s;
    return s;
  }

  function loadHiScore() {
    try {
      var v = parseInt(window.localStorage.getItem('voidraiders.hiscore'), 10);
      return isNaN(v) ? 0 : v;
    } catch (e) { return 0; }
  }

  function saveHiScore(v) {
    try { window.localStorage.setItem('voidraiders.hiscore', String(v)); } catch (e) { /* private mode */ }
  }

  function invaderRect(inv) {
    var kind = ROW_KINDS[inv.row];
    return {
      x: fleetX + inv.col * CELL_W + (CELL_W - kind.w) / 2,
      y: fleetY + inv.row * CELL_H,
      w: kind.w,
      h: 8
    };
  }

  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ------------------------------------------------------------------ setup

  function makeStars() {
    stars = [];
    for (var i = 0; i < 40; i++) {
      stars.push({
        x: rnd(W),
        y: 20 + rnd(H - 60),
        speed: 0.05 + Math.random() * 0.2,
        bright: Math.random()
      });
    }
  }

  function makeShields() {
    shields = [];
    var sw = Sprites.DEFS.shield[0].length;
    var gap = (W - 4 * sw) / 5;
    for (var i = 0; i < 4; i++) {
      shields.push(new Shield(Math.round(gap + i * (sw + gap)), SHIELD_Y, C.shield));
    }
  }

  function makeFleet() {
    invaders = [];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        invaders.push({ row: r, col: c, alive: true });
      }
    }
    aliveCount = invaders.length;
    fleetX = (W - COLS * CELL_W) / 2;
    // Each level the swarm starts lower down, capped so it stays winnable.
    fleetY = 34 + Math.min(level - 1, 6) * 7;
    fleetDir = 1;
    fleetFrame = 0;
    fleetTimer = stepInterval();
    fleetBombTimer = 40;
    Sound.resetMarch();
  }

  /* Frames between fleet steps: fewer invaders (and higher levels) = faster. */
  function stepInterval() {
    var total = COLS * ROWS;
    var t = (aliveCount - 1) / (total - 1); // 1 when full, 0 on the last one
    var base = 2 + 20 * t;
    var levelFactor = 1 + (level - 1) * 0.16;
    return Math.max(1, Math.round(base / levelFactor));
  }

  function resetPlayer() {
    player = { x: 20, y: PLAYER_Y, w: 13, h: 8, alive: true, boomTimer: 0 };
    shot = null;
    bombs = [];
  }

  function startLevel(newGame) {
    if (newGame) {
      score = 0;
      lives = 3;
      level = 1;
      nextExtra = EXTRA_LIFE_AT;
    }
    makeFleet();
    makeShields();
    resetPlayer();
    booms = [];
    ufo = null;
    Sound.ufoStop();
    setState(STATE.READY, 90);
  }

  function setState(s, timer) {
    state = s;
    stateTimer = timer || 0;
  }

  // ----------------------------------------------------------------- update

  function update() {
    frame++;
    updateStars();

    for (var i = booms.length - 1; i >= 0; i--) {
      if (--booms[i].timer <= 0) booms.splice(i, 1);
    }

    if (stateTimer > 0) stateTimer--;

    switch (state) {
      case STATE.ATTRACT: updateAttract(); break;
      case STATE.READY:
        if (stateTimer === 0) setState(STATE.PLAY);
        break;
      case STATE.PLAY: updatePlay(); break;
      case STATE.DEAD: updateDead(); break;
      case STATE.CLEAR: updateClear(); break;
      case STATE.OVER: updateOver(); break;
    }
  }

  function updateStars() {
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      s.y += s.speed;
      if (s.y > H - 18) { s.y = 20; s.x = rnd(W); }
    }
  }

  function updateAttract() {
    // Let the swarm drift on the title screen so the page is never static.
    if (--fleetTimer <= 0) {
      fleetTimer = 14;
      fleetFrame ^= 1;
      fleetX += FLEET_STEP_X * fleetDir;
      if (fleetX < 0 || fleetX > 70) fleetDir = -fleetDir;
    }
    if (Input.pressed('start') || Input.pressed('fire')) {
      Sound.start();
      startLevel(true);
    }
  }

  function updatePlay() {
    updatePlayer();
    updateShot();
    updateFleet();
    updateBombs();
    updateUfo();
  }

  function updateDead() {
    updateFleetDrift();
    updateBombs();
    if (stateTimer === 0) {
      if (lives > 0) {
        resetPlayer();
        setState(STATE.READY, 60);
      } else {
        Sound.gameOver();
        if (score > hiScore) { hiScore = score; saveHiScore(hiScore); }
        setState(STATE.OVER, 120);
      }
    }
  }

  function updateClear() {
    if (stateTimer === 0) {
      level++;
      makeFleet();
      makeShields();
      resetPlayer();
      setState(STATE.READY, 90);
    }
  }

  function updateOver() {
    if (stateTimer === 0 && (Input.pressed('start') || Input.pressed('fire'))) {
      Sound.start();
      startLevel(true);
    }
  }

  function updatePlayer() {
    if (!player.alive) return;
    if (Input.held('left')) player.x -= PLAYER_SPEED;
    if (Input.held('right')) player.x += PLAYER_SPEED;
    if (player.x < 8) player.x = 8;
    if (player.x > W - 8 - player.w) player.x = W - 8 - player.w;

    // Classic rule: only one player shot may be in flight at a time.
    if (Input.held('fire') && !shot) {
      shot = { x: Math.round(player.x + player.w / 2), y: player.y - 4, w: 1, h: 4 };
      Sound.shoot();
    }
  }

  function updateShot() {
    if (!shot) return;
    shot.y -= SHOT_SPEED;
    if (shot.y + shot.h < 20) { shot = null; return; }

    // UFO first, then the fleet, then bunkers.
    if (ufo && overlaps(shot, ufo)) {
      var pts = UFO_POINTS[rnd(UFO_POINTS.length)];
      addScore(pts);
      booms.push({ x: ufo.x, y: ufo.y - 1, sprite: 'boom', color: C.ufo, timer: 22, label: pts, lx: ufo.x + 8, ly: ufo.y });
      Sound.ufoKilled();
      ufo = null;
      shot = null;
      return;
    }

    for (var i = 0; i < invaders.length; i++) {
      var inv = invaders[i];
      if (!inv.alive) continue;
      var r = invaderRect(inv);
      if (!overlaps(shot, r)) continue;
      inv.alive = false;
      aliveCount--;
      addScore(ROW_KINDS[inv.row].points);
      booms.push({ x: r.x + r.w / 2 - 6, y: r.y, sprite: 'boom', color: ROW_KINDS[inv.row].color, timer: 14 });
      Sound.invaderKilled();
      shot = null;
      if (aliveCount === 0) {
        Sound.ufoStop();
        ufo = null;
        addScore(level * 100); // wave-clear bonus
        Sound.levelClear();
        setState(STATE.CLEAR, 130);
      } else {
        fleetTimer = Math.min(fleetTimer, stepInterval());
      }
      return;
    }

    for (var s = 0; s < shields.length; s++) {
      if (shields[s].hitTest(Math.round(shot.x), Math.round(shot.y), shot.w, shot.h, true)) {
        Sound.shieldHit();
        shot = null;
        return;
      }
    }
  }

  function addScore(points) {
    score += points;
    if (score >= nextExtra) {
      lives++;
      nextExtra += 10000;
      Sound.extraLife();
    }
    if (score > hiScore) { hiScore = score; saveHiScore(hiScore); }
  }

  /* Fleet motion used while the player is exploding: keeps marching, no firing. */
  function updateFleetDrift() {
    if (--fleetTimer > 0) return;
    fleetTimer = stepInterval();
    stepFleet();
  }

  function updateFleet() {
    if (--fleetTimer <= 0) {
      fleetTimer = stepInterval();
      stepFleet();
    }
    if (--fleetBombTimer <= 0) {
      dropBomb();
      var base = 95 - level * 8;
      fleetBombTimer = Math.max(18, base / 2 + rnd(Math.max(20, base)));
    }
  }

  function stepFleet() {
    var b = fleetBounds();
    if (!b) return;
    var next = fleetX + FLEET_STEP_X * fleetDir;
    var nextLeft = next + b.minCol * CELL_W;
    var nextRight = next + (b.maxCol + 1) * CELL_W;

    if (nextLeft < FLEET_MIN_X || nextRight > FLEET_MAX_X) {
      fleetDir = -fleetDir;
      fleetY += FLEET_DROP_Y;
      grindShields();
      checkInvasion();
    } else {
      fleetX = next;
    }
    fleetFrame ^= 1;
    Sound.march();
  }

  function fleetBounds() {
    var minCol = COLS, maxCol = -1, maxRow = -1;
    for (var i = 0; i < invaders.length; i++) {
      var inv = invaders[i];
      if (!inv.alive) continue;
      if (inv.col < minCol) minCol = inv.col;
      if (inv.col > maxCol) maxCol = inv.col;
      if (inv.row > maxRow) maxRow = inv.row;
    }
    return maxCol < 0 ? null : { minCol: minCol, maxCol: maxCol, maxRow: maxRow };
  }

  /* Invaders chew through any bunker they walk into. */
  function grindShields() {
    for (var i = 0; i < invaders.length; i++) {
      if (!invaders[i].alive) continue;
      var r = invaderRect(invaders[i]);
      for (var s = 0; s < shields.length; s++) {
        shields[s].eraseRect(Math.round(r.x), Math.round(r.y), r.w, r.h + FLEET_DROP_Y);
      }
    }
  }

  function checkInvasion() {
    var b = fleetBounds();
    if (!b) return;
    var lowest = fleetY + (b.maxRow + 1) * CELL_H;
    if (lowest >= PLAYER_Y) {
      lives = 0;
      killPlayer(true);
    }
  }

  function dropBomb() {
    if (bombs.length >= MAX_BOMBS || aliveCount === 0) return;
    // Only the front-line invader of a column may fire.
    var candidates = [];
    for (var c = 0; c < COLS; c++) {
      var best = null;
      for (var i = 0; i < invaders.length; i++) {
        var inv = invaders[i];
        if (inv.alive && inv.col === c && (!best || inv.row > best.row)) best = inv;
      }
      if (best) candidates.push(best);
    }
    if (!candidates.length) return;

    // Bias towards the column the player is standing in - the fleet aims.
    var pick = candidates[rnd(candidates.length)];
    if (player.alive && Math.random() < 0.35) {
      var px = player.x + player.w / 2;
      var closest = candidates[0];
      var bestDist = Infinity;
      for (var k = 0; k < candidates.length; k++) {
        var rc = invaderRect(candidates[k]);
        var d = Math.abs(rc.x + rc.w / 2 - px);
        if (d < bestDist) { bestDist = d; closest = candidates[k]; }
      }
      pick = closest;
    }

    var r = invaderRect(pick);
    bombs.push({
      x: Math.round(r.x + r.w / 2) - 1,
      y: r.y + r.h,
      w: 3,
      h: 7,
      kind: Math.random() < 0.5 ? 'bombA' : 'bombB'
    });
  }

  function updateBombs() {
    for (var i = bombs.length - 1; i >= 0; i--) {
      var b = bombs[i];
      b.y += BOMB_SPEED;

      if (b.y > GROUND_Y - 4) {
        booms.push({ x: b.x - 5, y: GROUND_Y - 8, sprite: 'boom', color: C.bomb, timer: 10 });
        bombs.splice(i, 1);
        continue;
      }

      var consumed = false;
      for (var s = 0; s < shields.length; s++) {
        if (shields[s].hitTest(Math.round(b.x), Math.round(b.y), b.w, b.h, false)) {
          Sound.shieldHit();
          bombs.splice(i, 1);
          consumed = true;
          break;
        }
      }
      if (consumed) continue;

      // A rising player shot and a falling bomb cancel each other out.
      if (shot && overlaps(b, shot)) {
        booms.push({ x: b.x - 5, y: b.y - 4, sprite: 'boom', color: C.shot, timer: 8 });
        bombs.splice(i, 1);
        shot = null;
        continue;
      }

      if (player.alive && state === STATE.PLAY && overlaps(b, player)) {
        bombs.splice(i, 1);
        killPlayer(false);
      }
    }
  }

  function killPlayer(invaded) {
    if (!player.alive) return;
    player.alive = false;
    lives = Math.max(0, lives - 1);
    Sound.playerKilled();
    Sound.ufoStop();
    ufo = null;
    setState(STATE.DEAD, invaded ? 110 : 100);
  }

  function updateUfo() {
    if (ufo) {
      ufo.x += ufo.dir * 0.7;
      if (ufo.x < -18 || ufo.x > W + 2) {
        ufo = null;
        Sound.ufoStop();
      }
      return;
    }
    // Mystery ship only shows up while there is still a decent swarm left.
    if (aliveCount >= 4 && frame % 7 === 0 && Math.random() < 0.008) {
      var dir = Math.random() < 0.5 ? 1 : -1;
      ufo = { x: dir === 1 ? -16 : W, y: 24, w: 16, h: 7, dir: dir };
      Sound.ufoStart();
    }
  }

  // ----------------------------------------------------------------- render

  function render() {
    uiFrame++;
    ctx.fillStyle = '#05060c';
    ctx.fillRect(0, 0, W, H);

    drawStars();
    drawHud();

    if (state === STATE.ATTRACT) {
      drawAttract();
    } else {
      drawPlayfield();
    }

    if (paused && state !== STATE.ATTRACT) drawBanner('PAUSED', 'PRESS P TO RESUME');
  }

  function drawStars() {
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var tw = (s.bright + Math.sin((frame + i * 9) * 0.05) * 0.25);
      ctx.fillStyle = tw > 0.75 ? '#8ea2c0' : '#2c3550';
      ctx.fillRect(s.x | 0, s.y | 0, 1, 1);
    }
  }

  function drawHud() {
    Sprites.text(ctx, 'SCORE', 8, HUD_TOP, C.dim);
    Sprites.text(ctx, pad(score, 5), 8, HUD_TOP + 9, C.hud);

    Sprites.textCentred(ctx, 'HI-SCORE', W / 2, HUD_TOP, C.dim);
    Sprites.textCentred(ctx, pad(hiScore, 5), W / 2, HUD_TOP + 9, C.accent);

    var lvl = 'LV ' + pad(level, 2);
    Sprites.text(ctx, 'WAVE', W - 8 - Sprites.textWidth('WAVE'), HUD_TOP, C.dim);
    Sprites.text(ctx, lvl, W - 8 - Sprites.textWidth(lvl), HUD_TOP + 9, C.hud);
  }

  function drawPlayfield() {
    // Ground line
    ctx.fillStyle = C.ground;
    ctx.fillRect(0, GROUND_Y, W, 1);

    for (var s = 0; s < shields.length; s++) shields[s].draw(ctx);

    drawInvaders();

    if (ufo) Sprites.draw(ctx, 'ufo', ufo.x, ufo.y, C.ufo);

    if (player.alive) {
      Sprites.draw(ctx, 'player', player.x, player.y, C.player);
    } else if (state === STATE.DEAD) {
      Sprites.draw(ctx, (frame >> 2) % 2 ? 'playerBoom0' : 'playerBoom1', player.x, player.y, C.ufo);
    }

    if (shot) {
      ctx.fillStyle = C.shot;
      ctx.fillRect(Math.round(shot.x), Math.round(shot.y), shot.w, shot.h);
    }

    for (var b = 0; b < bombs.length; b++) {
      var bomb = bombs[b];
      Sprites.draw(ctx, bomb.kind + ((frame >> 2) % 2), bomb.x, bomb.y, C.bomb);
    }

    drawBooms();
    drawLives();

    if (state === STATE.READY) {
      Sprites.textCentred(ctx, 'WAVE ' + pad(level, 2), W / 2, 120, C.accent);
      Sprites.textCentred(ctx, 'GET READY', W / 2, 134, C.hud);
    } else if (state === STATE.CLEAR) {
      Sprites.textCentred(ctx, 'WAVE CLEARED', W / 2, 120, C.accent);
      Sprites.textCentred(ctx, 'BONUS ' + pad(level * 100, 4), W / 2, 134, C.hud);
    } else if (state === STATE.OVER) {
      drawBanner('GAME OVER', score >= hiScore && score > 0 ? 'NEW HI-SCORE!' : 'PRESS FIRE TO PLAY');
    }
  }

  function drawInvaders() {
    for (var i = 0; i < invaders.length; i++) {
      var inv = invaders[i];
      if (!inv.alive) continue;
      var kind = ROW_KINDS[inv.row];
      var r = invaderRect(inv);
      Sprites.draw(ctx, kind.sprite + fleetFrame, r.x, r.y, kind.color);
    }
  }

  function drawBooms() {
    for (var i = 0; i < booms.length; i++) {
      var b = booms[i];
      if (b.label && b.timer < 16) {
        Sprites.textCentred(ctx, String(b.label), b.lx, b.ly, C.ufo);
      } else {
        Sprites.draw(ctx, b.sprite, b.x, b.y, b.color);
      }
    }
  }

  function drawLives() {
    Sprites.text(ctx, String(lives), 8, GROUND_Y + 5, C.dim);
    // Show the spare ships, capped so a long run cannot overflow the row.
    for (var i = 0; i < Math.min(lives, 5); i++) {
      Sprites.draw(ctx, 'player', 20 + i * 16, GROUND_Y + 4, C.player);
    }
  }

  function drawBanner(title, sub) {
    ctx.fillStyle = 'rgba(5,6,12,0.78)';
    ctx.fillRect(0, 108, W, 44);
    ctx.fillStyle = C.dim;
    ctx.fillRect(0, 108, W, 1);
    ctx.fillRect(0, 151, W, 1);
    Sprites.textCentred(ctx, title, W / 2, 116, C.ufo);
    if (uiFrame % 60 < 40) Sprites.textCentred(ctx, sub, W / 2, 134, C.hud);
  }

  function drawAttract() {
    Sprites.textCentred(ctx, 'VOID', W / 2, 40, C.accent, 2);
    Sprites.textCentred(ctx, 'RAIDERS', W / 2, 58, C.player, 2);

    // A short parade of invaders drifts across under the title.
    var parade = ['squid', 'crab', 'crab', 'octo', 'octo', 'crab'];
    for (var p = 0; p < parade.length; p++) {
      var sz = Sprites.size(parade[p] + fleetFrame);
      var kind = parade[p] === 'squid' ? ROW_KINDS[0] : (parade[p] === 'crab' ? ROW_KINDS[1] : ROW_KINDS[3]);
      Sprites.draw(ctx, parade[p] + fleetFrame, fleetX + 24 + p * 18 - sz.w / 2, 84, kind.color);
    }

    var y = 122;
    Sprites.textCentred(ctx, '- SCORE TABLE -', W / 2, y - 16, C.dim);
    var table = [
      { name: 'ufo', color: C.ufo, text: '= ??? POINTS' },
      { name: 'squid0', color: ROW_KINDS[0].color, text: '=  30 POINTS' },
      { name: 'crab0', color: ROW_KINDS[1].color, text: '=  20 POINTS' },
      { name: 'octo0', color: ROW_KINDS[3].color, text: '=  10 POINTS' }
    ];
    for (var i = 0; i < table.length; i++) {
      var row = table[i];
      var size = Sprites.size(row.name);
      Sprites.draw(ctx, row.name, 58 - size.w / 2, y + i * 14, row.color);
      Sprites.text(ctx, row.text, 78, y + i * 14 + 1, C.hud);
    }

    if (uiFrame % 60 < 38) {
      Sprites.textCentred(ctx, 'PRESS FIRE TO START', W / 2, 196, C.accent);
    }
    Sprites.textCentred(ctx, 'ARROWS MOVE    SPACE FIRE', W / 2, 216, C.dim);
    Sprites.textCentred(ctx, 'P PAUSE    M SOUND', W / 2, 228, C.dim);
  }

  // ------------------------------------------------------------------- loop

  function tick(now) {
    if (!lastTime) lastTime = now;
    var delta = now - lastTime;
    lastTime = now;
    // Clamp so a backgrounded tab does not fast-forward the whole game.
    if (delta > 250) delta = 250;
    acc += delta;

    while (acc >= STEP_MS) {
      acc -= STEP_MS;
      handleSystemKeys();
      if (!paused) update();
      Input.clearEdges();
    }

    render();
    window.requestAnimationFrame(tick);
  }

  function handleSystemKeys() {
    if (Input.pressed('pause') && state !== STATE.ATTRACT) {
      paused = !paused;
      if (paused) Sound.ufoStop();
      else if (ufo) Sound.ufoStart();
    }
    if (Input.pressed('mute')) Sound.toggleMute();
  }

  // ------------------------------------------------------------------- init

  function init(canvasEl) {
    canvas = canvasEl;
    canvas.width = W;
    canvas.height = H;
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    hiScore = loadHiScore();
    score = 0;
    lives = 3;
    level = 1;
    nextExtra = EXTRA_LIFE_AT;
    paused = false;

    makeStars();
    makeShields();
    makeFleet();
    resetPlayer();
    booms = [];
    ufo = null;
    fleetX = 0;
    fleetDir = 1;
    fleetTimer = 14;
    setState(STATE.ATTRACT);

    window.requestAnimationFrame(tick);
  }

  return { init: init, WIDTH: W, HEIGHT: H };
})();
