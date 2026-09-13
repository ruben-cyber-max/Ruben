/*
 * VOID RAIDERS - destructible bunkers.
 *
 * Each bunker owns a 1-bit pixel mask plus a matching offscreen canvas. Hits
 * carve a ragged crater out of both, so damage is genuinely per-pixel rather
 * than a swap between a few pre-drawn damage states.
 */
function Shield(x, y, color) {
  'use strict';
  var rows = Sprites.DEFS.shield;
  this.x = x;
  this.y = y;
  this.w = rows[0].length;
  this.h = rows.length;
  this.color = color;
  this.canvas = document.createElement('canvas');
  this.canvas.width = this.w;
  this.canvas.height = this.h;
  this.ctx = this.canvas.getContext('2d');
  this.mask = new Uint8Array(this.w * this.h);
  this.reset();
}

Shield.prototype.reset = function () {
  var rows = Sprites.DEFS.shield;
  this.ctx.clearRect(0, 0, this.w, this.h);
  this.ctx.fillStyle = this.color;
  for (var y = 0; y < this.h; y++) {
    for (var x = 0; x < this.w; x++) {
      var on = rows[y].charAt(x) === '#' ? 1 : 0;
      this.mask[y * this.w + x] = on;
      if (on) this.ctx.fillRect(x, y, 1, 1);
    }
  }
};

Shield.prototype.solidAt = function (px, py) {
  var x = px - this.x, y = py - this.y;
  if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
  return this.mask[(y | 0) * this.w + (x | 0)] === 1;
};

/* Blow a rough circle of pixels away, with frayed edges for a chewed look. */
Shield.prototype.blast = function (px, py, radius) {
  var cx = px - this.x, cy = py - this.y;
  var r2 = radius * radius;
  for (var y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    if (y < 0 || y >= this.h) continue;
    for (var x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      if (x < 0 || x >= this.w) continue;
      var dx = x - cx, dy = y - cy;
      var d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      // Pixels near the rim only sometimes vanish -> ragged crater edge.
      if (d2 > r2 * 0.55 && Math.random() < 0.4) continue;
      var i = y * this.w + x;
      if (this.mask[i]) {
        this.mask[i] = 0;
        this.ctx.clearRect(x, y, 1, 1);
      }
    }
  }
};

/*
 * Test a projectile's rectangle against the bunker. Returns true (and carves
 * a crater) on contact. Scanning bottom-up for rising shots and top-down for
 * falling ones makes the impact point land on the surface that was struck.
 */
Shield.prototype.hitTest = function (rx, ry, rw, rh, upward) {
  if (rx + rw <= this.x || rx >= this.x + this.w) return false;
  if (ry + rh <= this.y || ry >= this.y + this.h) return false;

  var yStart = upward ? ry : ry + rh - 1;
  var yEnd = upward ? ry + rh - 1 : ry;
  var dir = upward ? 1 : -1;
  for (var y = yStart; upward ? y <= yEnd : y >= yEnd; y += dir) {
    for (var x = rx; x < rx + rw; x++) {
      if (this.solidAt(x, y)) {
        this.blast(x, y, upward ? 3.2 : 3.8);
        return true;
      }
    }
  }
  return false;
};

/* Invaders grind the bunkers away as they descend onto them. */
Shield.prototype.eraseRect = function (rx, ry, rw, rh) {
  var hit = false;
  for (var y = ry; y < ry + rh; y++) {
    for (var x = rx; x < rx + rw; x++) {
      var lx = x - this.x, ly = y - this.y;
      if (lx < 0 || ly < 0 || lx >= this.w || ly >= this.h) continue;
      var i = ly * this.w + lx;
      if (this.mask[i]) {
        this.mask[i] = 0;
        this.ctx.clearRect(lx, ly, 1, 1);
        hit = true;
      }
    }
  }
  return hit;
};

Shield.prototype.draw = function (ctx) {
  ctx.drawImage(this.canvas, this.x, this.y);
};
