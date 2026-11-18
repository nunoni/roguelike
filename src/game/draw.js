// Turns simulation state into shape instances. Read-only with respect to the game.

import { COL, PLAYER, BPM, SECTOR_BY_ID } from '../config.js';
import { TAU, clamp } from '../core/math.js';

const S = [0, 0, 0];
function tint(c, w, k) {
  S[0] = c[0] + (w[0] - c[0]) * k; S[1] = c[1] + (w[1] - c[1]) * k; S[2] = c[2] + (w[2] - c[2]) * k;
  return S;
}
const ENVY = [0.45, 1.0, 0.35];
const BUTTERFLY = [0.55, 0.3, 1.0];
const XP_PINK = [1.0, 0.5, 0.78];
const ELITE_COL = { swift: COL.white, armored: COL.blue, volatile: COL.red, regen: COL.lime, blink: COL.violet, frenzied: COL.orange };

export function drawGame(g, B, glyphs) {
  const t = g.time, cam = g.cam;
  const vx = g.viewHalf.x + 160, vy = g.viewHalf.y + 160;
  const vis = (x, y, m = 0) => Math.abs(x - cam.x) < vx + m && Math.abs(y - cam.y) < vy + m;
  const beat = Math.exp(-((t * BPM / 60) % 1) * 5);

  drawHazards(g, B, t, vis);
  drawZones(g, B, t, vis);
  drawLasers(g, B, t);
  if (g.gates) drawGates(g, B, glyphs, t);
  drawPickups(g, B, t, vis);
  drawStrings(g, B, t);
  for (const e of g.enemies) if (!e.dead && vis(e.x, e.y, e.r + 700)) drawEnemy(g, B, e, t, beat);
  drawArsenal(g, B, t, vis);
  drawProjectiles(g, B, t, vis);
  drawBullets(g, B, t, vis);
  drawAllies(g, B, t);
  drawPlayer(g, B, t, beat);

  const b = g.bombRing;
  if (b) {
    const a = 1 - b.r / b.max;
    B.push(2, b.x, b.y, b.r, b.r, -Math.PI / 2, COL.pink, a * 1.5 + 0.2, 7, 0, 1);
    B.ring(b.x, b.y, b.r * 0.86, COL.white, a, 2.5, 1);
  }
  drawPointers(g, B, t);
}

// ------------------------------------------------------------------ floor effects
function drawZones(g, B, t, vis) {
  for (const z of g.zones) {
    if (z.dead || !vis(z.x, z.y, z.r)) continue;
    const k = clamp(z.t / z.dur, 0, 1);
    switch (z.kind) {
      case 'blast': {
        if (z.t < 0) break;
        const fl = 0.5 + 0.5 * Math.sin(t * 30);
        const bc = z.flare ? COL.orange : z.crystal ? COL.ice : z.fall ? COL.violet : COL.red;
        B.ring(z.x, z.y, z.r, bc, 0.7 + 0.3 * fl, 2.5, 1);
        B.push(0, z.x, z.y, z.r * k, z.r * k, 0, bc, 0.5, 0, 0.35 + 0.25 * fl, 0);
        if (z.flare) B.glow(z.x, z.y, z.r * 1.4 * k, z.r * 1.4 * k, 0, COL.amber, 0.35 * k);
        if (z.fall) {                              // the Monolith's shadow, growing as it falls
          B.circle(z.x, z.y, z.r * (0.3 + 0.6 * k), [0.04, 0.02, 0.08], 0.8, 0, 1, 0, 1);
          B.box(z.x, z.y, 40 * (0.4 + 0.6 * k), 40 * (0.4 + 0.6 * k), t, COL.violet, 0.4 + 0.5 * k, 2, 0.2, 1, 0, 4);
        }
        break;
      }
      case 'tile': {                            // Metronome floor tile, lands on the beat
        const fl = 0.5 + 0.5 * Math.sin(t * 24);
        const s = z.r * 0.93;
        B.box(z.x, z.y, s, s, 0, COL.amber, 0.55 + 0.4 * k, 2, 0.08 + 0.32 * k * k, 1, 0, 6);
        B.box(z.x, z.y, s * k, s * k, 0, COL.amber, 0.35 + 0.2 * fl, 0, 0.5, 0, 0, 4);
        break;
      }
      case 'web': {                             // Weaver silk patch
        if (z.t < z.land) {
          const q = z.t / z.land;
          B.ring(z.x, z.y, z.r * (1.6 - 0.6 * q), COL.lime, 0.4 + 0.4 * q, 1.5, 0.6);
          break;
        }
        const fade = Math.min(1, (z.dur - z.t) * 2);
        B.ring(z.x, z.y, z.r, COL.lime, 0.5 * fade, 1.6, 0.6);
        B.ring(z.x, z.y, z.r * 0.6, COL.lime, 0.35 * fade, 1.2, 0.4);
        for (let i = 0; i < 6; i++) {
          const an = (i / 6) * TAU + z.x * 0.01;
          B.line(z.x, z.y, z.x + Math.cos(an) * z.r, z.y + Math.sin(an) * z.r, 1.2, COL.lime, 0.4 * fade, 0.4);
        }
        break;
      }
      case 'meteor': {
        if (z.t < 0) break;                       // queued (Singularity)
        B.ring(z.x, z.y, z.r * (1 - k * 0.6), COL.gold, 0.5 + k * 0.5, 2, 0.6);
        const sx = z.x - 260 * (1 - k), sy = z.y - 520 * (1 - k);
        B.star(sx, sy, 20 * z.r / 95, 5, t * 9, COL.gold, 1, 2.5, 0.9, 1, 0);
        B.glow(sx - 26, sy - 52, 90, 12, Math.atan2(520, 260), COL.gold, 0.9);
        break;
      }
      case 'well': {
        const fade = Math.min(1, z.t * 4) * Math.min(1, (z.dur - z.t) * 3);
        B.circle(z.x, z.y, 24 + 6 * Math.sin(t * 9), COL.violet, fade, 3, 0, 1, 1);
        for (let i = 0; i < 4; i++) {
          const rr = z.r * (1 - ((t * 0.7 + i / 4) % 1));
          B.ring(z.x, z.y, rr, COL.violet, fade * 0.55 * (1 - rr / z.r), 2, 0.7);
        }
        for (let i = 0; i < 3; i++) B.arc(z.x, z.y, z.r * 0.55, t * 2.6 + (i / 3) * TAU, 0.6, 2.5, COL.pink, fade * 0.7, 1);
        break;
      }
      case 'fire': {
        const fade = Math.min(1, (z.dur - z.t) * 2);
        const fl = 0.75 + 0.25 * Math.sin(t * 17 + z.x);
        B.glow(z.x, z.y, z.r * 1.25, z.r * 1.25, 0, COL.orange, 0.5 * fade * fl);
        B.ring(z.x, z.y, z.r * (0.85 + 0.1 * fl), COL.amber, 0.45 * fade, 1.5, 0.5);
        break;
      }
      case 'trail': {
        const fade = 1 - k;
        B.glow(z.x, z.y, z.r * 1.3, z.r * 1.3, 0, COL.gold, 0.5 * fade);
        if ((z.x * 7 + z.y * 3 | 0) % 3 === 0) B.star(z.x, z.y, 7 * fade + 2, 4, t * 3 + z.x, COL.gold, fade, 1, 0.8, 0, 0);
        break;
      }
      case 'after': {
        const fade = 1 - k;
        B.heart(z.x, z.y, 22 * (0.8 + 0.2 * fade), z.ang, COL.pink, fade * 0.8, 2, 0.25, 1, 0);
        break;
      }
    }
  }
}

// ------------------------------------------------------------------ the newer arsenal
function envelope(B, x, y, s, rot, a, col = COL.rose) {
  B.box(x, y, s * 1.4, s, rot, col, a, 1.6, 0.3, 0.9, 0.6, 1);
  const c = Math.cos(rot), sn = Math.sin(rot);
  // the flap: two lines from the top corners to the middle
  const tx = -sn, ty = c;                         // "up" across the envelope
  B.line(x - c * s * 1.3 - tx * s * 0.9, y - sn * s * 1.3 - ty * s * 0.9, x - tx * s * 0.1, y - ty * s * 0.1, 1.2, col, a, 0.4);
  B.line(x + c * s * 1.3 - tx * s * 0.9, y + sn * s * 1.3 - ty * s * 0.9, x - tx * s * 0.1, y - ty * s * 0.1, 1.2, col, a, 0.4);
  B.heart(x, y + s * 0.15, s * 0.45, Math.PI / 2, COL.hot, a, 0, 1, 1, 0);
}

function drawArsenal(g, B, t, vis) {
  for (const l of g.tags) {                     // Laser Tag
    const k = 1 - l.t / l.dur, fl = 0.8 + 0.2 * Math.sin(t * 60 + l.x1);
    B.line(l.x1, l.y1, l.x2, l.y2, 7 * k * fl + 1, COL.cyan, 1.2 * k, 1);
    B.line(l.x1, l.y1, l.x2, l.y2, 2 * k, COL.white, k, 0);
  }
  for (const l of g.lashes) {                   // Rose Whip: a thorny crescent sweeping across
    const k = Math.min(1, l.t / 0.26), sweep = -l.half + 2 * l.half * Math.min(1, k * 1.6);
    const linger = Math.max(0, l.t - 0.26) / Math.max(0.01, l.dur - 0.26);
    const fade = (l.t < 0.26 ? 1 : 1 - 0.65 * linger) * (0.85 + 0.15 * Math.sin(t * 30));
    const mid = l.ang + (sweep - l.half) / 2, half = (sweep + l.half) / 2;
    B.arc(l.x, l.y, l.R * 0.92, mid, half, 7, COL.rose, 0.9 * fade, 1.2);
    B.arc(l.x, l.y, l.R * 0.92, mid, half, 2, COL.white, fade, 0);
    for (let i = 0; i <= 6; i++) {
      const an = l.ang - l.half + (i / 6) * (sweep + l.half);
      const px = l.x + Math.cos(an) * l.R * 0.92, py = l.y + Math.sin(an) * l.R * 0.92;
      B.ngon(px, py, 7, 3, an + Math.PI / 2, COL.lime, fade, 1.4, 0.6, 0.6, 0);
    }
    const tip = l.ang + sweep;
    B.heart(l.x + Math.cos(tip) * l.R, l.y + Math.sin(tip) * l.R, 11, tip, COL.hot, fade, 2, 0.8, 1.2, 0);
  }
  for (const r of g.rangs) {                    // The Ex
    if (!vis(r.x, r.y, 40)) continue;
    const col = r.saw > 0 ? COL.hot : COL.rose;
    B.glow(r.x, r.y, r.r * 2.4, r.r * 2.4, 0, col, 0.35);
    B.heart(r.x, r.y, r.r, r.rot, col, 1, 2.6, 0.45, 1.2, 0.8);
    B.heart(r.x, r.y, r.r * 0.45, r.rot, COL.white, 1, 0, 1, 0.8, 0);
    if (r.saw > 0) for (let i = 0; i < 6; i++) {
      const an = r.rot * 1.4 + (i / 6) * TAU;
      B.ngon(r.x + Math.cos(an) * r.r * 1.2, r.y + Math.sin(an) * r.r * 1.2, 6, 3, an, COL.white, 0.9, 1.2, 0.7, 0.8, 0);
    }
  }
  const m = g.mirror;
  if (m) {                                      // Mirror Ball
    const fl = m.flash;
    B.line(m.x, m.y - 30, m.x, m.y - 60, 1, COL.white, 0.3, 0);
    B.glow(m.x, m.y, 64, 64, 0, COL.cyan, 0.1 + 0.2 * fl);
    B.circle(m.x, m.y, 24, tint(COL.violet, COL.cyan, 0.2 + 0.4 * fl).slice(), 1, 2.2, 0.3, 0.8, 0.9);
    for (let i = 0; i < 3; i++) {
      const yy = m.y - 14 + i * 14, w = Math.sqrt(Math.max(0, 24 * 24 - (yy - m.y) ** 2));
      B.line(m.x - w, yy, m.x + w, yy, 1, COL.white, 0.5, 0);
    }
    for (let i = 0; i < 4; i++) {
      const ph = ((m.rot + i * 0.8) % 3.2) / 3.2 * 2 - 1;
      B.line(m.x + ph * 22, m.y - 18, m.x + ph * 22, m.y + 18, 1, COL.white, 0.4 * (1 - Math.abs(ph)), 0);
    }
    for (let i = 0; i < 4; i++) {
      const an = m.rot * 2 + i * 1.9;
      B.star(m.x + Math.cos(an) * 16, m.y + Math.sin(an * 1.3) * 16, 2.5 + 1.5 * fl, 4, an, COL.white, 0.5 + 0.3 * fl, 0, 1, 0.6, 0);
    }
  }
  for (const L of g.letters) {                  // Love Letter
    if (!vis(L.x, L.y, 30)) continue;
    B.glow(L.x, L.y, 50, 50, 0, COL.pink, 0.35);
    envelope(B, L.x, L.y, 16, L.rot, 1);
  }
  const d = g.decoy;
  if (d) {                                      // Heart of Gold decoy
    const k = d.t / d.dur, fl = 0.5 + 0.5 * Math.sin(t * (6 + k * 30));
    B.glow(d.x, d.y, 110, 110, 0, COL.gold, 0.3 + 0.3 * fl);
    B.heart(d.x, d.y, 26 * (1 + 0.08 * fl), Math.PI / 2, tint(COL.gold, COL.white, k * fl).slice(), 1, 2.6, 0.5, 1.3, 0.8);
    B.arc(d.x, d.y, 44, -Math.PI / 2, Math.PI * (1 - k), 2.4, COL.gold, 0.8, 1);
    if (k > 0.7) B.ring(d.x, d.y, 280, COL.gold, 0.25 + 0.4 * fl, 1.5, 0.6);
  }
}

// ------------------------------------------------------------------ stage hazards
function drawHazards(g, B, t, vis) {
  const hz = g.hz;
  if (!hz) return;
  if (hz.prisms) for (const pr of hz.prisms) {
    if (!vis(pr.x, pr.y, 60)) continue;
    const c = tint(COL.ice, COL.white, Math.max(pr.hit, pr.charge)).slice();
    B.glow(pr.x, pr.y, 90 + 60 * pr.charge, 90 + 60 * pr.charge, 0, COL.ice, 0.25 + 0.3 * pr.hit + 0.4 * pr.charge);
    if (pr.charge > 0) for (let i = 0; i < 3; i++) B.arc(pr.x, pr.y, pr.r * (2.6 - 1.4 * pr.charge), pr.rot + (i / 3) * TAU, 0.35, 2, COL.white, pr.charge, 1);
    B.star(pr.x, pr.y, pr.r * 1.25, 4, pr.rot, c, 1, 2.4, 0.35, 1, 0.9, 0.55);
    B.star(pr.x, pr.y, pr.r * 0.6, 4, -pr.rot * 1.4, COL.pink, 0.9, 1.6, 0.3, 1, 0, 0.5);
  }
  if (hz.pylons) for (const py of hz.pylons) {
    if (py.ax === undefined) continue;
    for (const [x, y] of [[py.ax, py.ay], [py.bx, py.by]]) {
      B.ngon(x, y, 22, 6, t * 0.8, tint(COL.blue, COL.white, py.glow).slice(), 1, 2.4, 0.3, 1, 0.9);
      B.circle(x, y, 7 + 5 * py.glow, COL.cyan, 1, 0, 1, 1 + py.glow, 0);
    }
    if (!(py.arc && !py.arc.dead)) B.line(py.ax, py.ay, py.bx, py.by, 1, COL.blue, 0.12, 0);
  }
  if (hz.rifts) for (const rf of hz.rifts) {
    if (!vis(rf.x, rf.y, rf.R)) continue;
    B.circle(rf.x, rf.y, rf.core, [0.02, 0.0, 0.04], 1, 0, 1, 0, 1);
    B.ring(rf.x, rf.y, rf.core, COL.hot, 0.9, 2.5, 1.2);
    for (let i = 0; i < 4; i++) {
      const rr = rf.R * (1 - ((t * 0.5 + i / 4) % 1));
      B.ring(rf.x, rf.y, rr, COL.violet, 0.35 * (1 - rr / rf.R), 1.5, 0.5);
    }
    for (let i = 0; i < 3; i++) B.arc(rf.x, rf.y, rf.core * 2.2, -t * 2.2 + (i / 3) * TAU, 0.7, 2.5, COL.pink, 0.7, 1);
  }
  if (hz.fx !== undefined) {                    // currents: streaks drifting with the flow
    const S = Math.hypot(hz.fx, hz.fy) || 1, ux = hz.fx / S, uy = hz.fy / S, cam = g.cam;
    const W = g.viewHalf.x + 200, H = g.viewHalf.y + 200;
    for (let i = 0; i < 70; i++) {
      const h1 = ((i * 7919) % 1000) / 1000, h2 = ((i * 104729) % 1000) / 1000;
      const off = ((t * S * 1.4 + i * 137) % 700) - 350;
      const x = cam.x + (h1 * 2 - 1) * W + ux * off, y = cam.y + (h2 * 2 - 1) * H + uy * off;
      const L = 26 + 30 * h2;
      B.line(x, y, x + ux * L, y + uy * L, 1.4, COL.teal, 0.22 * Math.min(1, S / 100), 0.5);
    }
  }
  if (hz.waves) for (const w of hz.waves) {         // flare fire waves rolling outward
    const fade = 1 - w.r / w.max, fl = 0.8 + 0.2 * Math.sin(t * 30 + w.r * 0.1);
    B.ring(w.x, w.y, w.r, COL.orange, (0.5 + 0.5 * fade) * fl, 7, 1.2);
    B.ring(w.x, w.y, w.r - 5, COL.red, 0.5 * fade, 3, 0.8);
    B.ring(w.x, w.y, w.r + 4, COL.gold, 0.6 * fade * fl, 1.5, 1);
  }
  if (hz.pools) for (const w of hz.pools) {         // whirlpools: a closing spiral, then a burst
    if (!vis(w.x, w.y, w.r * 1.6)) continue;
    const k = Math.min(1, w.t / w.dur), warn = k > 0.75 ? 0.5 + 0.5 * Math.sin(t * 40) : 0;
    B.circle(w.x, w.y, w.r, COL.teal, 0.08 + 0.14 * k, 0, 1, 0, 0);
    B.ring(w.x, w.y, w.r, tint(COL.teal, COL.white, warn).slice(), 0.5 + 0.4 * k, 2.2, 0.8);
    B.ring(w.x, w.y, w.r * (1 - k), COL.cyan, 0.8, 2.5, 1);
    for (let i = 0; i < 5; i++) {
      const a = w.spin * t * (2 + 3 * k) + (i / 5) * TAU;
      B.arc(w.x, w.y, w.r * (0.35 + 0.12 * i), a, 0.9, 2, COL.cyan, 0.35 + 0.4 * k, 0.6);
    }
  }
}

function drawGates(g, B, glyphs, t) {
  for (const gt of g.gates) {
    const sec = SECTOR_BY_ID[gt.id], c = sec.c3, k = Math.min(1, gt.t * 2);
    const r = gt.r * (0.6 + 0.4 * k);
    B.glow(gt.x, gt.y, r * 2.6, r * 2.6, 0, sec.grid, 0.55 * k);
    B.circle(gt.x, gt.y, r, sec.c1, 0.85 * k, 0, 1, 0, 1);
    B.ring(gt.x, gt.y, r, c, k, 3.5, 1.4);
    B.ring(gt.x, gt.y, r * 1.18 + 4 * Math.sin(t * 4), sec.grid, 0.6 * k, 1.5, 1);
    for (let i = 0; i < 4; i++) B.arc(gt.x, gt.y, r * (0.45 + 0.12 * i), t * (2 + i * 0.6) * (i % 2 ? -1 : 1) + i, 0.9, 2.5, i % 2 ? COL.white : c, 0.7 * k, 1);
    if (glyphs) {
      glyphs.draw(B, sec.name, gt.x, gt.y - r - 46, 15, [1.6, 1.6, 1.6], k);
      glyphs.draw(B, sec.hazard, gt.x, gt.y + r + 34, 11, c, k * 0.9);
    }
  }
}

function drawLasers(g, B, t) {
  for (const l of g.lasers) {
    if (l.dead) continue;
    if (l.pendulum) {                            // the pendulum's reach: stay outside this arc
      B.arc(l.x, l.y, l.len, l.base, l.swing + 0.08, 3, COL.amber, 0.55, 1);
      B.arc(l.x, l.y, l.len + 10, l.base, l.swing + 0.08, 1.2, COL.amber, 0.25, 0.5);
    }
    const x2 = l.x + Math.cos(l.ang) * l.len, y2 = l.y + Math.sin(l.ang) * l.len;
    const lc = l.kind === 'comet' || l.kind === 'prism' ? COL.ice : l.kind === 'arc' ? COL.cyan : l.ekg ? COL.hot : COL.red;
    if (l.t < l.warn) {
      const k = l.t / l.warn;
      const fl = 0.5 + 0.5 * Math.sin(t * (14 + k * 40));
      B.line(l.x, l.y, x2, y2, 1.2 + k * 2, lc, (0.25 + 0.5 * k) * (0.6 + 0.4 * fl), 0.5);
    } else if (l.kind === 'comet') {             // a comet tearing along its streak
      const q = clamp((l.t - l.warn) / l.dur, 0, 1), fade = 1 - q;
      B.line(l.x, l.y, x2, y2, l.w * 0.45 * fade + 2, COL.ice, 1.1 * fade + 0.2, 1);
      B.line(l.x, l.y, x2, y2, l.w * 0.15 * fade + 1, COL.white, fade, 0);
      const hx = l.x + (x2 - l.x) * q, hy = l.y + (y2 - l.y) * q;
      B.star(hx, hy, 26, 5, t * 12, COL.white, 1, 2.5, 0.9, 1, 0);
      B.glow(hx, hy, 160, 26, l.ang, COL.ice, 1);
    } else if (l.kind === 'arc') {              // tesla arc: a jittering bolt
      const n = 9, nx = -Math.sin(l.ang), ny = Math.cos(l.ang);
      let px = l.x, py = l.y;
      for (let i = 1; i <= n; i++) {
        const f = i / n, j = i === n ? 0 : Math.sin(t * 71 + i * 3.7) * 18 + Math.sin(t * 43 + i * 9.1) * 10;
        const qx = l.x + (x2 - l.x) * f + nx * j, qy = l.y + (y2 - l.y) * f + ny * j;
        B.line(px, py, qx, qy, 6, COL.cyan, 1.2, 1);
        B.line(px, py, qx, qy, 2, COL.white, 1, 0);
        px = qx; py = qy;
      }
    } else if (l.kind === 'prism') {            // a ray of refracted light
      const fl = 0.85 + 0.15 * Math.sin(t * 50 + l.ang * 9);
      B.line(l.x, l.y, x2, y2, l.w * 0.5 * fl, COL.ice, 1.2, 1);
      B.line(l.x, l.y, x2, y2, l.w * 0.22, COL.pink, 0.9, 0.6);
      B.line(l.x, l.y, x2, y2, l.w * 0.1, COL.white, 1.1, 0);
    } else if (l.ekg) {                          // Flatline wall
      const fl = 0.85 + 0.15 * Math.sin(t * 50);
      B.line(l.x, l.y, x2, y2, l.w * 0.5 * fl, COL.hot, 1.3, 1);
      B.line(l.x, l.y, x2, y2, l.w * 0.18, COL.white, 1.1, 0);
      B.circle(x2, y2, 9, COL.white, 1, 0, 1, 1.2, 0);
    } else if (l.thread) {                       // Weaver silk
      const fl = 0.8 + 0.2 * Math.sin(t * 23 + l.x * 0.01);
      B.line(l.x, l.y, x2, y2, l.w * 0.42 * fl, COL.lime, 1.1, 1);
      B.line(l.x, l.y, x2, y2, l.w * 0.14, COL.white, 1, 0);
    } else {
      const fl = 0.85 + 0.15 * Math.sin(t * 60);
      B.line(l.x, l.y, x2, y2, l.w * 0.5 * fl, COL.red, 1.3, 1);
      B.line(l.x, l.y, x2, y2, l.w * 0.2, COL.white, 1.2, 0);
    }
  }
}

function drawPickups(g, B, t, vis) {
  const gold = g.stats.fus.goldrush;
  for (const k of g.pickups) {
    if (k.dead || !vis(k.x, k.y)) continue;
    if (k.kind === 'xp') {
      const s = 4.5 + Math.min(4, k.val);
      const bob = 1 + 0.08 * Math.sin(t * 7 + k.x * 0.05);
      if (k.big) {                               // Attraction: a golden heart worth double
        const bs = 11 * bob;
        B.glow(k.x, k.y, 40, 40, 0, COL.gold, 0.3);
        B.heart(k.x, k.y, bs, Math.PI / 2, COL.gold, 1, 1.8, 0.55, 0.9, 0);
      } else if (gold && k.pull) {               // Gold Rush: a golden stream
        const sp = Math.hypot(k.vx, k.vy) || 1;
        B.glow(k.x - k.vx / sp * 14, k.y - k.vy / sp * 14, 26, 6, Math.atan2(k.vy, k.vx), COL.gold, 0.8);
        B.heart(k.x, k.y, (s + 1.5) * bob, Math.PI / 2, COL.gold, 1, 1.2, 0.5, 0.6, 0);
      } else {                                   // XP: little upright pink hearts
        // kept soft on purpose: hundreds of these can be on screen and bright fills stack into a bloom haze
        B.heart(k.x, k.y, (s + 1.5) * bob, Math.PI / 2, XP_PINK, 0.95, 1.1, 0.45, 0.45, 0);
      }
    } else if (k.kind === 'heart') {             // healing: a big red heart with a white cross
      const hs = 14 + Math.sin(t * 6) * 2;
      B.glow(k.x, k.y, 46, 46, 0, COL.red, 0.35);
      B.heart(k.x, k.y, hs, Math.PI / 2, COL.red, 1, 2.4, 0.8, 1.2);
      B.plus(k.x, k.y - 1, hs * 0.38, 0, COL.white, 1, 0, 1, 0.8, 0);
    } else {
      const s = 26 + Math.sin(t * 5) * 3;
      B.ring(k.x, k.y, 44 + Math.sin(t * 3) * 4, COL.gold, 0.7, 2, 1);
      B.heart(k.x, k.y, s, Math.PI / 2, COL.rose, 1, 3, 0.8, 1);
      B.star(k.x, k.y - 4, 9, 4, t * 2, COL.white, 1, 0, 1, 0, 0);
    }
  }
}

// ------------------------------------------------------------------ enemies
function drawEnemy(g, B, e, t, beat) {
  const def = e.def;
  let base = COL[def.col] || COL.cyan;
  if (e.spawn > 0) {                         // warp-in portal
    const k = clamp(1 - e.spawn / (e.boss ? 2 : 0.8), 0, 1);
    B.ring(e.x, e.y, e.r * (2.6 - 1.6 * k), base, 0.35 + 0.5 * k, 2, 1);
    B.push(0, e.x, e.y, e.r * k, e.r * k, 0, base, 0.5 * k, 0, 0.6, 1);
    if (e.boss) for (let i = 0; i < 3; i++) B.arc(e.x, e.y, e.r * (3.4 - 1.6 * k), t * 3 + (i / 3) * TAU, 0.7, 3, base, 0.8, 1);
    return;
  }
  let a = 1;
  if (e.faded) a = 0.13 + 0.05 * Math.sin(t * 8 + e.seed * 10);
  const dk = g.dark;
  if (dk && dk.hz) {                          // Dimming: the swarm hides outside your light
    const dd = Math.hypot(e.x - dk.x, e.y - dk.y);
    a *= 1 - 0.78 * dk.k * clamp((dd - dk.r * 0.75) / (dk.r * 0.5), 0, 1);
  }
  // status tinting
  let c = base;
  if (e.charm > 0) c = COL.rose;
  else if (e.frozen > 0) c = COL.ice;
  else if (e.chill > 0.05) c = tint(base, COL.ice, Math.min(1, e.chill * 1.3)).slice();
  if (e.ghost) { c = tint(c, COL.ghost, 0.6).slice(); a *= 0.6 + 0.15 * Math.sin(t * 6 + e.seed * 9); }
  if (e.flash > 0) c = tint(c, COL.white, e.flash).slice();
  const x = e.x, y = e.y, r = e.r, rot = e.rot;
  if (e.guardT > 0 && e.guard && !e.guard.dead) {     // a Chaperone's link: a gold shield
    const g2 = e.guard, fl = 0.6 + 0.4 * Math.sin(t * 10 + e.seed * 7);
    B.line(g2.x, g2.y, x, y, 1.6, COL.gold, 0.35 + 0.2 * fl, 0.6);
    B.ngon(x, y, r * 1.6, 6, t * 0.6, COL.gold, 0.55 + 0.3 * fl, 1.8, 0.08, 1, 0);
  }

  switch (e.type) {
    case 'drifter':
      B.ngon(x, y, r * 1.15, 3, rot, c, a, 2, 0.3);
      B.ngon(x, y, r * 0.45, 3, rot + Math.PI, c, a, 0, 0.9, 0, 0);
      break;
    case 'mote':
      B.box(x, y, r * 0.85, r * 0.85, rot, c, a, 1.6, 0.6, 1, 0.6, 1);
      break;
    case 'lancer':
      if (e.state === 1) {
        const k = 1 - e.timer / 0.7;
        B.line(x, y, x + Math.cos(rot) * 560, y + Math.sin(rot) * 560, 1 + k * 2.5, COL.orange, 0.25 + 0.6 * k, 0.4);
      }
      if (e.state === 2) B.glow(x - Math.cos(rot) * 34, y - Math.sin(rot) * 34, 60, 12, rot, COL.orange, 1);
      B.chevron(x, y, r * 1.25, rot, e.state === 1 ? tint(c, COL.white, 0.5 + 0.5 * Math.sin(t * 40)) : c, a, 2.2, 0.35);
      break;
    case 'spitter':
      B.ngon(x, y, r * 1.1, 5, rot, c, a, 2, 0.25);
      B.circle(x + Math.cos(rot) * r * 0.45, y + Math.sin(rot) * r * 0.45, r * 0.3, c, a, 0, 1, e.timer < 0.4 ? 1 : 0, 0);
      break;
    case 'splitter':
      B.ngon(x, y, r * 1.08, 6, rot, c, a, 2.4, 0.2);
      if (e.gen < 2) B.ngon(x, y, r * 0.6, 6, -rot * 1.5, c, a, 1.6, 0.15, 0, 0);
      if (e.gen < 1) B.ngon(x, y, r * 0.28, 6, rot * 2, c, a, 0, 0.9, 0, 0);
      break;
    case 'bomber': {
      const arming = e.state === 1;
      const pul = arming ? 0.5 + 0.5 * Math.sin(t * 50) : 0.5 + 0.5 * Math.sin(t * 8 + e.seed * 9);
      B.circle(x, y, r * (1 + 0.08 * pul), arming ? tint(c, COL.white, pul) : c, a, 2.2, 0.25 + 0.3 * pul);
      B.plus(x, y, r * 0.5, rot, c, a, 0, 1, 0, 0);
      break;
    }
    case 'warden': {
      B.box(x, y, r * 0.9, r * 0.9, rot + Math.PI / 4, c, a, 2.4, 0.25, 1, 0.8, 5);
      B.circle(x, y, r * 0.3, c, a, 0, 1, 0, 0);
      const sh = def.shieldArc, hit = Math.max(0, e.shieldHit || 0);
      if (e.shieldHp <= 0) {
        const k = (e.shieldDown || 0) / 4;
        B.arc(x, y, sh.r, rot, sh.half * k, 1.2, COL.blue, a * 0.4, 0);
        break;
      }
      B.arc(x, y, sh.r, rot, sh.half, 3.5 + hit * 3, tint(COL.blue, COL.white, hit), a * (0.85 + hit), 1);
      B.arc(x, y, sh.r - 8, rot, sh.half * 0.8, 1.2, COL.cyan, a * 0.5, 0);
      break;
    }
    case 'pinwheel': {
      const firing = e.state === 1;
      B.star(x, y, r * 1.35, 3, rot, firing ? tint(c, COL.white, 0.35) : c, a, 2.4, firing ? 0.5 : 0.25, 1, 0.8, 0.3);
      B.circle(x, y, r * 0.32, c, a, 1.6, firing ? 1 : 0.4, 0, 0.9);
      break;
    }
    case 'phantom': {
      if (e.state === 1) a = 0.4 + 0.6 * Math.abs(Math.sin(t * 28));
      B.crescent(x, y, r * 1.2, rot, c, a, 2.2, 0.25, e.faded ? 0 : 1, e.faded ? 0 : 0.6);
      if (e.state === 1) B.line(x, y, x + Math.cos(rot) * 330, y + Math.sin(rot) * 330, 1.5, COL.ghost, 0.4, 0.3);
      if (!e.faded) B.circle(x - Math.cos(rot) * r * 0.2, y - Math.sin(rot) * r * 0.2, r * 0.2, c, a, 0, 1, 0, 0);
      break;
    }
    case 'ray': {
      B.box(x, y, r * 1.5, r * 0.55, rot, c, a, 2, 0.3, 1, 0.8, 3);
      const ch = e.state === 1 ? clamp(1 - (e.timer - 0.4) / 1.35, 0, 1) : 0;
      B.circle(x + Math.cos(rot) * r, y + Math.sin(rot) * r, r * (0.28 + 0.4 * ch), tint(c, COL.white, ch), a, 0, 1, ch > 0 ? 1 : 0, 0);
      break;
    }
    case 'leech': {
      B.ring(x, y, r * 1.1, c, a, 2.2, 1);
      B.star(x, y, r * 0.8, 6, rot, c, a, 1.6, 0.4, 0, 0.8, 0.55);
      if (e.tether && !e.charm) {
        const p = g.player, k = ((e.drainT || 0) / 4);
        B.line(x, y, p.x, p.y, 1.4 + k * 1.6, COL.violet, 0.45 + 0.4 * Math.sin(t * 12), 0.5);
        const f = (t * 1.6) % 1;
        B.glow(x + (p.x - x) * (1 - f), y + (p.y - y) * (1 - f), 9, 9, 0, COL.violet, 1);
        if (k > 0.7) B.ring(p.x, p.y, 38 - 10 * Math.sin(t * 25), COL.violet, 0.8, 2, 1);
      }
      break;
    }
    case 'hive': {
      const pul = 0.5 + 0.5 * Math.sin(t * 3 + e.seed * 6);
      B.ngon(x, y, r * 1.05, 8, rot, c, a, 3, 0.18);
      for (let i = 0; i < 3; i++) {
        const an = rot * -2 + (i / 3) * TAU;
        B.ngon(x + Math.cos(an) * r * 0.42, y + Math.sin(an) * r * 0.42, r * 0.26, 6, an, COL.lime, a, 1.4, 0.3 + 0.5 * pul, 0, 0);
      }
      break;
    }
    case 'wyrm':
      B.chevron(x, y, r * 1.35, rot, c, a, 2.6, 0.4);
      B.circle(x + Math.cos(rot) * r * 0.2, y + Math.sin(rot) * r * 0.2, r * 0.22, COL.white, a, 0, 1, 0, 0);
      break;
    case 'wyrmseg':
      B.circle(x, y, r * (0.95 - e.idx * 0.035), c, a, 2, 0.15);
      B.box(x, y, r * 0.3, r * 0.3, rot, c, a, 0, 0.7, 0, 0);
      break;
    case 'ouroseg': {
      const s = r * (1 - e.idx * 0.018);
      B.circle(x, y, s, c, a, 3, 0.15);
      B.ngon(x, y, s * 0.5, 4, rot, c, a, 1.6, 0.5, 0, 0);
      break;
    }
    case 'ouroboros': {
      if (e.state === 1) B.line(x, y, x + Math.cos(rot) * 1300, y + Math.sin(rot) * 1300, 2 + (1 - e.timer / 0.95) * 5, COL.red, 0.5, 0.5);
      B.ngon(x, y, r * 1.25, 5, rot, c, a, 3.5, 0.3);
      B.chevron(x + Math.cos(rot) * r * 0.2, y + Math.sin(rot) * r * 0.2, r * 0.6, rot, COL.white, a, 0, 0.9, 0, 0);
      break;
    }
    case 'plate':
      B.box(x, y, 9, 27, rot, c, a, 2.2, 0.4, 1, 0.9, 4);
      break;
    case 'monolith': {
      const rage = e.hp < e.maxHp * 0.5;
      const cc = rage ? tint(c, COL.hot, 0.6).slice() : c;
      B.ngon(x, y, r * 1.12, 6, rot, cc, a, 4, 0.16);
      B.ngon(x, y, r * 0.72, 6, -rot * 1.6, cc, a, 2.5, 0.12, 0, 0);
      B.ngon(x, y, r * 0.36 * (1 + 0.15 * beat), 6, rot * 2.5, rage ? COL.hot : COL.white, a, 0, 0.95, 1, 0);
      break;
    }
    case 'binary': {
      const cc = e.idx === 1 ? (e.flash > 0 ? tint(COL.cyan, COL.white, e.flash).slice() : COL.cyan) : c;
      if (e.enraged && e.state === 1) B.line(x, y, x + Math.cos(e.da) * 1100, y + Math.sin(e.da) * 1100, 2 + (1 - e.timer / 0.75) * 4, COL.red, 0.55, 0.5);
      B.star(x, y, r * 1.3, 8, rot, cc, a, 3, 0.25, 1, 0.8, 0.72);
      B.circle(x, y, r * 0.5 * (1 + 0.12 * beat), e.enraged ? COL.white : cc, a, 0, 1, 1, 0);
      if (e.enraged) B.ring(x, y, r * 1.6 + 6 * Math.sin(t * 20), COL.red, 0.7, 2, 1);
      break;
    }
    case 'hollow': {
      const thump = Math.exp(-(e.pulse || 0) * 4);
      const s = r * (1.15 + 0.14 * thump + 0.04 * beat);
      if (e.state === 4 && e.sub === 0) B.line(x, y, x + Math.cos(e.da) * 1200, y + Math.sin(e.da) * 1200, 2 + (1 - e.timer / 0.7) * 5, COL.red, 0.55, 0.5);
      B.ring(x, y, s * 1.55, COL.dark, 0.6, 2, 1);
      B.broken(x, y, s, rot, e.flash > 0 ? tint(COL.hot, COL.white, e.flash) : COL.hot, a, 4, 0.1, 1, 1);
      B.heart(x, y, s * 0.42, rot, COL.violet, a, 2, 0.6 + 0.4 * thump, 1, 0);
      if (e.state === 3) for (let i = 0; i < 3; i++) B.ring(x, y, 520 * (1 - ((t * 0.9 + i / 3) % 1)), COL.violet, 0.3, 2, 0.6);
      break;
    }
    case 'shatter': {
      const enc = e.shards && e.shards.length > 0;
      B.heart(x, y, r * 1.1, Math.PI / 2, c, a, 3.5, 0.18);
      B.broken(x, y, r * 0.62, Math.PI / 2, COL.rose, a, 2.2, 0.35, 1, 0);
      for (let i = 0; i < 5; i++) {                         // facets
        const an = rot + (i / 5) * TAU;
        B.line(x, y, x + Math.cos(an) * r * 0.75, y + Math.sin(an) * r * 0.75, 1.2, COL.ice, 0.4 * a, 0.3);
      }
      if (enc) B.ngon(x, y, r * 1.55, 6, rot, COL.ice, 0.75, 2.2, 0.1, 1, 0);
      break;
    }
    case 'shard': {
      if (e.state === 1) B.line(x, y, x + Math.cos(e.da) * 520, y + Math.sin(e.da) * 520, 2, COL.red, 0.5, 0.5);
      B.heart(x, y, r, rot, e.life <= 0 ? COL.rose : c, a, 2.4, 0.35);
      break;
    }
    case 'weaver': {
      for (let i = 0; i < 8; i++) {                         // legs
        const side = i < 4 ? -1 : 1, k = i % 4;
        const base = rot + side * (0.7 + k * 0.55);
        const wig = Math.sin(t * 6 + i) * 0.12;
        const kx = x + Math.cos(base + wig) * r * 1.5, ky = y + Math.sin(base + wig) * r * 1.5;
        const fx2 = kx + Math.cos(base + side * 0.6) * r * 0.9, fy2 = ky + Math.sin(base + side * 0.6) * r * 0.9;
        B.line(x, y, kx, ky, 2.4, c, a, 0.6);
        B.line(kx, ky, fx2, fy2, 2, c, a, 0.6);
      }
      B.ngon(x, y, r, 6, rot, c, a, 3, 0.3);
      B.circle(x + Math.cos(rot) * r * 0.75, y + Math.sin(rot) * r * 0.75, r * 0.38, c, a, 2, 0.4);
      for (const s of [-1, 1]) B.circle(x + Math.cos(rot + s * 0.3) * r * 0.95, y + Math.sin(rot + s * 0.3) * r * 0.95, 3.5, COL.red, a, 0, 1, 1, 0);
      if (e.armor < 1) B.ring(x, y, r * 1.45, COL.lime, 0.45 + 0.2 * Math.sin(t * 5), 1.4, 1);
      break;
    }
    case 'chaperone': {                         // a winged lantern
      const fl = 0.5 + 0.5 * Math.sin(t * 5 + e.seed * 6);
      B.glow(x, y, r * 3, r * 3, 0, COL.gold, 0.25 + 0.15 * fl);
      B.ngon(x, y, r * 1.05, 4, Math.PI / 4, c, a, 2.4, 0.3, 1.1);
      B.circle(x, y, r * 0.42, COL.white, a, 0, 1, 1 + fl, 0);
      for (const sd of [-1, 1]) B.arc(x + sd * r * 0.9, y - r * 0.2, r * 0.9, sd > 0 ? -0.3 : Math.PI + 0.3, 0.9, 2, c, a * 0.8, 0.8);
      B.ring(x, y, 380, COL.gold, 0.06 + 0.04 * fl, 1, 0);
      break;
    }
    case 'siren': {                             // a crescent singer with notes rippling out
      const sing = e.state === 1, fl = 0.5 + 0.5 * Math.sin(t * 9);
      if (sing) for (let i = 0; i < 3; i++) B.ring(x, y, r * (1.6 + ((t * 1.5 + i / 3) % 1) * 4), COL.rose, 0.45 * (1 - ((t * 1.5 + i / 3) % 1)), 1.6, 0.8);
      B.crescent(x, y, r * 1.15, rot, sing ? tint(c, COL.white, 0.4 * fl).slice() : c, a, 2.2, 0.3, 1);
      B.heart(x, y, r * 0.45, Math.PI / 2, COL.hot, a, 0, 1, 1, 0);
      if (e.state === 2) for (let i = 0; i < 3; i++) B.star(x + Math.cos(t * 4 + i * 2.1) * r * 1.3, y - r * 1.1 + Math.sin(t * 4 + i * 2.1) * 6, 4, 4, t * 3, COL.white, 0.9, 0, 1, 0.6, 0);
      break;
    }
    case 'mourner': {                           // a hooded wisp; a beam when it raises the dead
      if (e.raise) {
        const q = clamp(e.raise.t / 0.8, 0, 1);
        B.line(x, y, e.raise.x, e.raise.y, 1.5 + 3 * q, COL.ghost, 0.4 + 0.5 * q, 0.8);
        B.ring(e.raise.x, e.raise.y, 30 * (1.4 - q), COL.ghost, 0.5 + 0.5 * q, 2, 1);
      }
      B.ngon(x, y + r * 0.15, r * 1.15, 3, -Math.PI / 2, c, a, 2.2, 0.25, 1);
      B.circle(x, y - r * 0.15, r * 0.5, [0.05, 0.04, 0.1], a, 0, 1, 0, 1);
      B.circle(x - r * 0.18, y - r * 0.2, 2.5, COL.violet, a, 0, 1, 1.4, 0);
      B.circle(x + r * 0.18, y - r * 0.2, 2.5, COL.violet, a, 0, 1, 1.4, 0);
      break;
    }
    case 'pod': {
      const sw = clamp((e.swell || 0) / 0.75, 0, 1), pul = 0.5 + 0.5 * Math.sin(t * (4 + sw * 30) + e.seed * 9);
      B.circle(x, y, r * (1 + 0.3 * sw + 0.04 * pul), sw > 0.05 ? tint(c, COL.white, sw * pul).slice() : c, a, 2.2, 0.25 + 0.3 * sw, 1);
      for (let i = 0; i < 5; i++) {
        const an = rot + (i / 5) * TAU;
        B.circle(x + Math.cos(an) * r * 0.5, y + Math.sin(an) * r * 0.5, r * 0.16, COL.lime, a, 0, 0.9, 0.8, 0);
      }
      if (sw > 0.05) B.ring(x, y, 130 + r, COL.lime, 0.3 * sw, 1.2, 0.5);
      break;
    }
    case 'jar': {                                // Love Jar: glass, a glowing heart inside, a gold lid
      const life = clamp(e.life / 22, 0, 1), blink = life < 0.25 ? 0.55 + 0.45 * Math.sin(t * 18) : 1;
      const aa = a * blink, pul = 0.5 + 0.5 * Math.sin(t * 4 + e.seed * 7);
      B.glow(x, y, r * 3.4, r * 3.4, 0, COL.gold, (0.3 + 0.2 * pul) * aa);
      B.box(x, y + 3, r * 0.95, r * 1.15, rot, tint(COL.ice, COL.white, e.flash).slice(), aa, 2, 0.12, 0.8, 0.5, 8);
      B.box(x - Math.sin(rot) * r * 1.25, y - r * 1.2, r * 0.75, r * 0.22, rot, COL.gold, aa, 1.8, 0.7, 1, 0, 3);
      B.heart(x, y + 5, r * (0.62 + 0.06 * pul), Math.PI / 2 + rot, COL.hot, aa, 1.6, 0.9, 1.3, 0);
      B.star(x + r * 0.45, y - r * 0.35, 3 + 2 * pul, 4, t * 2, COL.white, aa, 0, 1, 1, 0);
      break;
    }
    case 'sac': {
      const q = clamp(1 - e.hatch / 5, 0, 1), pul = 0.5 + 0.5 * Math.sin(t * (3 + q * 20));
      B.circle(x, y, r * (1 + 0.1 * pul * q), c, a, 2, 0.2 + 0.4 * q * pul, 1);
      B.arc(x, y, r * 1.45, -Math.PI / 2 + q * Math.PI, q * Math.PI, 2, COL.lime, 0.7, 0.8);
      for (let i = 0; i < 3; i++) B.circle(x + Math.cos(rot + i * 2.1) * r * 0.4, y + Math.sin(rot + i * 2.1) * r * 0.4, 3, COL.white, a, 0, 1, 0.6, 0);
      break;
    }
    case 'anchor':
      B.star(x, y, r * 1.2, 6, rot, c, a, 2, 0.4);
      B.circle(x, y, r * 0.38, COL.white, a, 0, 1, 1, 0);
      break;
    case 'metronome': {
      B.ring(x, y, r * 1.35 * (1 + 0.12 * beat), COL.amber, 0.35 + 0.4 * beat, 2, 1);
      B.ngon(x, y + r * 0.1, r * 1.2, 3, -Math.PI / 2, c, a, 3.5, 0.2);
      const hx = x + Math.sin(e.rot) * r * 1.05, hy = y + r * 0.45 - Math.cos(e.rot) * r * 1.05;
      B.line(x, y + r * 0.45, hx, hy, 4, COL.white, a, 1);
      B.circle(hx, hy, 8, COL.amber, a, 2, 0.8);
      B.circle(x, y + r * 0.45, 6, COL.white, a, 0, 1, 1, 0);
      break;
    }
    case 'eclipse':
    case 'umbra': {
      // fades into the dark away from the player's light; the eyes always show
      const dk = g.dark;
      let seen = 1;
      if (dk) {
        const dd = Math.hypot(x - dk.x, y - dk.y);
        seen = 1 - dk.k * clamp((dd - dk.r * 0.8) / (dk.r * 0.55), 0, 1);
      }
      seen = Math.max(seen, e.reveal || 0);
      const aa = a * seen, fl = e.flare || 0;
      const winding = e.type === 'eclipse' ? e.state === 2 : e.state === 1;
      if (winding && e.da !== undefined) B.line(x, y, x + Math.cos(e.da) * 1100, y + Math.sin(e.da) * 1100, 2 + 3 * fl, COL.red, 0.55, 0.5);
      B.circle(x, y, r, [0.02, 0.012, 0.01], aa, 0, 1, 0, 1);
      B.ring(x, y, r * (1.06 + 0.03 * Math.sin(t * 7)), COL.gold, aa, 3, 1.4);
      for (let i = 0; i < 10; i++) {                        // corona rays
        const an = rot + (i / 10) * TAU, len = r * (1.35 + 0.15 * Math.sin(t * 3 + i * 1.7));
        B.line(x + Math.cos(an) * r * 1.1, y + Math.sin(an) * r * 1.1, x + Math.cos(an) * len, y + Math.sin(an) * len, 2, COL.gold, aa * 0.55, 1);
      }
      const ea = Math.atan2(g.player.y - y, g.player.x - x);
      for (const s of [-1, 1]) {
        const ex = x + Math.cos(ea) * r * 0.35 + Math.cos(ea + Math.PI / 2) * s * r * 0.28;
        const ey = y + Math.sin(ea) * r * 0.35 + Math.sin(ea + Math.PI / 2) * s * r * 0.28;
        B.circle(ex, ey, 4.5 + 4 * fl, fl > 0.2 ? COL.red : COL.gold, 1, 0, 1, 1.3 + fl, 0);
      }
      for (const ey of e.eyes || []) {                       // Blackout: eyes opening in the dark
        if (ey.bead) {                                       // Baily's Beads: a bright bead that fires its chord
          const q = clamp(1 + ey.t / 0.6, 0, 1);
          B.glow(ey.x, ey.y, 50, 50, 0, COL.gold, 0.3 + 0.5 * q);
          B.circle(ey.x, ey.y, 7 + 5 * q, ey.t > 0.4 ? COL.white : COL.gold, 1, 0, 1, 1.4 + q, 0);
          continue;
        }
        const q = clamp(ey.t / 0.6, 0, 1), ea2 = Math.atan2(g.player.y - ey.y, g.player.x - ey.x);
        B.glow(ey.x, ey.y, 70, 40, ea2 + Math.PI / 2, q > 0.7 ? COL.red : COL.gold, 0.25 + 0.5 * q);
        for (const s2 of [-1, 1]) {
          B.circle(ey.x + Math.cos(ea2 + Math.PI / 2) * s2 * 17, ey.y + Math.sin(ea2 + Math.PI / 2) * s2 * 17, 6 + 6 * q, q > 0.7 ? COL.red : COL.gold, 0.5 + 0.5 * q, 0, 1, 1.4 + q, 0);
        }
      }
      break;
    }
    default:
      B.circle(x, y, r, c, a);
  }

  if (e.elite) {
    const ec = ELITE_COL[e.elite];
    B.ring(x, y, r * 1.55 + 2 * Math.sin(t * 6 + e.seed * 5), ec, 0.75, 1.6, 1);
    for (let i = 0; i < 3; i++) {
      const an = t * 2.2 + (i / 3) * TAU;
      B.star(x + Math.cos(an) * r * 1.55, y + Math.sin(an) * r * 1.55, 5, 4, an, ec, 1, 0, 1, 0, 0);
    }
  }
  if (e.pins > 0 && e.pinA) {                    // Cupid's Quiver arrows
    const shake = e.pinT < 0.25 ? Math.sin(t * 80) * 2 : 0;
    for (const pa of e.pinA) {
      const an = pa + (e.rot || 0), ox = Math.cos(an), oy = Math.sin(an);
      B.line(x + ox * r * 0.6 + shake, y + oy * r * 0.6, x + ox * (r + 16) + shake, y + oy * (r + 16), 2, COL.rose, 0.9, 0.6);
      B.heart(x + ox * (r + 17), y + oy * (r + 17), 4, an, COL.pink, 0.9, 0, 1, 0.6, 0);
    }
  }
  if (e.frozen > 0) B.ngon(x, y, r * 1.35, 6, e.seed * 6, COL.ice, 0.9, 1.8, 0.18, 1, 0);
  if (e.charm > 0) B.heart(x, y - r - 14 - 3 * Math.sin(t * 6), 7, Math.PI / 2, COL.rose, 1, 0, 1, 1, 0);
  else if (e.envy > 0) {                       // Jealousy: green broken heart with stack ticks
    const my = y - r - 13, fa = Math.min(1, e.envyT * 2);
    B.broken(x, my, 6 + e.envy * 0.4, Math.PI / 2, ENVY, fa, 1.4, 0.6, 1, 0);
    for (let k = 0; k < e.envy; k++) B.box(x + (k - (e.envy - 1) / 2) * 5, my - 10, 1.6, 1.6, 0, ENVY, fa, 0, 1, 1, 0);
  }
  // health bar on anything sturdy that has been hurt
  if (!e.boss && !e.transfer && e.maxHp > 80 && e.hp < e.maxHp && e.type !== 'plate') {
    const w = r * 1.1, f = clamp(e.hp / e.maxHp, 0, 1);
    B.line(x - w, y + r + 12, x - w + 2 * w * f, y + r + 12, 1.6, f > 0.4 ? COL.white : COL.red, 0.8, 0);
  }
}

// ------------------------------------------------------------------ shots
function drawProjectiles(g, B, t, vis) {
  for (const p of g.projs) {
    if (p.dead || !vis(p.x, p.y)) continue;
    const c = Math.cos(p.ang), s = Math.sin(p.ang);
    const a = Math.min(1, p.life * 8);
    if (p.kind === 'heart' && p.beat) {         // On the Beat
      B.glow(p.x - c * 24, p.y - s * 24, 40, 11, p.ang, COL.gold, 0.9 * a);
      B.heart(p.x, p.y, p.r + 3, p.ang, COL.gold, a, 2.4, 0.8, 1.3, 0);
    } else if (p.kind === 'heart' && p.refr) {   // refracted through a prism
      B.glow(p.x - c * 22, p.y - s * 22, 36, 9, p.ang, COL.ice, 0.9 * a);
      B.heart(p.x, p.y, p.r + 3, p.ang, COL.ice, a, 2.2, 0.8, 1.3, 0);
    } else if (p.kind === 'heart') {
      B.glow(p.x - c * 20, p.y - s * 20, 30, 8, p.ang, COL.hot, 0.8 * a);
      B.heart(p.x, p.y, p.r + 2, p.ang, COL.pink, a, 2, 0.75, 1, 0);
    } else if (p.kind === 'half') {
      B.glow(p.x - c * 12, p.y - s * 12, 18, 5, p.ang, COL.rose, 0.7 * a);
      B.broken(p.x, p.y, p.r + 1, p.ang, COL.rose, a, 1.5, 0.8, 0, 0);
    } else if (p.kind === 'shard') {
      B.box(p.x, p.y, 11, 3.2, p.ang, COL.ice, a, 0, 1, 1, 0, 1);
    } else if (p.kind === 'letter') {             // Fan Mail
      B.glow(p.x - c * 14, p.y - s * 14, 24, 7, p.ang, COL.gold, 0.8 * a);
      envelope(B, p.x, p.y, 9, p.ang, a, COL.gold);
    } else {
      B.glow(p.x - c * 12, p.y - s * 12, 18, 5, p.ang, COL.pink, 0.7 * a);
      B.heart(p.x, p.y, p.r + 1, p.ang, COL.white, a, 0, 1, 1, 0);
    }
  }
  for (const b of g.beams) {
    const fl = 0.8 + 0.2 * Math.sin(t * 50 + b.x1);
    B.line(b.x1, b.y1, b.x2, b.y2, 7 * fl, COL.pink, 1.2, 1);
    B.line(b.x1, b.y1, b.x2, b.y2, 2.6, COL.white, 1.1, 0);
    const k = (t * 2.5) % 1;
    for (let i = 0; i < 3; i++) {
      const f = (k + i / 3) % 1;
      B.heart(b.x1 + (b.x2 - b.x1) * f, b.y1 + (b.y2 - b.y1) * f, 9, Math.atan2(b.y2 - b.y1, b.x2 - b.x1), COL.white, 1 - f, 0, 1, 0, 0);
    }
  }
  for (const b of g.flashBeams) {
    const a = b.t / b.max;
    if (b.spot) {                                 // Mirror Ball spotlight: a widening cone
      const ang = Math.atan2(b.y2 - b.y1, b.x2 - b.x1), len = Math.hypot(b.x2 - b.x1, b.y2 - b.y1);
      B.glow((b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2, len * 0.55, 26, ang, COL.gold, 0.55 * a);
      B.circle(b.x2, b.y2, 34, COL.gold, a, 2, 0.25, 1, 0);
    }
    B.line(b.x1, b.y1, b.x2, b.y2, 8 * a + 1, b.col || COL.rose, a * 1.4, 1);
    B.line(b.x1, b.y1, b.x2, b.y2, 2.5 * a, COL.white, a * 1.3, 0);
  }
}

function drawBullets(g, B, t, vis) {
  for (const b of g.bullets) {
    if (b.dead || !vis(b.x, b.y)) continue;
    const a = Math.min(1, b.t * 10) * Math.min(1, b.life * 3);
    if (b.kind === 'bheart') {
      B.broken(b.x, b.y, b.r + 3, b.ang, COL.hot, a, 2, 0.5, 1, 0.8);
    } else if (b.kind === 'spore') {
      B.circle(b.x, b.y, b.r, COL.lime, a * 0.9, 1.4, 0.35, 0.8, 0.6);
      B.circle(b.x, b.y, b.r * 0.35, COL.white, a * 0.6, 0, 1, 0.5, 0);
    } else if (b.kind === 'rubato') {
      const mv = clamp(b.spd / 880, 0, 1);
      B.ngon(b.x, b.y, b.r + 2, 4, b.ang + Math.PI / 4, tint(COL.amber, COL.white, mv).slice(), a, 1.8, 0.4 + 0.4 * mv, 1, 0.8);
    } else if (b.kind === 'mine') {
      const pul = 0.5 + 0.5 * Math.sin(t * 7 + b.x);
      B.star(b.x, b.y, b.r + 3, 4, t * 1.5, COL.amber, a, 1.8, 0.3 + 0.5 * pul, 1, 0.8, 0.5);
    } else {
      B.circle(b.x, b.y, b.r + 1, COL.bullet, a, 1.8, 0.22, 1, 1);
      B.push(0, b.x, b.y, b.r * 0.34, b.r * 0.34, 0, COL.white, a, 0, 0.9, 0);
    }
  }
}

function drawStrings(g, B, t) {
  const live = g.stats.fus.livewire;
  for (const e of g.enemies) {
    if (!(e.tieT > 0) || !e.tie || e.tie.dead || e.dead) continue;
    const o = e.tie;
    if (o.tie === e && o.id < e.id && o.tieT > 0) continue;   // draw each pair once
    const fa = Math.min(1, e.tieT * 2);
    B.line(e.x, e.y, o.x, o.y, 2.2, COL.rose, 0.55 * fa, 1);
    if (live) B.line(e.x, e.y, o.x, o.y, 1.2, COL.ice, (0.4 + 0.6 * Math.abs(Math.sin(t * 31 + e.id))) * fa, 1);
    const k = (t * 0.8 + e.id * 0.37) % 1;      // a heart slides along the string
    B.heart(e.x + (o.x - e.x) * k, e.y + (o.y - e.y) * k, 4.5, Math.PI / 2, COL.rose, 0.8 * fa, 0, 1, 1, 0);
  }
}

function drawAllies(g, B, t) {
  for (const b of g.butterflies) {
    const c = b.swoop ? COL.gold : BUTTERFLY;
    const f = Math.abs(Math.sin(t * 15 + b.ph * 3));          // wing beat
    const fx = Math.cos(b.ang), fy = Math.sin(b.ang);          // forward
    const nx = -fy, ny = fx;                                     // sideways
    for (const sd of [-1, 1]) {
      const o = 5 + 8 * f;
      // upper wing (big, slightly forward) and lower wing (small, behind)
      B.heart(b.x + nx * sd * o + fx * 3, b.y + ny * sd * o + fy * 3, 9, b.ang + sd * Math.PI / 2 + Math.PI, c, 0.85, 1.6, 0.18, 0.55, 0);
      B.heart(b.x + nx * sd * o * 0.7 - fx * 5, b.y + ny * sd * o * 0.7 - fy * 5, 6, b.ang + sd * Math.PI / 2 + Math.PI, c, 0.8, 1.4, 0.15, 0.5, 0);
    }
    B.line(b.x - fx * 6, b.y - fy * 6, b.x + fx * 6, b.y + fy * 6, 1.8, COL.white, 0.7, 0.2);
    if (b.dart) B.glow(b.x - Math.cos(b.ang) * 14, b.y - Math.sin(b.ang) * 14, 24, 5, b.ang, c, 0.6);
  }
  for (const o of g.orbitals) {
    if (!o) continue;
    if (o.cd > 0) {                              // mending after a block: a hollow outline
      B.heart(o.x, o.y, o.r * 0.85, o.a + Math.PI / 2, COL.rose, 0.4, 1.4, 0, 0.3);
      continue;
    }
    B.glow(o.x - Math.cos(o.a + Math.PI / 2) * 12, o.y - Math.sin(o.a + Math.PI / 2) * 12, 22, 7, o.a + Math.PI / 2, COL.rose, 0.7);
    B.heart(o.x, o.y, o.r, o.a + Math.PI / 2, COL.rose, 1, 2, 0.8, 1);
  }
  for (const d of g.drones) {
    const bob = Math.sin(t * 5 + d.slot) * 3;
    const c = d.ghost ? COL.ghost : COL.gold;
    const flap = 0.5 + 0.35 * Math.sin(t * 16 + d.slot * 2);
    // little wings
    B.push(9, d.x - 11, d.y + bob - 3, 9, 5 * flap + 2, -0.5, c, 0.9, 0, 0, 0);
    B.push(9, d.x + 11, d.y + bob - 3, 9, 5 * flap + 2, 0.5, c, 0.9, 0, 0, 0);
    B.heart(d.x, d.y + bob, 9, d.ang, c, d.ghost ? 0.7 : 1, 1.6, 0.6, 1, d.ghost ? 0 : 0.8);
  }
}

function drawPlayer(g, B, t, beat) {
  const p = g.player, st = g.stats;
  if (p.dead) return;
  const R = PLAYER.drawR * (1 + 0.07 * beat);
  let a = 1;
  if (p.invuln > 0 && p.dashT <= 0) a = 0.45 + 0.4 * Math.abs(Math.sin(t * 22));
  const c = Math.cos(p.ang), s = Math.sin(p.ang);

  // aim reticle
  if (!g.attract) {
    B.ring(p.aimX, p.aimY, 11, COL.white, 0.75, 1.3, 0.4);
    B.push(0, p.aimX, p.aimY, 2.2, 2.2, 0, COL.white, 0.9, 0, 1, 0);
  }
  if (p.shield) {
    B.ring(p.x, p.y, R * 1.75 + Math.sin(t * 4) * 1.5, COL.cyan, 0.75, 2, 1);
    for (let i = 0; i < 3; i++) B.arc(p.x, p.y, R * 1.75, t * 1.8 + (i / 3) * TAU, 0.4, 2.6, COL.white, 0.6, 0);
  } else if (st.shield > 0) {
    const k = p.shieldT / (17 - 2.5 * st.shield);
    B.arc(p.x, p.y, R * 1.75, -Math.PI / 2 + Math.PI * k, Math.PI * clamp(k, 0.02, 1), 1.2, COL.cyan, 0.35, 0);
  }
  if (p.dashT > 0) B.glow(p.x - p.dashDx * 46, p.y - p.dashDy * 46, p.ram ? 160 : 90, p.ram ? 40 : 22, Math.atan2(p.dashDy, p.dashDx), p.ram ? COL.orange : g.stats.fus.comet ? COL.gold : COL.pink, 1.2);
  if (p.glowT > 0) {                             // Glow Up: a golden shimmer while it lasts
    const gk = Math.min(1, p.glowT), fl = 0.5 + 0.5 * Math.sin(t * 14);
    B.glow(p.x, p.y, R * 5, R * 5, 0, COL.gold, (0.25 + 0.15 * fl) * gk);
    B.ring(p.x, p.y, R * 2.4 + 3 * fl, COL.gold, 0.6 * gk, 1.8, 1);
  }
  if (st.fus.runningwild && p.heat > 0) {        // Running Wild heat
    const hk = p.heat, fl = 0.5 + 0.5 * Math.sin(t * (p.hot ? 18 : 6));
    B.arc(p.x, p.y, R * 2.1, -Math.PI / 2 + Math.PI * hk, Math.PI * hk, 2, p.hot ? COL.amber : COL.orange, 0.5 + 0.3 * hk, 0.8);
    if (p.hot) { B.glow(p.x, p.y, R * 4, R * 4, 0, COL.orange, 0.35 + 0.25 * fl); B.ring(p.x, p.y, R * 2.1, COL.amber, 0.7 + 0.3 * fl, 2.2, 1.2); }
  }
  B.glow(p.x - c * R * 0.9, p.y - s * R * 0.9, 16 + 8 * beat, 9, p.ang, COL.hot, 0.9 * a);
  const hurt = Math.max(0, p.hurtT);
  B.heart(p.x, p.y, R, p.ang, hurt > 0 ? tint(COL.pink, COL.white, hurt) : COL.pink, a, 2.8, 0.35 + 0.25 * beat, 1, 0.9);
  B.heart(p.x + c * 2, p.y + s * 2, R * 0.42, p.ang, COL.white, a, 0, 0.95, 0, 0);
  // dash pips trailing the ship
  for (let i = 0; i < st.dashCharges; i++) {
    const on = i < p.dashCharges;
    const an = p.ang + Math.PI + (i - (st.dashCharges - 1) / 2) * 0.5;
    B.push(0, p.x + Math.cos(an) * (R + 14), p.y + Math.sin(an) * (R + 14), 3, 3, 0, on ? COL.cyan : COL.blue, on ? 1 : 0.35, on ? 0 : 1, on ? 1 : 0, on ? 1 : 0);
  }
}

/** Edge-of-screen pointers toward bosses and the last few stragglers. */
function drawPointers(g, B, t) {
  const cam = g.cam, hx = g.viewHalf.x - 46, hy = g.viewHalf.y - 46;
  let alive = 0;
  for (const e of g.enemies) if (!e.dead && !e.def.untargetable) alive++;
  for (const e of g.enemies) {
    if (e.dead || e.def.untargetable || e.def.loot || e.def.pointer || (!e.boss && alive > 6)) continue;
    const dx = e.x - cam.x, dy = e.y - cam.y;
    if (Math.abs(dx) < hx + 30 && Math.abs(dy) < hy + 30) continue;
    const k = Math.min(hx / Math.abs(dx || 1), hy / Math.abs(dy || 1));
    const col = e.boss ? COL.red : COL[e.def.col] || COL.cyan;
    B.chevron(cam.x + dx * k, cam.y + dy * k, e.boss ? 20 : 12, Math.atan2(dy, dx), col, 0.6 + 0.4 * Math.sin(t * 8), 2, 0.6, 1, 0);
  }
  for (const e of g.enemies) {                 // Love Jars always get a pointer
    if (e.dead || !(e.type === 'jar' || e.def.pointer) || e.spawn > 0) continue;
    const dx = e.x - cam.x, dy = e.y - cam.y;
    if (Math.abs(dx) < hx + 30 && Math.abs(dy) < hy + 30) continue;
    const s = Math.min(hx / Math.abs(dx || 1), hy / Math.abs(dy || 1));
    B.chevron(cam.x + dx * s, cam.y + dy * s, e.type === 'jar' ? 15 : 13, Math.atan2(dy, dx), e.type === 'jar' ? COL.gold : COL.amber, 0.6 + 0.4 * Math.sin(t * 8), 2, 0.8, 1, 0);
  }
  for (const k of g.pickups) {
    if (k.kind !== 'container' || k.dead) continue;
    const dx = k.x - cam.x, dy = k.y - cam.y;
    if (Math.abs(dx) < hx + 30 && Math.abs(dy) < hy + 30) continue;
    const s = Math.min(hx / Math.abs(dx || 1), hy / Math.abs(dy || 1));
    B.heart(cam.x + dx * s, cam.y + dy * s, 12, Math.PI / 2, COL.rose, 0.6 + 0.4 * Math.sin(t * 8), 2, 0.8, 1, 0);
  }
}
