// Purely visual effects: particles, rings, lightning, floating text, screen shake,
// shockwaves. The simulation calls these but never reads them back, so a no-op
// stub can replace the whole class in headless runs.

import { SHAPE } from './batch.js';
import { TAU, clamp } from '../core/math.js';

const MAXP = 9000;
const rnd = Math.random;

export class Fx {
  constructor() {
    this.density = 1;
    this.shakeScale = 1;
    // particle struct-of-arrays
    this.px = new Float32Array(MAXP); this.py = new Float32Array(MAXP);
    this.vx = new Float32Array(MAXP); this.vy = new Float32Array(MAXP);
    this.life = new Float32Array(MAXP); this.max = new Float32Array(MAXP);
    this.size = new Float32Array(MAXP); this.drag = new Float32Array(MAXP);
    this.cr = new Float32Array(MAXP); this.cg = new Float32Array(MAXP); this.cb = new Float32Array(MAXP);
    this.kind = new Uint8Array(MAXP); this.rot = new Float32Array(MAXP);
    this.head = 0;
    this.live = 0;

    this.rings = [];
    this.bolts = [];
    this.texts = [];
    this.shocks = [];
    this.shakeAmt = 0;
    this.shakeX = 0; this.shakeY = 0;
    this.chroma = 0;
    this.whiteout = 0;
    this.t = 0;
  }

  reset() {
    this.life.fill(0);
    this.rings.length = this.bolts.length = this.texts.length = this.shocks.length = 0;
    this.shakeAmt = this.chroma = this.whiteout = 0;
  }

  // ---- emitters -----------------------------------------------------------
  /** kind: 0 = streak spark, 1 = heart, 2 = round mote */
  spark(x, y, vx, vy, col, life = 0.5, size = 4, kind = 0, drag = 2.5) {
    const i = this.head;
    this.head = (this.head + 1) % MAXP;
    this.px[i] = x; this.py[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.life[i] = this.max[i] = life; this.size[i] = size; this.drag[i] = drag;
    this.cr[i] = col[0]; this.cg[i] = col[1]; this.cb[i] = col[2];
    this.kind[i] = kind; this.rot[i] = rnd() * TAU;
  }

  burst(x, y, col, n = 12, speed = 300, life = 0.5, size = 4, kind = 0) {
    n = Math.max(1, Math.round(n * this.density));
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, s = speed * (0.25 + rnd() * 0.75);
      this.spark(x, y, Math.cos(a) * s, Math.sin(a) * s, col, life * (0.5 + rnd() * 0.7), size * (0.6 + rnd() * 0.7), kind);
    }
  }

  /** Directional spray, e.g. impact sparks or engine exhaust. */
  spray(x, y, ang, spread, col, n = 4, speed = 300, life = 0.35, size = 3, kind = 0) {
    n = Math.max(1, Math.round(n * this.density));
    for (let i = 0; i < n; i++) {
      const a = ang + (rnd() - 0.5) * spread, s = speed * (0.4 + rnd() * 0.6);
      this.spark(x, y, Math.cos(a) * s, Math.sin(a) * s, col, life * (0.5 + rnd() * 0.7), size * (0.6 + rnd() * 0.7), kind);
    }
  }

  /** Occasional single mote; chance is scaled by particle density. */
  mote(x, y, col, chance = 1, size = 3, life = 0.5, spread = 40, kind = 2) {
    if (rnd() > chance * this.density) return;
    this.spark(x + (rnd() - 0.5) * spread * 0.3, y + (rnd() - 0.5) * spread * 0.3,
      (rnd() - 0.5) * spread, (rnd() - 0.5) * spread, col, life * (0.6 + rnd() * 0.6), size, kind, 1.5);
  }

  ring(x, y, col, r0, r1, life = 0.4, width = 3) {
    if (this.rings.length > 90) this.rings.shift();
    this.rings.push({ x, y, col, r0, r1, life, max: life, width });
  }

  /** Distortion shockwave (post-process) that also ripples the floor grid. */
  shock(x, y, amp = 1, radius = 400, life = 0.6) {
    if (this.shocks.length >= 8) {
      let weakest = 0;
      for (let i = 1; i < this.shocks.length; i++) if (this.shocks[i].amp * this.shocks[i].life < this.shocks[weakest].amp * this.shocks[weakest].life) weakest = i;
      this.shocks.splice(weakest, 1);
    }
    this.shocks.push({ x, y, amp, radius, life, max: life });
  }

  lightning(x1, y1, x2, y2, col) {
    if (this.bolts.length > 60) this.bolts.shift();
    const pts = [x1, y1];
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const n = clamp(Math.floor(len / 28), 2, 9);
    for (let i = 1; i < n; i++) {
      const t = i / n, j = (rnd() - 0.5) * 34;
      pts.push(x1 + dx * t - (dy / len) * j, y1 + dy * t + (dx / len) * j);
    }
    pts.push(x2, y2);
    this.bolts.push({ pts, col, life: 0.18, max: 0.18 });
  }

  text(x, y, str, col, size = 14, life = 0.7) {
    if (this.texts.length > 70) this.texts.shift();
    this.texts.push({ x: x + (rnd() - 0.5) * 16, y, str, col, size, life, max: life, vy: -70 });
  }

  shake(a) { this.shakeAmt = Math.min(34, Math.max(this.shakeAmt, a) + a * 0.25); }
  flash(a) { this.chroma = Math.min(1.4, this.chroma + a); }
  white(a) { this.whiteout = Math.max(this.whiteout, a); }

  // ---- simulation of the visuals -------------------------------------------
  update(dt) {
    this.t += dt;
    const { px, py, vx, vy, life, drag } = this;
    let live = 0;
    for (let i = 0; i < MAXP; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      const k = Math.max(0, 1 - drag[i] * dt);
      vx[i] *= k; vy[i] *= k;
      px[i] += vx[i] * dt; py[i] += vy[i] * dt;
      live++;
    }
    this.live = live;
    for (const r of this.rings) r.life -= dt;
    for (const b of this.bolts) b.life -= dt;
    for (const t of this.texts) { t.life -= dt; t.y += t.vy * dt; t.vy *= 1 - 3 * dt; }
    for (const s of this.shocks) s.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    this.bolts = this.bolts.filter((b) => b.life > 0);
    this.texts = this.texts.filter((t) => t.life > 0);
    this.shocks = this.shocks.filter((s) => s.life > 0);

    this.shakeAmt *= Math.exp(-7 * dt);
    const s = this.shakeAmt * this.shakeScale;
    this.shakeX = (rnd() - 0.5) * 2 * s;
    this.shakeY = (rnd() - 0.5) * 2 * s;
    this.chroma *= Math.exp(-5 * dt);
    this.whiteout *= Math.exp(-6 * dt);
  }

  // ---- drawing -------------------------------------------------------------
  draw(batch, glyphs) {
    const col = [0, 0, 0];
    for (const r of this.rings) {
      const t = 1 - r.life / r.max;
      const e = 1 - Math.pow(1 - t, 3);
      batch.ring(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, r.col, (1 - t) * (1 - t), r.width * (1 - t * 0.6), 1);
    }
    for (const b of this.bolts) {
      const a = b.life / b.max;
      const p = b.pts;
      for (let i = 0; i + 3 < p.length; i += 2) {
        batch.line(p[i], p[i + 1], p[i + 2], p[i + 3], 2.2 * a + 0.6, b.col, a * 1.6, 1);
      }
    }
    const { px, py, vx, vy, life, max, size, cr, cg, cb, kind, rot } = this;
    for (let i = 0; i < MAXP; i++) {
      if (life[i] <= 0) continue;
      const t = life[i] / max[i];
      col[0] = cr[i]; col[1] = cg[i]; col[2] = cb[i];
      const k = kind[i];
      if (k === 0) {
        const sp = Math.hypot(vx[i], vy[i]);
        const s = size[i] * (0.4 + 0.6 * t);
        batch.push(SHAPE.glow, px[i], py[i], s + sp * 0.022, s, Math.atan2(vy[i], vx[i]), col, t * 1.6, 0, 0, 0);
      } else if (k === 1) {
        batch.push(SHAPE.heart, px[i], py[i], size[i] * (0.5 + 0.5 * t), size[i] * (0.5 + 0.5 * t), rot[i] + (1 - t) * 3, col, t, 1.2, 0.5, 0, 0, 0);
      } else {
        const s = size[i] * (0.5 + 0.5 * t);
        batch.push(SHAPE.glow, px[i], py[i], s, s, 0, col, t * 1.4, 0, 0, 0);
      }
    }
    if (glyphs) {
      for (const t of this.texts) {
        const k = t.life / t.max;
        const pop = 1 + Math.max(0, k - 0.8) * 2.5;
        glyphs.draw(batch, t.str, t.x, t.y, t.size * pop, t.col, Math.min(1, k * 2.5));
      }
    }
  }
}

/** No-op stand-in used by headless simulation and tests. */
export function nullFx() {
  const noop = () => {};
  return new Proxy({}, { get: () => noop });
}
