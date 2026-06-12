/* Super Nico World — main game engine. */
'use strict';

const canvas = document.getElementById('game');
const ctx2d = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const TILE = 32;
const GRAVITY = 2400;
const MAX_FALL = 900;

/* ============================== input ============================== */

const keys = {};
let jumpBufferedAt = -1;

addEventListener('keydown', (e) => {
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault();
  const k = e.key.toLowerCase();
  if (!keys[k] && (k === ' ' || k === 'arrowup' || k === 'w')) jumpBufferedAt = performance.now();
  keys[k] = true;
  if (k === 'p' && game.state === 'play') game.paused = !game.paused;
  if (k === 'm') AudioEngine.toggleMute();
});
addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

const input = {
  get left()  { return keys['arrowleft'] || keys['a']; },
  get right() { return keys['arrowright'] || keys['d']; },
  get jump()  { return keys[' '] || keys['arrowup'] || keys['w']; },
  get run()   { return keys['shift']; },
};

/* ============================== helpers ============================== */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rectsOverlap = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/* ============================== level ============================== */

class Level {
  constructor(def) {
    this.def = def;
    this.rows = def.rows;
    this.h = this.rows.length;
    this.w = Math.max(...this.rows.map(r => r.length));
    this.grid = [];          // mutable tile chars
    this.entitySpawns = [];
    this.flagX = null;
    this.startX = 2 * TILE;
    this.startY = 2 * TILE;

    for (let y = 0; y < this.h; y++) {
      const row = [];
      for (let x = 0; x < this.w; x++) {
        let c = this.rows[y][x] || ' ';
        if (c === 'g' || c === 'k') {
          this.entitySpawns.push({ type: c === 'g' ? 'thornling' : 'curlbug', x: x * TILE, y: y * TILE });
          c = ' ';
        } else if (c === 'S') {
          this.startX = x * TILE; this.startY = y * TILE - TILE;
          c = ' ';
        } else if (c === 'F') {
          if (this.flagX === null) this.flagX = x * TILE;
          this.flagBottom = (y + 1) * TILE;
          c = ' ';
        }
        row.push(c);
      }
      this.grid.push(row);
    }
  }

  tile(tx, ty) {
    if (tx < 0 || tx >= this.w) return '#'; // walls at level edges
    if (ty < 0) return ' ';
    if (ty >= this.h) return ' ';           // fall into pits
    return this.grid[ty][tx];
  }

  isSolid(c) { return '#XB?MY=T|^u'.includes(c) && c !== ' '; }
  isPlatform(c) { return c === '='; }       // one-way

  solidAt(tx, ty) {
    const c = this.tile(tx, ty);
    return this.isSolid(c) && !this.isPlatform(c);
  }

  set(tx, ty, c) {
    if (tx >= 0 && tx < this.w && ty >= 0 && ty < this.h) this.grid[ty][tx] = c;
  }
}

/* ============================== entities ============================== */

class Entity {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.vx = 0; this.vy = 0;
    this.onGround = false;
    this.dead = false;
    this.remove = false;
  }

  // Tile-based AABB movement, returns which sides hit.
  moveAndCollide(level, dt, { oneWay = true } = {}) {
    const hit = { left: false, right: false, up: false, down: false };

    // horizontal
    this.x += this.vx * dt;
    if (this.vx > 0) {
      const tx = Math.floor((this.x + this.w) / TILE);
      for (let ty = Math.floor(this.y / TILE); ty <= Math.floor((this.y + this.h - 1) / TILE); ty++) {
        if (level.solidAt(tx, ty)) { this.x = tx * TILE - this.w - 0.01; this.vx = 0; hit.right = true; break; }
      }
    } else if (this.vx < 0) {
      const tx = Math.floor(this.x / TILE);
      for (let ty = Math.floor(this.y / TILE); ty <= Math.floor((this.y + this.h - 1) / TILE); ty++) {
        if (level.solidAt(tx, ty)) { this.x = (tx + 1) * TILE + 0.01; this.vx = 0; hit.left = true; break; }
      }
    }

    // vertical
    const prevBottom = this.y + this.h;
    this.y += this.vy * dt;
    this.onGround = false;
    if (this.vy > 0) {
      const ty = Math.floor((this.y + this.h) / TILE);
      for (let tx = Math.floor((this.x + 1) / TILE); tx <= Math.floor((this.x + this.w - 1) / TILE); tx++) {
        const c = level.tile(tx, ty);
        const solid = level.solidAt(tx, ty);
        const platform = oneWay && level.isPlatform(c) && prevBottom <= ty * TILE + 1;
        if (solid || platform) {
          this.y = ty * TILE - this.h - 0.01; this.vy = 0;
          this.onGround = true; hit.down = true; break;
        }
      }
    } else if (this.vy < 0) {
      const ty = Math.floor(this.y / TILE);
      for (let tx = Math.floor((this.x + 1) / TILE); tx <= Math.floor((this.x + this.w - 1) / TILE); tx++) {
        if (level.solidAt(tx, ty)) {
          this.y = (ty + 1) * TILE + 0.01; this.vy = 0;
          hit.up = true; hit.upTile = { tx, ty }; break;
        }
      }
    }
    return hit;
  }

  get rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
}

/* ------------------------------ player ------------------------------ */

class Player extends Entity {
  constructor(x, y) {
    super(x, y, 22, 28);
    this.big = false;
    this.facing = 1;
    this.runTime = 0;
    this.coyoteUntil = 0;
    this.invulnUntil = 0;
    this.squash = 1;       // visual squash & stretch
    this.dying = false;
    this.glydon = false;     // riding the flying Glydon?
    this.flying = false;
  }

  setBig(big) {
    if (big === this.big) return;
    const bottom = this.y + this.h;
    this.big = big;
    this.h = big ? 42 : 28;
    this.y = bottom - this.h;
  }

  update(level, dt, game) {
    if (this.dying) {
      this.vy += GRAVITY * dt;
      this.y += this.vy * dt;
      return;
    }

    const accel = this.onGround ? 2800 : 1800;
    let maxSpeed = input.run ? 340 : 220;
    if (this.glydon) maxSpeed += 50;

    if (input.left)  { this.vx -= accel * dt; this.facing = -1; }
    if (input.right) { this.vx += accel * dt; this.facing = 1; }
    if (!input.left && !input.right) {
      const fr = this.onGround ? 2400 : 600;
      if (this.vx > 0) this.vx = Math.max(0, this.vx - fr * dt);
      else this.vx = Math.min(0, this.vx + fr * dt);
    }
    this.vx = clamp(this.vx, -maxSpeed, maxSpeed);

    // jumping: coyote time + buffered input + variable height
    const now = performance.now();
    if (this.onGround) this.coyoteUntil = now + 90;
    const wantsJump = now - jumpBufferedAt < 120;
    if (wantsJump && (this.onGround || now < this.coyoteUntil)) {
      this.vy = this.glydon ? -800 : -760;
      this.coyoteUntil = 0;
      jumpBufferedAt = -1;
      this.squash = 1.25;
      AudioEngine.sfx.jump();
      game.spawnDust(this.x + this.w / 2, this.y + this.h, 4);
    }

    // Glydon flight: hold jump in the air to flap and soar
    this.flying = false;
    if (this.glydon && !this.onGround && input.jump) {
      this.vy -= 5200 * dt;
      this.vy = Math.max(this.vy, -300);
      this.flying = true;
      if (Math.random() < 8 * dt) {
        game.particles.add({ x: this.x + this.w / 2 - this.facing * 14, y: this.y + this.h,
          vx: -this.facing * 40, vy: 60, life: 0.5, size: 3, color: 'rgba(255,255,255,0.8)' });
      }
    }
    if (!this.glydon && !input.jump && this.vy < -260) this.vy = -260; // cut jump short
    if (this.y < -TILE * 1.5) { this.y = -TILE * 1.5; this.vy = Math.max(this.vy, 0); } // sky ceiling

    this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL);

    const wasAirborne = !this.onGround;
    const hit = this.moveAndCollide(level, dt);

    if (hit.down && wasAirborne) {
      this.squash = 0.75;
      game.spawnDust(this.x + this.w / 2, this.y + this.h, 6);
    }
    if (hit.up && hit.upTile) game.hitBlock(hit.upTile.tx, hit.upTile.ty, this);

    this.squash = lerp(this.squash, 1, 12 * dt);
    if (Math.abs(this.vx) > 10 && this.onGround) this.runTime += dt * Math.abs(this.vx) / 60;

    // fell into a pit
    if (this.y > level.h * TILE + 100) game.killPlayer(true);
  }

  hurt(game) {
    if (performance.now() < this.invulnUntil || this.dying) return;
    if (this.glydon) {
      // the Glydon panics and runs off — chase it to remount!
      this.glydon = false;
      const runaway = new Glydon(this.x + this.facing * -10, this.y);
      runaway.rising = false;
      runaway.vx = -this.facing * 120;
      runaway.shyUntil = performance.now() + 900;
      game.items.push(runaway);
      this.invulnUntil = performance.now() + 1800;
      AudioEngine.sfx.hurt();
    } else if (this.big) {
      this.setBig(false);
      this.invulnUntil = performance.now() + 1800;
      AudioEngine.sfx.hurt();
    } else {
      game.killPlayer();
    }
  }

  draw(g, t) {
    if (performance.now() < this.invulnUntil && Math.floor(t * 16) % 2 === 0) return;

    const cx = this.x + this.w / 2;
    let bottom = this.y + this.h;
    const sw = this.w * (2 - this.squash) * 0.95;
    const sh = this.h * this.squash;

    if (this.glydon) {
      drawGlydonBody(g, cx + this.facing * 2, this.y + this.h, this.facing, t, this.flying);
      bottom -= 13; // sit in the saddle
    }

    g.save();
    g.translate(cx, bottom);
    g.scale(this.facing, 1);

    // Nico the explorer — original design: teal tunic, amber scarf, headband.
    const skin = '#f1c197', tunic = '#17a08c', tunicDk = '#0f7a6a',
          scarf = '#ff8c42', pants = '#6b4a2b', boot = '#3f2a17',
          hair = '#5a3a1c', band = '#ff8c42';
    const legSwing = this.onGround && Math.abs(this.vx) > 10
      ? Math.sin(this.runTime * 14) * 6 : (this.onGround ? 0 : 4);
    const armSwing = -legSwing;

    // flowing scarf tail behind
    g.fillStyle = scarf;
    g.beginPath();
    g.moveTo(-sw * 0.3, -sh * 0.66);
    g.quadraticCurveTo(-sw * 0.7, -sh * 0.6 + armSwing * 0.4, -sw * 0.62, -sh * 0.4);
    g.quadraticCurveTo(-sw * 0.5, -sh * 0.52, -sw * 0.28, -sh * 0.52);
    g.fill();

    // legs
    g.fillStyle = pants;
    g.fillRect(-sw * 0.32 + legSwing * 0.4, -sh * 0.32, sw * 0.3, sh * 0.32);
    g.fillRect(sw * 0.02 - legSwing * 0.4, -sh * 0.32, sw * 0.3, sh * 0.32);
    // boots
    g.fillStyle = boot;
    g.fillRect(-sw * 0.37 + legSwing * 0.4, -sh * 0.1, sw * 0.4, sh * 0.1);
    g.fillRect(sw * 0.0 - legSwing * 0.4, -sh * 0.1, sw * 0.4, sh * 0.1);
    // tunic torso
    g.fillStyle = tunic;
    g.beginPath();
    g.moveTo(-sw * 0.4, -sh * 0.72);
    g.lineTo(sw * 0.4, -sh * 0.72);
    g.lineTo(sw * 0.34, -sh * 0.3);
    g.lineTo(-sw * 0.34, -sh * 0.3);
    g.fill();
    // belt
    g.fillStyle = boot;
    g.fillRect(-sw * 0.36, -sh * 0.42, sw * 0.72, sh * 0.07);
    g.fillStyle = '#ffd95e';
    g.fillRect(-sw * 0.06, -sh * 0.43, sw * 0.12, sh * 0.09);
    // tunic shading
    g.fillStyle = tunicDk;
    g.fillRect(-sw * 0.34, -sh * 0.5, sw * 0.68, sh * 0.06);
    // arms + bare hands
    g.fillStyle = tunic;
    g.fillRect(-sw * 0.52, -sh * 0.68 + armSwing * 0.3, sw * 0.16, sh * 0.28);
    g.fillRect(sw * 0.36, -sh * 0.68 - armSwing * 0.3, sw * 0.16, sh * 0.28);
    g.fillStyle = skin;
    g.beginPath();
    g.arc(-sw * 0.44, -sh * 0.4 + armSwing * 0.3, sw * 0.09, 0, Math.PI * 2);
    g.arc(sw * 0.44, -sh * 0.4 - armSwing * 0.3, sw * 0.09, 0, Math.PI * 2);
    g.fill();
    // scarf knot around neck
    g.fillStyle = scarf;
    g.fillRect(-sw * 0.3, -sh * 0.74, sw * 0.6, sh * 0.1);
    // head
    g.fillStyle = skin;
    g.beginPath();
    g.arc(0, -sh * 0.86, sw * 0.34, 0, Math.PI * 2);
    g.fill();
    // tousled hair + sideburn
    g.fillStyle = hair;
    g.beginPath();
    g.arc(0, -sh * 0.92, sw * 0.36, Math.PI, 0);
    g.fill();
    g.beginPath();
    g.moveTo(-sw * 0.34, -sh * 0.96);
    g.lineTo(-sw * 0.18, -sh * 1.12);
    g.lineTo(-sw * 0.06, -sh * 0.98);
    g.lineTo(sw * 0.08, -sh * 1.14);
    g.lineTo(sw * 0.2, -sh * 0.98);
    g.lineTo(sw * 0.34, -sh * 1.06);
    g.lineTo(sw * 0.36, -sh * 0.9);
    g.lineTo(-sw * 0.36, -sh * 0.9);
    g.fill();
    g.fillRect(-sw * 0.36, -sh * 0.86, sw * 0.08, sh * 0.12); // sideburn
    // headband across forehead
    g.fillStyle = band;
    g.fillRect(-sw * 0.37, -sh * 0.95, sw * 0.74, sh * 0.08);
    g.fillStyle = '#ffd95e';
    g.beginPath();
    g.arc(-sw * 0.02, -sh * 0.91, sw * 0.06, 0, Math.PI * 2);
    g.fill();
    // headband tail fluttering back
    g.fillStyle = band;
    g.beginPath();
    g.moveTo(-sw * 0.34, -sh * 0.93);
    g.quadraticCurveTo(-sw * 0.56, -sh * 0.9 + armSwing * 0.3, -sw * 0.5, -sh * 0.8);
    g.quadraticCurveTo(-sw * 0.42, -sh * 0.88, -sw * 0.32, -sh * 0.88);
    g.fill();
    // eye + smile
    g.fillStyle = '#222';
    g.beginPath();
    g.arc(sw * 0.16, -sh * 0.86, 2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#a85b3a'; g.lineWidth = 1.4;
    g.beginPath();
    g.arc(sw * 0.16, -sh * 0.78, sw * 0.1, 0.1, Math.PI - 0.6);
    g.stroke();

    g.restore();
  }
}

/* ------------------------------ enemies ------------------------------ */

class Thornling extends Entity {
  constructor(x, y) {
    super(x + 4, y + 8, 24, 24);
    this.vx = -55;
    this.squashT = 0;
  }
  update(level, dt) {
    if (this.squashT > 0) {
      this.squashT -= dt;
      if (this.squashT <= 0) this.remove = true;
      return;
    }
    this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL);
    const dir = Math.sign(this.vx) || -1;
    const hit = this.moveAndCollide(level, dt);
    if (hit.left) this.vx = 55;
    if (hit.right) this.vx = -55;
    // turn at ledges
    if (this.onGround) {
      const aheadX = dir > 0 ? this.x + this.w + 2 : this.x - 2;
      const tx = Math.floor(aheadX / TILE);
      const ty = Math.floor((this.y + this.h + 4) / TILE);
      if (!level.solidAt(tx, ty) && !level.isPlatform(level.tile(tx, ty))) this.vx = -this.vx || -55;
      if (this.vx === 0) this.vx = 55 * -dir;
    }
    if (this.y > level.h * TILE + 200) this.remove = true;
  }
  stomp() { this.squashT = 0.35; this.vx = 0; this.dead = true; }
  // "Thornling": a grumpy spiky burr-creature on stubby feet (original design).
  draw(g, t) {
    const squish = this.squashT > 0 ? 0.35 : 1;
    const cx = this.x + this.w / 2, bottom = this.y + this.h;
    const w = this.w * (this.squashT > 0 ? 1.3 : 1), h = this.h * squish;
    const cy = bottom - h * 0.5;
    const wob = this.dead ? 0 : Math.sin(t * 9 + this.x) * 1.5;
    // spikes radiating out
    g.fillStyle = '#5a3c1f';
    const spikes = 9, rx = w * 0.46, ry = h * 0.46;
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * Math.PI * 2 - Math.PI / 2;
      const sx = cx + Math.cos(a) * rx, sy = cy + Math.sin(a) * ry;
      const ox = cx + Math.cos(a) * rx * 1.45, oy = cy + Math.sin(a) * ry * 1.45;
      const pa = a + 0.22;
      g.beginPath();
      g.moveTo(cx + Math.cos(a - 0.22) * rx, cy + Math.sin(a - 0.22) * ry);
      g.lineTo(ox, oy);
      g.lineTo(cx + Math.cos(pa) * rx, cy + Math.sin(pa) * ry);
      g.fill();
    }
    // body
    const grad = g.createRadialGradient(cx - w * 0.12, cy - h * 0.15, 2, cx, cy, w * 0.5);
    grad.addColorStop(0, '#9a6a38');
    grad.addColorStop(1, '#6e4622');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(cx, cy, w * 0.46, h * 0.46, 0, 0, Math.PI * 2);
    g.fill();
    // feet
    g.fillStyle = '#4a2f17';
    g.beginPath();
    g.ellipse(cx - w * 0.24 + wob, bottom - 2, w * 0.16, 3.5 * squish, 0, 0, Math.PI * 2);
    g.ellipse(cx + w * 0.24 - wob, bottom - 2, w * 0.16, 3.5 * squish, 0, 0, Math.PI * 2);
    g.fill();
    if (!this.dead) {
      // eyes
      g.fillStyle = '#fff4d8';
      g.beginPath();
      g.ellipse(cx - 5, cy - h * 0.05, 4, 5, 0, 0, Math.PI * 2);
      g.ellipse(cx + 5, cy - h * 0.05, 4, 5, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#c0392b';
      g.beginPath();
      g.arc(cx - 4, cy, 1.8, 0, Math.PI * 2);
      g.arc(cx + 4, cy, 1.8, 0, Math.PI * 2);
      g.fill();
      // angry brows
      g.strokeStyle = '#3d2410'; g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx - 9, cy - h * 0.22); g.lineTo(cx - 1, cy - h * 0.12);
      g.moveTo(cx + 9, cy - h * 0.22); g.lineTo(cx + 1, cy - h * 0.12);
      g.stroke();
      // little frown
      g.beginPath(); g.lineWidth = 1.5;
      g.arc(cx, cy + h * 0.18, 3, Math.PI + 0.4, -0.4); g.stroke();
    }
  }
}

class Curlbug extends Entity {
  constructor(x, y) {
    super(x + 4, y + 4, 24, 28);
    this.vx = -70;
    this.shell = false;
    this.shellSpeed = 0;
  }
  update(level, dt) {
    this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL);
    const hit = this.moveAndCollide(level, dt);
    const speed = this.shell ? Math.abs(this.shellSpeed) : 70;
    if (this.shell) {
      if (hit.left) { this.vx = speed; AudioEngine.sfx.bump(); }
      if (hit.right) { this.vx = -speed; AudioEngine.sfx.bump(); }
    } else {
      if (hit.left) this.vx = 70;
      if (hit.right) this.vx = -70;
      if (this.onGround) {
        const dir = Math.sign(this.vx) || -1;
        const tx = Math.floor((dir > 0 ? this.x + this.w + 2 : this.x - 2) / TILE);
        const ty = Math.floor((this.y + this.h + 4) / TILE);
        if (!level.solidAt(tx, ty) && !level.isPlatform(level.tile(tx, ty))) this.vx = -dir * 70;
      }
    }
    if (this.y > level.h * TILE + 200) this.remove = true;
  }
  stomp(player) {
    if (!this.shell) {
      this.shell = true;
      this.vx = 0; this.shellSpeed = 0;
      this.h = 20; this.y += 8;
    } else if (this.vx !== 0) {
      this.vx = 0; this.shellSpeed = 0;
    } else {
      this.kick(player);
    }
  }
  kick(player) {
    const dir = player.x + player.w / 2 < this.x + this.w / 2 ? 1 : -1;
    this.shellSpeed = 420 * dir;
    this.vx = this.shellSpeed;
    AudioEngine.sfx.kick();
  }
  get moving() { return this.shell && this.vx !== 0; }
  // "Curlbug": an armored pillbug that curls into a rolling ball when stomped.
  draw(g, t) {
    const cx = this.x + this.w / 2, bottom = this.y + this.h;
    const armor = '#5f7c93', armorDk = '#3c566b', armorLt = '#9fb6c8';
    if (this.shell) {
      // curled armored ball with segmented plates
      const spin = this.moving ? t * 16 : 0;
      g.save();
      g.translate(cx, bottom - 10);
      g.rotate(spin);
      const rg = g.createRadialGradient(-3, -3, 2, 0, 0, 12);
      rg.addColorStop(0, armorLt);
      rg.addColorStop(1, armorDk);
      g.fillStyle = rg;
      g.beginPath();
      g.arc(0, 0, 12, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = armorDk; g.lineWidth = 1.6;
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(i * 4.2, -Math.sqrt(Math.max(0, 144 - (i * 4.2) ** 2)));
        g.lineTo(i * 4.2, Math.sqrt(Math.max(0, 144 - (i * 4.2) ** 2)));
        g.stroke();
      }
      g.restore();
    } else {
      const wob = Math.sin(t * 8 + this.x) * 1.5;
      const dir = Math.sign(this.vx) || -1;
      // little legs
      g.fillStyle = armorDk;
      for (let i = -1; i <= 1; i++) g.fillRect(cx + i * 7 - 1.5 + wob, bottom - 5, 3, 5);
      // segmented armored back
      const grad = g.createLinearGradient(0, bottom - 26, 0, bottom - 6);
      grad.addColorStop(0, armorLt);
      grad.addColorStop(1, armor);
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(cx, bottom - 13, 12, 11, 0, Math.PI, 0);
      g.fill();
      g.fillRect(cx - 12, bottom - 13, 24, 6);
      g.strokeStyle = armorDk; g.lineWidth = 1.3;
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(cx + i * 4.6, bottom - 13 - Math.sqrt(Math.max(0, 121 - (i * 4.6) ** 2)));
        g.lineTo(cx + i * 4.6, bottom - 7);
        g.stroke();
      }
      // head with antennae
      g.fillStyle = '#8a9aa8';
      g.beginPath();
      g.ellipse(cx + dir * 11, bottom - 12, 5.5, 6, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#8a9aa8'; g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(cx + dir * 13, bottom - 16); g.lineTo(cx + dir * 17, bottom - 20);
      g.moveTo(cx + dir * 13, bottom - 14); g.lineTo(cx + dir * 18, bottom - 15);
      g.stroke();
      g.fillStyle = '#222';
      g.beginPath();
      g.arc(cx + dir * 12.5, bottom - 12, 1.6, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/* ------------------------------ sunfruit ------------------------------ */

class Sunfruit extends Entity {
  constructor(x, y) {
    super(x + 4, y, 24, 24);
    this.vx = 90;
    this.riseFrom = y + TILE;
    this.rising = true;
  }
  update(level, dt) {
    if (this.rising) {
      this.y -= 40 * dt;
      if (this.y <= this.riseFrom - TILE) { this.rising = false; }
      return;
    }
    this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL);
    const hit = this.moveAndCollide(level, dt);
    if (hit.left) this.vx = 90;
    if (hit.right) this.vx = -90;
    if (this.y > level.h * TILE + 200) this.remove = true;
  }
  // "Sunfruit": a glowing growth fruit (original power-up design).
  draw(g, t) {
    const cx = this.x + this.w / 2, bottom = this.y + this.h;
    const cy = bottom - 11;
    const pulse = 0.7 + 0.3 * Math.sin((t || 0) * 6);
    // glow halo
    const halo = g.createRadialGradient(cx, cy, 2, cx, cy, 18);
    halo.addColorStop(0, `rgba(255,180,80,${0.5 * pulse})`);
    halo.addColorStop(1, 'rgba(255,180,80,0)');
    g.fillStyle = halo;
    g.fillRect(cx - 18, cy - 18, 36, 36);
    // fruit body (two-lobed, amber to orange)
    const grad = g.createRadialGradient(cx - 3, cy - 4, 2, cx, cy, 11);
    grad.addColorStop(0, '#ffd95e');
    grad.addColorStop(1, '#f6781f');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx - 4, cy, 7, 0, Math.PI * 2);
    g.arc(cx + 4, cy, 7, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(cx, cy + 3, 9, 7, 0, 0, Math.PI * 2);
    g.fill();
    // shine
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath();
    g.ellipse(cx - 4, cy - 4, 2.4, 3.4, -0.5, 0, Math.PI * 2);
    g.fill();
    // stem + leaf
    g.strokeStyle = '#6b4a2b'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx, cy - 6); g.lineTo(cx, cy - 11); g.stroke();
    g.fillStyle = '#3fbf52';
    g.beginPath();
    g.ellipse(cx + 4, cy - 11, 5, 2.6, -0.6, 0, Math.PI * 2);
    g.fill();
  }
}

/* ------------------------------ glydon ------------------------------ */

class Glydon extends Entity {
  constructor(x, y) {
    super(x, y, 28, 26);
    this.vx = 60;
    this.riseFrom = y + TILE;
    this.rising = true;
    this.shyUntil = 0;   // can't be re-mounted right after a dismount
  }
  update(level, dt) {
    if (this.rising) {
      this.y -= 40 * dt;
      if (this.y <= this.riseFrom - TILE) this.rising = false;
      return;
    }
    this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL);
    const hit = this.moveAndCollide(level, dt);
    if (hit.left) this.vx = Math.abs(this.vx);
    if (hit.right) this.vx = -Math.abs(this.vx);
    // turn at ledges so the Glydon waits around to be caught
    if (this.onGround) {
      const dir = Math.sign(this.vx) || 1;
      const tx = Math.floor((dir > 0 ? this.x + this.w + 2 : this.x - 2) / TILE);
      const ty = Math.floor((this.y + this.h + 4) / TILE);
      if (!level.solidAt(tx, ty) && !level.isPlatform(level.tile(tx, ty))) this.vx = -dir * Math.abs(this.vx || 60);
    }
    if (this.y > level.h * TILE + 200) this.remove = true;
  }
  draw(g, t) {
    drawGlydonBody(g, this.x + this.w / 2, this.y + this.h, Math.sign(this.vx) || 1, t, false);
  }
}

// "Glydon" — the rideable winged sky-glider (original creature design).
// Shared renderer used both by the loose item and while being ridden.
function drawGlydonBody(g, cx, bottom, facing, t, flying) {
  g.save();
  g.translate(cx, bottom);
  g.scale(facing, 1);

  const body = '#9b7ede', bodyDk = '#7a5cc0', belly = '#f1e7ff',
        wing = '#b9a3ee', wingTip = '#5ad1c8';
  const step = Math.sin(t * 12) * 2;

  // far wing (behind body)
  const flap = flying ? Math.sin(t * 22) * 0.9 : Math.sin(t * 3.5) * 0.18;
  const drawWing = (col, scaleY) => {
    g.save();
    g.translate(-3, -17);
    g.rotate(-0.45 - flap);
    g.scale(1, scaleY);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(-16, -10, -22, -2);
    g.quadraticCurveTo(-16, -4, -14, 2);
    g.quadraticCurveTo(-18, 0, -12, 6);
    g.quadraticCurveTo(-6, 3, 0, 4);
    g.fill();
    g.fillStyle = wingTip;
    g.beginPath();
    g.moveTo(-22, -2);
    g.quadraticCurveTo(-16, -4, -14, 2);
    g.quadraticCurveTo(-18, -1, -22, -2);
    g.fill();
    g.restore();
  };
  drawWing('#8f7bd0', 1);          // far wing, dimmer

  // curled fluffy tail
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(-10, -11);
  g.quadraticCurveTo(-24, -14, -20, -4);
  g.quadraticCurveTo(-17, -9, -10, -6);
  g.fill();
  g.fillStyle = wingTip;
  g.beginPath(); g.arc(-21, -5, 3.2, 0, Math.PI * 2); g.fill();

  // legs
  g.fillStyle = bodyDk;
  g.fillRect(-8 + step, -6, 5.5, 6);
  g.fillRect(3 - step, -6, 5.5, 6);
  g.fillStyle = wingTip;
  g.fillRect(-8.5 + step, -2, 6.5, 2.5);
  g.fillRect(2.5 - step, -2, 6.5, 2.5);

  // round plush body
  const bg = g.createRadialGradient(-3, -16, 2, 0, -12, 14);
  bg.addColorStop(0, body);
  bg.addColorStop(1, bodyDk);
  g.fillStyle = bg;
  g.beginPath();
  g.ellipse(-1, -13, 12, 10, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = belly;
  g.beginPath();
  g.ellipse(2, -10, 7.5, 6, 0, 0, Math.PI * 2);
  g.fill();

  // leather saddle
  g.fillStyle = '#8a5a2b';
  g.beginPath();
  g.ellipse(-2, -20, 7, 4, 0, Math.PI, 0);
  g.fill();
  g.fillStyle = '#6b421d';
  g.fillRect(-9, -19, 14, 1.6);

  // head
  g.fillStyle = body;
  g.beginPath();
  g.ellipse(11, -22, 8, 7.5, 0, 0, Math.PI * 2);
  g.fill();
  // big round ears
  g.fillStyle = body;
  g.beginPath(); g.ellipse(7, -31, 3.2, 4.5, -0.3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(14, -31, 3.2, 4.5, 0.3, 0, Math.PI * 2); g.fill();
  g.fillStyle = belly;
  g.beginPath(); g.ellipse(7, -31, 1.4, 2.4, -0.3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(14, -31, 1.4, 2.4, 0.3, 0, Math.PI * 2); g.fill();
  // snout
  g.fillStyle = belly;
  g.beginPath();
  g.ellipse(16, -19, 5, 4, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#e06aa0';
  g.beginPath(); g.arc(19, -19, 1.6, 0, Math.PI * 2); g.fill();
  // big friendly eye
  g.fillStyle = '#fff';
  g.beginPath(); g.ellipse(11, -24, 3.4, 4, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#222';
  g.beginPath(); g.arc(12, -24, 1.9, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(12.7, -25, 0.7, 0, Math.PI * 2); g.fill();

  // near wing (in front)
  drawWing(wing, 1);

  g.restore();
}

/* ============================== particles ============================== */

class Particles {
  constructor() { this.list = []; }
  add(p) { this.list.push(Object.assign({ life: 0.5, t: 0, gravity: 0, size: 3, color: '#fff' }, p)); }
  burst(x, y, n, opts) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (opts.speed || 100) * (0.4 + Math.random() * 0.6);
      this.add(Object.assign({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (opts.up || 0) }, opts));
    }
  }
  update(dt) {
    for (const p of this.list) {
      p.t += dt;
      p.vy += (p.gravity || 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.list = this.list.filter(p => p.t < p.life);
  }
  draw(g) {
    for (const p of this.list) {
      const k = 1 - p.t / p.life;
      g.globalAlpha = k;
      g.fillStyle = p.color;
      if (p.spark) {
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.t * 8);
        const s = p.size * k;
        g.fillRect(-s, -s / 3, s * 2, s / 1.5);
        g.fillRect(-s / 3, -s, s / 1.5, s * 2);
        g.restore();
      } else {
        g.beginPath();
        g.arc(p.x, p.y, p.size * k, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1;
  }
}

/* ============================== background ============================== */

function drawBackground(g, level, camX, t) {
  const [top, mid, low] = level.def.sky;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, top);
  grad.addColorStop(0.6, mid);
  grad.addColorStop(1, low);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // stars (night / sunset worlds), with twinkle
  if (level.def.stars) {
    for (let i = 0; i < 60; i++) {
      const sx = (i * 211.7 + 31) % W;
      const sy = ((i * 137.3 + 17) % (H * 0.55));
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + i * 2.3));
      g.fillStyle = `rgba(255,255,240,${0.5 * tw})`;
      g.fillRect(sx, sy, 2, 2);
    }
  }

  // sun / glow
  const sunX = W * 0.78, sunY = H * 0.2;
  const sg = g.createRadialGradient(sunX, sunY, 10, sunX, sunY, 180);
  sg.addColorStop(0, 'rgba(255,250,220,0.95)');
  sg.addColorStop(0.15, 'rgba(255,240,180,0.55)');
  sg.addColorStop(1, 'rgba(255,240,180,0)');
  g.fillStyle = sg;
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,252,235,0.9)';
  g.beginPath();
  g.arc(sunX, sunY, 26, 0, Math.PI * 2);
  g.fill();

  // drifting birds (daytime worlds)
  if (level.def.birds) {
    g.strokeStyle = 'rgba(40,50,70,0.55)';
    g.lineWidth = 1.6;
    for (let i = 0; i < 4; i++) {
      const bx = ((i * 417 + t * 28 - camX * 0.2) % (W + 200)) - 100;
      const by = 60 + (i * 83) % 130;
      const flap = Math.sin(t * 7 + i * 1.7) * 4;
      g.beginPath();
      g.moveTo(bx - 7, by - flap);
      g.quadraticCurveTo(bx, by + 3, bx, by);
      g.quadraticCurveTo(bx, by + 3, bx + 7, by - flap);
      g.stroke();
    }
  }

  // far mountains
  g.fillStyle = 'rgba(255,255,255,0.18)';
  drawHills(g, camX * 0.1, H * 0.78, 220, 90, t);
  // near hills
  g.fillStyle = 'rgba(60,130,80,0.35)';
  drawHills(g, camX * 0.25, H * 0.92, 150, 70, t + 40);

  // clouds
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 7; i++) {
    const cx = ((i * 347 + t * 12 - camX * 0.15) % (W + 300)) - 150;
    const cy = 50 + (i * 67) % 160;
    drawCloud(g, cx, cy, 0.7 + (i % 3) * 0.25);
  }
}

function drawHills(g, offset, baseY, spacing, height, seed) {
  g.beginPath();
  g.moveTo(0, H);
  for (let x = -spacing; x < W + spacing; x += 4) {
    const wx = x + offset;
    const y = baseY
      - Math.abs(Math.sin(wx / spacing + seed)) * height
      - Math.abs(Math.sin(wx / (spacing * 2.7) + seed * 2)) * height * 0.5;
    g.lineTo(x, y);
  }
  g.lineTo(W, H);
  g.closePath();
  g.fill();
}

function drawCloud(g, x, y, s) {
  g.beginPath();
  g.arc(x, y, 18 * s, 0, Math.PI * 2);
  g.arc(x + 22 * s, y - 8 * s, 22 * s, 0, Math.PI * 2);
  g.arc(x + 48 * s, y, 17 * s, 0, Math.PI * 2);
  g.arc(x + 24 * s, y + 8 * s, 20 * s, 0, Math.PI * 2);
  g.fill();
}

/* ============================== tile rendering ============================== */

function drawTiles(g, level, camX, t, skip) {
  const x0 = Math.floor(camX / TILE) - 1;
  const x1 = Math.ceil((camX + W) / TILE) + 1;
  for (let ty = 0; ty < level.h; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const c = level.tile(tx, ty);
      if (c === ' ') continue;
      if (skip && skip.has(tx + ',' + ty)) continue;
      const px = tx * TILE, py = ty * TILE;
      switch (c) {
        case '#': drawGround(g, level, tx, ty, px, py); break;
        case 'X': drawStone(g, px, py); break;
        case 'B': drawBrick(g, px, py); break;
        case '?': case 'M': drawQuestion(g, px, py, t); break;
        case 'Y': drawEggBlock(g, px, py, t); break;
        case 'u': drawUsedBlock(g, px, py); break;
        case '=': drawPlatform(g, px, py); break;
        case 'T': drawPipeTop(g, px, py); break;
        case '|': drawPipeBody(g, px, py); break;
        case 'C': drawCoin(g, px + TILE / 2, py + TILE / 2, t); break;
        case '^': drawSpikes(g, px, py); break;
      }
    }
  }
}

function drawGround(g, level, tx, ty, px, py) {
  const topExposed = level.tile(tx, ty - 1) !== '#';
  const grad = g.createLinearGradient(0, py, 0, py + TILE);
  grad.addColorStop(0, '#96653b');
  grad.addColorStop(1, '#7a4e2a');
  g.fillStyle = grad;
  g.fillRect(px, py, TILE, TILE);
  // dirt speckles & pebbles (deterministic per tile)
  const r = (tx * 7349 + ty * 1031) % 97;
  g.fillStyle = 'rgba(60,35,15,0.35)';
  g.fillRect(px + (r % 22) + 3, py + ((r * 3) % 22) + 6, 4, 3);
  g.fillRect(px + ((r * 7) % 20) + 5, py + ((r * 11) % 18) + 10, 3, 3);
  if (r % 5 === 0) {
    g.fillStyle = 'rgba(170,140,110,0.5)';
    g.beginPath();
    g.ellipse(px + (r % 24) + 4, py + ((r * 13) % 16) + 12, 3, 2.2, 0, 0, Math.PI * 2);
    g.fill();
  }
  if (topExposed) {
    const gg = g.createLinearGradient(0, py, 0, py + 12);
    gg.addColorStop(0, '#6fd279');
    gg.addColorStop(1, '#34973e');
    g.fillStyle = gg;
    g.fillRect(px, py, TILE, 11);
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(px, py, TILE, 2.5);
    // grass blades
    g.fillStyle = '#3fa747';
    g.fillRect(px + (r % 24) + 2, py - 4, 3, 5);
    g.fillRect(px + ((r * 5) % 24) + 4, py - 3, 2, 4);
    // occasional bush / flower decorations
    if (r % 11 === 3) {
      g.fillStyle = 'rgba(46,140,60,0.95)';
      g.beginPath();
      g.arc(px + 8, py - 5, 7, 0, Math.PI * 2);
      g.arc(px + 18, py - 9, 9, 0, Math.PI * 2);
      g.arc(px + 27, py - 5, 7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(110,200,120,0.5)';
      g.beginPath();
      g.arc(px + 16, py - 11, 5, 0, Math.PI * 2);
      g.fill();
    } else if (r % 13 === 5) {
      g.strokeStyle = '#2e8b3a'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(px + 16, py); g.lineTo(px + 16, py - 9); g.stroke();
      g.fillStyle = ['#ff6b9d', '#ffd95e', '#ff8c5a'][r % 3];
      for (let i = 0; i < 5; i++) {
        const a = i * Math.PI * 2 / 5;
        g.beginPath();
        g.arc(px + 16 + Math.cos(a) * 4, py - 11 + Math.sin(a) * 4, 2.6, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(px + 16, py - 11, 2.2, 0, Math.PI * 2); g.fill();
    }
  }
}

function drawStone(g, px, py) {
  g.fillStyle = '#9aa0ad';
  g.fillRect(px, py, TILE, TILE);
  g.fillStyle = '#7c828f';
  g.fillRect(px, py + TILE - 5, TILE, 5);
  g.fillRect(px + TILE - 5, py, 5, TILE);
  g.fillStyle = '#c2c7d2';
  g.fillRect(px, py, TILE, 4);
  g.fillRect(px, py, 4, TILE);
}

function drawBrick(g, px, py) {
  const grad = g.createLinearGradient(0, py, 0, py + TILE);
  grad.addColorStop(0, '#c4603a');
  grad.addColorStop(1, '#a04826');
  g.fillStyle = grad;
  g.fillRect(px, py, TILE, TILE);
  g.fillStyle = '#8e3c1d';
  g.fillRect(px, py + 14, TILE, 3);
  g.fillRect(px + 15, py, 3, 14);
  g.fillRect(px + 7, py + 17, 3, 15);
  g.fillRect(px + 23, py + 17, 3, 15);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(px, py, TILE, 3);
}

// Helper: a five-point star path centered at (cx,cy).
function starPath(g, cx, cy, outer, inner, rot) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2 + rot;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
  }
  g.closePath();
}

// Prize block — a carved amber block with a glowing star rune (replaces "?").
function drawQuestion(g, px, py, t) {
  const pulse = 0.7 + 0.3 * Math.sin(t * 5);
  const grad = g.createLinearGradient(0, py, 0, py + TILE);
  grad.addColorStop(0, '#f0b53a');
  grad.addColorStop(1, '#d18a18');
  g.fillStyle = grad;
  g.fillRect(px, py, TILE, TILE);
  g.fillStyle = `rgba(255,240,170,${0.5 * pulse})`;
  g.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
  g.fillStyle = '#7a4a08';
  g.fillRect(px, py + TILE - 4, TILE, 4);
  g.fillRect(px + TILE - 4, py, 4, TILE);
  g.fillStyle = 'rgba(255,255,255,0.3)';
  g.fillRect(px, py, TILE, 2);
  // glowing star rune
  g.fillStyle = `rgba(255,255,235,${0.85 * pulse + 0.15})`;
  starPath(g, px + TILE / 2, py + TILE / 2, 9, 3.8, Math.sin(t * 2) * 0.15);
  g.fill();
  g.strokeStyle = '#fff7d8'; g.lineWidth = 1; g.stroke();
  // rivets
  g.fillStyle = '#7a4a08';
  [[5,5],[TILE-7,5],[5,TILE-8],[TILE-7,TILE-8]].forEach(([ox,oy]) => g.fillRect(px+ox, py+oy, 3, 3));
}

function drawEggBlock(g, px, py, t) {
  const pulse = 0.75 + 0.25 * Math.sin(t * 5 + 1);
  g.fillStyle = '#e8a020';
  g.fillRect(px, py, TILE, TILE);
  g.fillStyle = `rgba(255,230,120,${0.5 * pulse})`;
  g.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
  g.fillStyle = '#7a4a08';
  g.fillRect(px, py + TILE - 4, TILE, 4);
  g.fillRect(px + TILE - 4, py, 4, TILE);
  // Glydon egg — cream shell with lavender/teal speckles
  const wob = Math.sin(t * 6) * 1.5;
  g.fillStyle = '#f3ecff';
  g.beginPath();
  g.ellipse(px + TILE / 2 + wob * 0.3, py + TILE / 2 + 1, 8, 10.5, wob * 0.04, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#9b7ede';
  g.beginPath();
  g.arc(px + TILE / 2 - 3, py + TILE / 2 - 4, 2.6, 0, Math.PI * 2);
  g.arc(px + TILE / 2 - 2, py + TILE / 2 + 6, 2.0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#5ad1c8';
  g.beginPath();
  g.arc(px + TILE / 2 + 4, py + TILE / 2 + 1, 2.2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#7a4a08';
  [[5, 5], [TILE - 7, 5], [5, TILE - 8], [TILE - 7, TILE - 8]].forEach(([ox, oy]) => g.fillRect(px + ox, py + oy, 3, 3));
}

function drawUsedBlock(g, px, py) {
  g.fillStyle = '#9b7653';
  g.fillRect(px, py, TILE, TILE);
  g.fillStyle = '#7a5a3d';
  g.fillRect(px, py + TILE - 4, TILE, 4);
  g.fillRect(px + TILE - 4, py, 4, TILE);
  g.fillStyle = '#6b4d33';
  [[5,5],[TILE-8,5],[5,TILE-8],[TILE-8,TILE-8]].forEach(([ox,oy]) => g.fillRect(px+ox, py+oy, 3, 3));
}

function drawPlatform(g, px, py) {
  g.fillStyle = '#a0713c';
  g.fillRect(px, py, TILE, 12);
  g.fillStyle = '#c08a4d';
  g.fillRect(px, py, TILE, 4);
  g.fillStyle = '#7a5229';
  g.fillRect(px + 4, py + 4, 2, 8);
  g.fillRect(px + 16, py + 4, 2, 8);
  g.fillRect(px + 26, py + 4, 2, 8);
}

// Carved stone pillar (replaces the green pipe). 'T' draws the capstone.
function stoneGrad(g, px) {
  const grad = g.createLinearGradient(px - 6, 0, px + TILE + 6, 0);
  grad.addColorStop(0, '#5a6472');
  grad.addColorStop(0.4, '#8b95a4');
  grad.addColorStop(0.6, '#737d8c');
  grad.addColorStop(1, '#4a525e');
  return grad;
}

function drawPipeTop(g, px, py) {
  g.fillStyle = stoneGrad(g, px);
  g.fillRect(px - 5, py, TILE + 10, 14);       // capstone overhang
  g.fillRect(px - 2, py + 14, TILE + 4, TILE - 14);
  // capstone edges
  g.fillStyle = 'rgba(255,255,255,0.28)';
  g.fillRect(px - 5, py, TILE + 10, 2);
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.fillRect(px - 5, py + 11, TILE + 10, 3);
  // carved rune groove
  g.strokeStyle = 'rgba(40,50,60,0.5)'; g.lineWidth = 2;
  g.beginPath();
  g.moveTo(px + 8, py + 20); g.lineTo(px + TILE - 8, py + 20);
  g.stroke();
}

function drawPipeBody(g, px, py) {
  g.fillStyle = stoneGrad(g, px);
  g.fillRect(px - 2, py, TILE + 4, TILE);
  // block seams
  g.strokeStyle = 'rgba(40,50,60,0.4)'; g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(px - 2, py + TILE / 2); g.lineTo(px + TILE + 2, py + TILE / 2);
  g.moveTo(px + TILE / 2, py); g.lineTo(px + TILE / 2, py + TILE / 2);
  g.stroke();
}

// Collectible crystal gem (replaces the old coin). Spins with a facet shimmer.
function drawCoin(g, cx, cy, t) {
  const ph = Math.abs(Math.sin(t * 4 + cx * 0.05));
  const w = 9 * (0.3 + 0.7 * ph);   // foreshorten as it spins
  g.save();
  g.translate(cx, cy + Math.sin(t * 3 + cx * 0.1) * 2);
  // glow halo
  const halo = g.createRadialGradient(0, 0, 2, 0, 0, 20);
  halo.addColorStop(0, 'rgba(110,230,255,0.5)');
  halo.addColorStop(1, 'rgba(110,230,255,0)');
  g.fillStyle = halo;
  g.fillRect(-20, -20, 40, 40);
  // faceted gem: top point, shoulders, bottom point
  const top = -12, sh = -4, bot = 12;
  const grad = g.createLinearGradient(-w, top, w, bot);
  grad.addColorStop(0, '#d6f7ff');
  grad.addColorStop(0.45, '#3fc7e8');
  grad.addColorStop(1, '#1a7fb0');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, top);
  g.lineTo(w, sh);
  g.lineTo(0, bot);
  g.lineTo(-w, sh);
  g.closePath();
  g.fill();
  // facet lines
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1;
  g.beginPath();
  g.moveTo(-w, sh); g.lineTo(w, sh);
  g.moveTo(0, top); g.lineTo(0, bot);
  g.stroke();
  // bright glint
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath();
  g.moveTo(0, top); g.lineTo(w * 0.5, sh - 1); g.lineTo(0, sh + 1);
  g.closePath();
  g.fill();
  g.restore();
}

function drawSpikes(g, px, py) {
  g.fillStyle = '#b9c0cc';
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.moveTo(px + i * 8, py + TILE);
    g.lineTo(px + i * 8 + 4, py + 10);
    g.lineTo(px + i * 8 + 8, py + TILE);
    g.closePath();
    g.fill();
  }
  g.fillStyle = '#8c93a0';
  g.fillRect(px, py + TILE - 5, TILE, 5);
}

// Goal totem — a wooden pole topped by a glowing crystal, with a star pennant.
function drawFlag(g, level, t) {
  if (level.flagX === null) return;
  const x = level.flagX + TILE / 2;
  const top = TILE * 1.5;
  const bottom = level.flagBottom;
  // wooden pole
  const pg = g.createLinearGradient(x - 3, 0, x + 3, 0);
  pg.addColorStop(0, '#6b4a2b');
  pg.addColorStop(0.5, '#a0713c');
  pg.addColorStop(1, '#5a3e22');
  g.fillStyle = pg;
  g.fillRect(x - 3, top, 6, bottom - top);
  // crystal topper with glow
  const pulse = 0.6 + 0.4 * Math.sin(t * 4);
  const halo = g.createRadialGradient(x, top - 8, 2, x, top - 8, 22);
  halo.addColorStop(0, `rgba(120,230,255,${0.55 * pulse})`);
  halo.addColorStop(1, 'rgba(120,230,255,0)');
  g.fillStyle = halo;
  g.fillRect(x - 22, top - 30, 44, 44);
  const cg = g.createLinearGradient(x - 6, top - 16, x + 6, top);
  cg.addColorStop(0, '#d6f7ff');
  cg.addColorStop(0.5, '#3fc7e8');
  cg.addColorStop(1, '#1a7fb0');
  g.fillStyle = cg;
  g.beginPath();
  g.moveTo(x, top - 16); g.lineTo(x + 7, top - 6); g.lineTo(x, top + 4); g.lineTo(x - 7, top - 6);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1; g.stroke();
  // waving pennant with a star
  const wave = Math.sin(t * 5) * 5;
  const tg = g.createLinearGradient(x + 2, 0, x + 50, 0);
  tg.addColorStop(0, '#17a08c');
  tg.addColorStop(1, '#0d7a68');
  g.fillStyle = tg;
  g.beginPath();
  g.moveTo(x + 3, top + 10);
  g.quadraticCurveTo(x + 30, top + 16 + wave, x + 50, top + 22 - wave);
  g.quadraticCurveTo(x + 30, top + 26 + wave, x + 3, top + 34);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.9)';
  starPath(g, x + 20, top + 22, 5, 2.1, t * 0.5);
  g.fill();
}

/* ============================== game ============================== */

const game = {
  state: 'title',   // title | play | levelDone | gameover | win
  levelIndex: 0,
  level: null,
  player: null,
  enemies: [],
  items: [],
  particles: new Particles(),
  bumps: [],        // animated block bumps {tx, ty, t}
  camX: 0,
  score: 0,
  coins: 0,
  lives: 3,
  time: 300,
  paused: false,
  stateTimer: 0,
  shake: 0,

  loadLevel(i) {
    this.levelIndex = i;
    this.level = new Level(LEVELS[i]);
    this.player = new Player(this.level.startX, this.level.startY);
    this.enemies = this.level.entitySpawns.map(s =>
      s.type === 'thornling' ? new Thornling(s.x, s.y) : new Curlbug(s.x, s.y));
    this.items = [];
    this.particles = new Particles();
    this.bumps = [];
    this.camX = 0;
    this.time = 300;
    this.state = 'play';
  },

  start() {
    this.score = 0; this.coins = 0; this.lives = 3;
    this.loadLevel(0);
    AudioEngine.startMusic();
  },

  addScore(n, x, y) {
    this.score += n;
    if (x !== undefined) {
      this.particles.add({ x, y, vx: 0, vy: -50, life: 0.8, size: 0, color: '#fff', text: '+' + n });
    }
  },

  spawnDust(x, y, n) {
    this.particles.burst(x, y, n, { speed: 60, up: 30, life: 0.4, size: 3.5, color: 'rgba(220,210,190,0.8)', gravity: -60 });
  },

  hitBlock(tx, ty, player) {
    const c = this.level.tile(tx, ty);
    const px = tx * TILE, py = ty * TILE;
    if (c === '?' || c === 'M' || c === 'Y') {
      this.level.set(tx, ty, 'u');
      this.bumps.push({ tx, ty, t: 0 });
      if (c === '?') {
        this.coins++;
        this.addScore(200, px + TILE / 2, py - 10);
        AudioEngine.sfx.coin();
        this.particles.burst(px + TILE / 2, py - 6, 8, { speed: 90, up: 120, life: 0.5, size: 3, color: '#7fe6ff', gravity: 300, spark: true });
      } else if (c === 'M') {
        this.items.push(new Sunfruit(px + 4, py - TILE));
        AudioEngine.sfx.powerup();
      } else {
        this.items.push(new Glydon(px + 2, py - TILE));
        AudioEngine.sfx.powerup();
        this.particles.burst(px + TILE / 2, py - 10, 12,
          { speed: 110, up: 100, life: 0.7, size: 3.5, color: '#b9a3ee', gravity: 250, spark: true });
      }
    } else if (c === 'B') {
      if (player.big) {
        this.level.set(tx, ty, ' ');
        AudioEngine.sfx.break_();
        this.addScore(50);
        this.shake = 0.18;
        for (let i = 0; i < 4; i++) {
          this.particles.add({
            x: px + 8 + (i % 2) * 16, y: py + 8 + Math.floor(i / 2) * 16,
            vx: (i % 2 ? 1 : -1) * (80 + Math.random() * 80),
            vy: -250 - Math.random() * 120,
            gravity: 900, life: 1.1, size: 6, color: '#b5542e',
          });
        }
      } else {
        this.bumps.push({ tx, ty, t: 0 });
        AudioEngine.sfx.bump();
      }
    } else {
      AudioEngine.sfx.bump();
    }
  },

  collectCoinTiles() {
    const p = this.player;
    const x0 = Math.floor(p.x / TILE), x1 = Math.floor((p.x + p.w) / TILE);
    const y0 = Math.floor(p.y / TILE), y1 = Math.floor((p.y + p.h) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.level.tile(tx, ty) === 'C') {
          this.level.set(tx, ty, ' ');
          this.coins++;
          this.addScore(100, tx * TILE + TILE / 2, ty * TILE);
          AudioEngine.sfx.coin();
          this.particles.burst(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 6,
            { speed: 80, up: 60, life: 0.45, size: 3, color: '#7fe6ff', gravity: 200, spark: true });
          if (this.coins % 50 === 0) { this.lives++; AudioEngine.sfx.oneup(); }
        }
      }
    }
  },

  killPlayer(pit = false) {
    if (this.player.dying) return;
    this.player.dying = true;
    this.player.vy = pit ? -300 : -550;
    this.player.vx = 0;
    AudioEngine.stopMusic();
    AudioEngine.sfx.die();
    this.stateTimer = 2.2;
  },

  update(dt) {
    const t = performance.now() / 1000;

    if (this.state !== 'play') {
      this.stateTimer -= dt;
      this.particles.update(dt);
      if (this.state === 'levelDone' && this.stateTimer <= 0) {
        if (this.levelIndex + 1 < LEVELS.length) {
          this.loadLevel(this.levelIndex + 1);
          AudioEngine.startMusic();
        } else {
          this.state = 'win';
        }
      }
      return;
    }
    if (this.paused) return;

    // player death sequence
    if (this.player.dying) {
      this.player.update(this.level, dt, this);
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.lives--;
        if (this.lives <= 0) {
          this.state = 'gameover';
          this.stateTimer = 999;
        } else {
          this.loadLevel(this.levelIndex);
          AudioEngine.startMusic();
        }
      }
      return;
    }

    this.time -= dt;
    if (this.time <= 0) { this.killPlayer(); return; }

    this.player.update(this.level, dt, this);
    this.collectCoinTiles();

    // spike collision
    {
      const p = this.player;
      const footY = Math.floor((p.y + p.h + 3) / TILE);
      const tx0 = Math.floor((p.x + 4) / TILE), tx1 = Math.floor((p.x + p.w - 4) / TILE);
      for (let tx = tx0; tx <= tx1; tx++) {
        if (this.level.tile(tx, footY) === '^') { p.hurt(this); break; }
      }
    }

    // items
    for (const it of this.items) {
      it.update(this.level, dt);
      if (rectsOverlap(it.rect, this.player.rect)) {
        if (it instanceof Glydon) {
          if (!this.player.glydon && performance.now() >= it.shyUntil) {
            it.remove = true;
            this.player.glydon = true;
            this.addScore(1000, it.x, it.y - 10);
            AudioEngine.sfx.powerup();
            this.particles.burst(this.player.x + this.player.w / 2, this.player.y + this.player.h, 10,
              { speed: 100, up: 60, life: 0.5, size: 3, color: '#b9a3ee', gravity: 200, spark: true });
          }
        } else {
          it.remove = true;
          this.player.setBig(true);
          this.addScore(1000, it.x, it.y - 10);
          AudioEngine.sfx.powerup();
        }
      }
    }
    this.items = this.items.filter(i => !i.remove);

    // enemies
    for (const e of this.enemies) {
      // only activate near camera
      if (e.x > this.camX + W + TILE * 3) continue;
      e.update(this.level, dt);
      if (e.dead || e.remove) continue;

      // shell vs other enemies
      if (e instanceof Curlbug && e.moving) {
        for (const o of this.enemies) {
          if (o !== e && !o.dead && !o.remove && rectsOverlap(e.rect, o.rect)) {
            o.remove = true;
            this.addScore(400, o.x, o.y);
            AudioEngine.sfx.kick();
            this.particles.burst(o.x + o.w / 2, o.y + o.h / 2, 10,
              { speed: 130, up: 80, life: 0.5, size: 4, color: '#c9a86a', gravity: 400 });
          }
        }
      }

      if (rectsOverlap(e.rect, this.player.rect) && !this.player.dying) {
        const stomping = this.player.vy > 80 && this.player.y + this.player.h < e.y + e.h * 0.6;
        if (stomping) {
          if (e instanceof Thornling) {
            e.stomp();
            this.addScore(100, e.x, e.y);
          } else {
            e.stomp(this.player);
            this.addScore(100, e.x, e.y);
          }
          this.player.vy = input.jump ? -650 : -420;
          AudioEngine.sfx.stomp();
          this.spawnDust(e.x + e.w / 2, e.y, 5);
          this.shake = 0.1;
        } else if (e instanceof Curlbug && e.shell && !e.moving) {
          e.kick(this.player);
        } else {
          this.player.hurt(this);
        }
      }
    }
    this.enemies = this.enemies.filter(e => !e.remove);

    // flag
    if (this.level.flagX !== null && this.player.x + this.player.w >= this.level.flagX) {
      this.state = 'levelDone';
      this.stateTimer = 3;
      this.addScore(2000);
      this.addScore(Math.floor(this.time) * 10);
      AudioEngine.stopMusic();
      AudioEngine.sfx.win();
      this.particles.burst(this.level.flagX + 16, TILE * 2, 40,
        { speed: 220, up: 100, life: 1.4, size: 4, gravity: 250, spark: true, color: '#ffd95e' });
      this.particles.burst(this.level.flagX + 16, TILE * 3, 30,
        { speed: 180, up: 80, life: 1.2, size: 4, gravity: 250, spark: true, color: '#7be0ff' });
    }

    // bumps + particles + camera
    for (const b of this.bumps) b.t += dt * 6;
    this.bumps = this.bumps.filter(b => b.t < 1);
    this.particles.update(dt);

    const target = this.player.x + this.player.w / 2 - W * 0.38;
    this.camX = lerp(this.camX, clamp(target, 0, this.level.w * TILE - W), 6 * dt);
    this.shake = Math.max(0, this.shake - dt);
  },

  draw() {
    const g = ctx2d;
    const t = performance.now() / 1000;
    g.clearRect(0, 0, W, H);

    if (!this.level) return;

    drawBackground(g, this.level, this.camX, t);

    g.save();
    let sx = 0, sy = 0;
    if (this.shake > 0) {
      sx = (Math.random() - 0.5) * 8 * this.shake * 5;
      sy = (Math.random() - 0.5) * 8 * this.shake * 5;
    }
    g.translate(-Math.round(this.camX) + sx, sy + (H - this.level.h * TILE));

    // bump animation: draw bumped tiles offset upward instead of in place
    const bumped = new Set(this.bumps.map(b => b.tx + ',' + b.ty));
    drawTiles(g, this.level, this.camX, t, bumped);
    for (const b of this.bumps) {
      const off = Math.sin(b.t * Math.PI) * 8;
      const c = this.level.tile(b.tx, b.ty);
      const px = b.tx * TILE, py = b.ty * TILE - off;
      if (c === 'u') drawUsedBlock(g, px, py);
      else if (c === 'B') drawBrick(g, px, py);
      else if (c === '?' || c === 'M') drawQuestion(g, px, py, t);
    }

    drawFlag(g, this.level, t);

    // soft shadows
    g.fillStyle = 'rgba(0,0,0,0.18)';
    const shadowFor = (e) => {
      if (!e.onGround && e.vy !== 0) return;
      g.beginPath();
      g.ellipse(e.x + e.w / 2, e.y + e.h + 2, e.w * 0.5, 4, 0, 0, Math.PI * 2);
      g.fill();
    };
    for (const e of this.enemies) shadowFor(e);
    if (!this.player.dying) shadowFor(this.player);

    for (const it of this.items) it.draw(g, t);
    for (const e of this.enemies) e.draw(g, t);
    this.player.draw(g, t);
    this.particles.draw(g);

    // floating score text particles
    for (const p of this.particles.list) {
      if (p.text) {
        g.globalAlpha = 1 - p.t / p.life;
        g.fillStyle = '#fff';
        g.font = 'bold 14px "Segoe UI", sans-serif';
        g.textAlign = 'center';
        g.fillText(p.text, p.x, p.y);
        g.globalAlpha = 1;
      }
    }

    g.restore();

    // per-world color grade
    if (this.level.def.tint) {
      g.fillStyle = this.level.def.tint;
      g.fillRect(0, 0, W, H);
    }

    // vignette
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(10,5,30,0.35)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);

    this.drawHUD(g);

    if (this.paused) this.drawBanner(g, 'PAUSED', 'press P to resume');
    if (this.state === 'levelDone') this.drawBanner(g, 'COURSE CLEAR!', this.level.def.name);
    if (this.state === 'gameover') this.drawBanner(g, 'GAME OVER', 'press ENTER to retry');
    if (this.state === 'win') this.drawBanner(g, 'YOU WIN! 🏆', `final score ${this.score} — press ENTER to play again`);
  },

  drawHUD(g) {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 0, W, 44);
    g.fillStyle = '#fff';
    g.font = 'bold 17px "Segoe UI", sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(`SCORE  ${String(this.score).padStart(6, '0')}`, 24, 23);
    g.fillText(`💎 × ${this.coins}`, 250, 23);
    g.fillText(`♥ × ${this.lives}`, 380, 23);
    g.textAlign = 'center';
    g.fillText(`WORLD ${this.levelIndex + 1} — ${this.level.def.name}`, W / 2 + 60, 23);
    g.textAlign = 'right';
    const tcol = this.time < 60 ? '#ff6b5e' : '#fff';
    g.fillStyle = tcol;
    g.fillText(`TIME ${Math.max(0, Math.ceil(this.time))}`, W - 24, 23);
  },

  drawBanner(g, big, small) {
    g.fillStyle = 'rgba(5,8,25,0.65)';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.font = '900 52px "Segoe UI", sans-serif';
    g.fillText(big, W / 2, H / 2 - 16);
    g.fillStyle = '#9fc3ff';
    g.font = '600 20px "Segoe UI", sans-serif';
    g.fillText(small, W / 2, H / 2 + 28);
  },
};

/* ============================== main loop ============================== */

let lastTime = performance.now();
function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 1 / 30);
  lastTime = now;
  if (game.state !== 'title') {
    game.update(dt);
    game.draw();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (game.state === 'gameover' || game.state === 'win')) {
    game.start();
  }
});

document.getElementById('start-btn').addEventListener('click', () => {
  document.getElementById('title-screen').classList.add('hidden');
  AudioEngine.resume();
  game.start();
});
