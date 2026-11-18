// Stage hazards: every sector bends the arena in its own way during normal
// waves (never in boss fights). Each one is a threat and an opportunity:
// comets, flares and tesla arcs hit enemies too, prisms split your hearts,
// rifts and currents push the swarm around as much as they push you.

import { ARENA, COL, WAVES_PER_SECTOR } from '../config.js';
import { TAU, clamp, damp } from '../core/math.js';
import { DEFS, spawnEnemy } from './enemies.js';
import { spawnProj } from './weapons.js';
import { igniteEnemy } from './status.js';

const active = (g) => g.waves.state === 'active' && !g.waves.boss;
/** 0..3 within a sector: hazards ramp up as the sector goes on. */
const stage = (g) => (g.wave - 1) % WAVES_PER_SECTOR;

function farSpot(g, minD, maxD, margin = 160) {
  const p = g.player;
  for (let k = 0; k < 12; k++) {
    const a = g.rng.angle(), d = g.rng.range(minD, maxD);
    const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
    if (Math.abs(x) < ARENA.hw - margin && Math.abs(y) < ARENA.hh - margin) return { x, y };
  }
  return { x: clamp(-p.x * 0.5, -ARENA.hw + margin, ARENA.hw - margin), y: clamp(-p.y * 0.5, -ARENA.hh + margin, ARENA.hh - margin) };
}

/** Wipe leftovers: hazard pods, arcs, comets. `soft` lets the darkness fade out instead of snapping. */
export function clearHazards(g, soft = false) {
  for (const e of g.enemies) if (!e.dead && e.def.hazard) { if (soft && e.xp > 0) g.dropXp(e.x, e.y, e.xp); g.killEnemy(e, true); }
  for (const l of g.lasers) if (l.hazard) l.dead = true;
  const hz = g.hz || {};
  if (soft && hz.dim) { g.hz = { dim: true, darkK: hz.darkK }; return; }
  if (g.dark && g.dark.hz) g.dark = null;
  g.hz = {};
}

/** Called at the start of every wave. */
export function resetHazards(g) {
  clearHazards(g);
  const id = g.sector.id, k = stage(g), hz = g.hz;
  hz.id = id;
  hz.timer = 3 + g.rng.range(0, 1.5);
  if (g.waves.boss) return;
  if (id === 'crystal') {
    hz.prisms = [];
    const n = 3 + (k >= 2 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      let s = farSpot(g, 320, 900, 220);
      for (let tries = 0; tries < 8 && hz.prisms.some((o) => Math.hypot(o.x - s.x, o.y - s.y) < 420); tries++) s = farSpot(g, 320, 1100, 220);
      hz.prisms.push({ x: s.x, y: s.y, r: 34, rot: g.rng.angle(), hit: 0, flareT: 3 + i * 1.3, charge: 0 });
    }
  } else if (id === 'storm') {
    hz.pylons = [];
    const n = k >= 2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const s = farSpot(g, 200, 800, 300);
      hz.pylons.push({ x: s.x, y: s.y, ang: g.rng.angle(), spin: g.rng.sign() * 0.22, half: g.rng.range(260, 340), timer: 2.5 + i * 1.4, arc: null, glow: 0 });
    }
  } else if (id === 'hollow') {
    hz.rifts = [];
    const n = k >= 2 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const s = farSpot(g, 500, 900, 260);
      hz.rifts.push({ x: s.x, y: s.y, vx: 0, vy: 0, R: 430, core: 44, wob: g.rng.angle(), tick: 0 });
    }
  } else if (id === 'tidal') {
    hz.flowA = hz.flowTo = g.rng.angle();
    hz.flowK = 0;
    hz.turnT = 10;
    hz.pools = [];
    hz.poolT = k === 0 ? 6 : 3.5;
  } else if (id === 'corona') {
    hz.dimT = 5;               // seconds until the first dimming
    hz.dim = false;
    hz.darkK = 0;
  }
}

export function updateHazards(g, dt) {
  const hz = g.hz;
  if (!hz || !hz.id || !active(g)) {
    if (hz && hz.dim) fadeDark(g, hz, dt, true);
    return;
  }
  switch (hz.id) {
    case 'azure': comets(g, hz, dt); break;
    case 'verdant': pods(g, hz, dt); break;
    case 'crystal': prisms(g, hz, dt); break;
    case 'ember': flares(g, hz, dt); fireWaves(g, hz, dt); break;
    case 'storm': pylons(g, hz, dt); break;
    case 'hollow': rifts(g, hz, dt); break;
    case 'tidal': currents(g, hz, dt); break;
    case 'corona': dimming(g, hz, dt); break;
  }
}

// ------------------------------------------------------------------ Azure Drift: comets
function comet(g, cx, cy, a, delay) {
  const L = 2 * Math.hypot(ARENA.hw, ARENA.hh);
  const l = g.addLaser({ x: cx - Math.cos(a) * L / 2, y: cy - Math.sin(a) * L / 2, ang: a, len: L, w: 34, warn: 1.15 + delay, dur: 0.28, hurts: 6, kind: 'comet', col: COL.ice });
  l.hazard = true;
}

function comets(g, hz, dt) {
  const k = stage(g), first = g.wave === 1;
  hz.timer -= dt;
  if (hz.timer > 0) return;
  // the first wave gets a lone comet now and then; later waves get volleys
  hz.timer = (first ? 8.5 : 6.2 - 0.5 * k) + g.rng.range(-0.6, 0.6);
  const p = g.player, a = g.rng.angle();
  const cx = p.x + p.vx * 0.6, cy = p.y + p.vy * 0.6;
  const nx = Math.cos(a + Math.PI / 2), ny = Math.sin(a + Math.PI / 2);
  const n = first ? 1 : k >= 3 ? 3 : k >= 1 ? 2 : 1;
  if (n === 1) {
    const off = g.rng.range(-140, 140);
    comet(g, cx + nx * off, cy + ny * off, a, 0);
  } else if (n === 2 && g.rng.chance(0.5)) {           // a cross through where you are heading
    comet(g, cx, cy, a, 0);
    comet(g, cx, cy, a + Math.PI / 2 + g.rng.range(-0.35, 0.35), 0.35);
  } else {                                           // a shower of parallel streaks: find the lane
    const gap = 200, off = g.rng.range(-gap / 2, gap / 2);
    for (let i = 0; i < n + 1; i++) {
      const o = off + (i - n / 2) * gap;
      comet(g, cx + nx * o, cy + ny * o, a, i * 0.18);
    }
  }
  g.audio.play('charge');
}

// ------------------------------------------------------------------ Verdant Rift: spore pods
function pods(g, hz, dt) {
  const k = stage(g), want = 3 + Math.min(2, k);
  let n = 0;
  for (const e of g.enemies) if (!e.dead && e.type === 'pod') n++;
  hz.timer -= dt;
  if (n < want && hz.timer <= 0) {
    hz.timer = 3.2;
    const s = farSpot(g, 420, 850);
    spawnEnemy(g, 'pod', s.x, s.y, { spawn: 0.8 });
  }
}

function aiPod(g, e, dt) {
  const p = g.player, d = Math.hypot(p.x - e.x, p.y - e.y) || 1;
  e.rot += dt * 0.6;
  // pods creep after you on their roots: leave them be and they will reach you
  const creep = (26 + 6 * stage(g)) * dt;
  e.x += ((p.x - e.x) / d) * creep; e.y += ((p.y - e.y) / d) * creep;
  e.crept = (e.crept || 0) + creep;
  if (d < 130 + e.r) {                           // too close: it swells and pops
    e.swell = (e.swell || 0) + dt;
    if (e.swell > 0.75) g.killEnemy(e);
  } else e.swell = Math.max(0, (e.swell || 0) - dt * 0.8);
}

// ------------------------------------------------------------------ Crystal Cascade: prisms
function prisms(g, hz, dt) {
  const p = g.player, k = stage(g);
  for (const pr of hz.prisms) {
    pr.rot += dt * 0.5;
    pr.hit = Math.max(0, pr.hit - dt * 3);
    // the prism gathers light, then flares it out as three rays
    pr.flareT -= dt;
    pr.charge = clamp(1 - pr.flareT, 0, 1);
    if (pr.flareT <= 0) {
      pr.flareT = 5.6 - 0.4 * k + g.rng.range(-0.5, 0.5);
      for (let i = 0; i < 3; i++) {
        const l = g.addLaser({ x: pr.x, y: pr.y, ang: pr.rot + (i / 3) * TAU, len: 660, w: 24, warn: 0.85, dur: 0.35, hurts: 5, kind: 'prism', col: COL.ice });
        l.hazard = true;
      }
      g.audio.play('charge');
    }
    // the crystal is solid: slide the player around it
    const dx = p.x - pr.x, dy = p.y - pr.y, d = Math.hypot(dx, dy) || 1, rr = pr.r + p.r;
    if (d < rr) { p.x = pr.x + (dx / d) * rr; p.y = pr.y + (dy / d) * rr; }
  }
  // your hearts bend toward a nearby prism and come out as three charged hearts
  const n = g.projs.length;
  for (let i = 0; i < n; i++) {
    const q = g.projs[i];
    if (q.dead || q.refr) continue;
    for (const pr of hz.prisms) {
      const dx = q.x - pr.x, dy = q.y - pr.y, d2 = dx * dx + dy * dy, rr = pr.r + q.r;
      if (d2 < 120 * 120 && d2 > rr * rr) {        // light pull
        let da = (Math.atan2(-dy, -dx) - q.ang) % TAU;
        if (da > Math.PI) da -= TAU; else if (da < -Math.PI) da += TAU;
        if (Math.abs(da) < 1.2) {
          q.ang += clamp(da, -3.5 * dt, 3.5 * dt);
          q.vx = Math.cos(q.ang) * q.spd; q.vy = Math.sin(q.ang) * q.spd;
        }
        continue;
      }
      if (d2 > rr * rr) continue;
      q.refr = true;
      q.dmg *= 1.2;
      q.life = Math.max(q.life, 0.5);
      for (const s of [-0.38, 0.38]) {
        const c = spawnProj(g, q.x, q.y, q.ang + s, { dmg: q.dmg * 0.8, kind: q.kind, r: q.r, spd: q.spd, life: Math.max(0.5, q.life), pierce: q.pierce, bounce: q.bounce, homing: q.homing, canSplit: false, gen: q.gen, coef: q.coef * 0.7, chill: q.chill, beat: q.beat, hits: [...q.hits] });
        if (c) c.refr = true;
      }
      if (pr.hit < 0.4) { g.fx.ring(pr.x, pr.y, COL.ice, pr.r, pr.r * 2.4, 0.25, 3); g.audio.play('pick'); }
      pr.hit = 1;
      g.fx.spray(pr.x, pr.y, q.ang, 0.5, COL.ice, 4, 420, 0.25, 3);
      break;
    }
  }
  // ...and so do enemy bullets
  const m = g.bullets.length;
  for (let i = 0; i < m; i++) {
    const b = g.bullets[i];
    if (b.dead || b.refr || b.kind === 'mine') continue;
    for (const pr of hz.prisms) {
      const dx = b.x - pr.x, dy = b.y - pr.y, rr = pr.r + b.r;
      if (dx * dx + dy * dy > rr * rr) continue;
      b.refr = true;
      for (const s of [-0.45, 0.45]) {
        const c = g.fireBullet(b.x, b.y, b.ang + s, b.spd, { r: b.r, life: Math.max(0.6, b.life) });
        if (c) c.refr = true;
      }
      pr.hit = 1;
      break;
    }
  }
}

// ------------------------------------------------------------------ Ember Reach: solar flares
function flares(g, hz, dt) {
  const k = stage(g);
  hz.timer -= dt;
  if (hz.timer > 0) return;
  hz.timer = 6.6 - 0.5 * k + g.rng.range(-0.5, 0.5);
  const p = g.player, n = 3 + (k >= 2 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const a = g.rng.angle(), d = i === 0 ? g.rng.range(0, 60) : g.rng.range(150, 380);
    const x = clamp(p.x + p.vx * 0.5 + Math.cos(a) * d, -ARENA.hw + 60, ARENA.hw - 60);
    const y = clamp(p.y + p.vy * 0.5 + Math.sin(a) * d, -ARENA.hh + 60, ARENA.hh - 60);
    g.zones.push({ kind: 'blast', x, y, r: 125, t: -i * 0.18, dur: 1.15, tick: 0, harm: 8, burn: 4, flare: true });
  }
  g.audio.play('telegraph');
}

/** A flare that lands sends a ring of fire rolling slowly outward. Called when its blast goes off. */
export function flareWave(g, x, y, r0) {
  const hz = g.hz;
  if (!hz || hz.id !== 'ember' || !active(g)) return;
  (hz.waves ||= []).push({ x, y, r: r0 * 0.6, max: 330 + 30 * stage(g), spd: 125, hit: false, burned: new Set() });
}

function fireWaves(g, hz, dt) {
  if (!hz.waves) return;
  const p = g.player, st = g.stats;
  for (const w of hz.waves) {
    w.r += w.spd * dt;
    if (w.r >= w.max) { w.dead = true; continue; }
    const band = 16;
    const d = Math.hypot(p.x - w.x, p.y - w.y);
    if (!w.hit && !p.dead && Math.abs(d - w.r) < band + p.r * 0.4) {
      if (g.hurtPlayer(1, w.x, w.y)) w.hit = true;
    }
    // the swarm gets scorched as the wave rolls through it
    for (const e of g.grid.query(w.x, w.y, w.r + 40, [])) {
      if (e.dead || e.def.hazard || w.burned.has(e.id)) continue;
      const ed = Math.hypot(e.x - w.x, e.y - w.y);
      if (Math.abs(ed - w.r) > band + e.r) continue;
      w.burned.add(e.id);
      igniteEnemy(g, e, st.damage * 1.2);
    }
  }
  hz.waves = hz.waves.filter((w) => !w.dead);
}

// ------------------------------------------------------------------ Static Storm: tesla pylons
function pylons(g, hz, dt) {
  const p = g.player;
  for (const py of hz.pylons) {
    // each pair is a slowly turning bar whose middle drifts toward you
    py.ang += py.spin * dt;
    const dx = p.x - py.x, dy = p.y - py.y, d = Math.hypot(dx, dy) || 1;
    if (d > 160) { py.x += (dx / d) * 34 * dt; py.y += (dy / d) * 34 * dt; }
    py.x = clamp(py.x, -ARENA.hw + 120, ARENA.hw - 120);
    py.y = clamp(py.y, -ARENA.hh + 120, ARENA.hh - 120);
    const ax = py.x - Math.cos(py.ang) * py.half, ay = py.y - Math.sin(py.ang) * py.half;
    py.ax = ax; py.ay = ay;
    py.bx = py.x + Math.cos(py.ang) * py.half; py.by = py.y + Math.sin(py.ang) * py.half;
    py.timer -= dt;
    if (py.timer <= 0 && (!py.arc || py.arc.dead)) {
      py.timer = 4.3 - 0.3 * stage(g) + g.rng.range(-0.4, 0.4);
      py.arc = g.addLaser({ x: ax, y: ay, ang: py.ang, len: py.half * 2, w: 22, warn: 1.0, dur: 0.6, hurts: 4, kind: 'arc', col: COL.cyan });
      py.arc.hazard = true;
      py.arc.free = true;
    }
    if (py.arc && !py.arc.dead) {
      py.arc.x = ax; py.arc.y = ay; py.arc.ang = py.ang;
      py.glow = py.arc.t / py.arc.warn;
      if (py.arc.t >= py.arc.warn && g.frame % 8 === 0) g.fx.lightning(ax, ay, py.bx, py.by, COL.cyan);
      if (py.arc.t >= py.arc.warn && py.arc.t - dt < py.arc.warn) g.audio.play('zap');
    } else py.glow = 0;
  }
}

// ------------------------------------------------------------------ The Hollow: rifts
function rifts(g, hz, dt) {
  const p = g.player;
  for (const rf of hz.rifts) {
    rf.wob += dt * 0.4;
    const dx = p.x - rf.x, dy = p.y - rf.y, d = Math.hypot(dx, dy) || 1;
    rf.vx = damp(rf.vx, (dx / d) * 38 + Math.cos(rf.wob) * 30, 1, dt);
    rf.vy = damp(rf.vy, (dy / d) * 38 + Math.sin(rf.wob * 1.3) * 30, 1, dt);
    rf.x = clamp(rf.x + rf.vx * dt, -ARENA.hw + 150, ARENA.hw - 150);
    rf.y = clamp(rf.y + rf.vy * dt, -ARENA.hh + 150, ARENA.hh - 150);
    const R = rf.R;
    if (d < R && !p.dead) {
      const f = 1 - d / R;
      p.pullX -= (dx / d) * 175 * f; p.pullY -= (dy / d) * 175 * f;
      if (d < rf.core + p.r * 0.6) g.hurtPlayer(1, rf.x, rf.y);
    }
    rf.tick -= dt;
    const tick = rf.tick <= 0;
    if (tick) rf.tick = 0.4;
    for (const e of g.grid.query(rf.x, rf.y, R, [])) {
      if (e.dead || e.boss) continue;
      const ex = rf.x - e.x, ey = rf.y - e.y, ed = Math.hypot(ex, ey) || 1;
      if (ed > R) continue;
      if (!e.def.heavy) { const f = 150 * (1 - ed / R) * dt; e.x += (ex / ed) * Math.min(f, ed); e.y += (ey / ed) * Math.min(f, ed); }
      if (tick && ed < rf.core + e.r) g.damageEnemy(e, g.stats.damage * 1.5, { quiet: true });   // the rift crushes what it swallows
    }
    for (const b of g.bullets) {
      if (b.dead) continue;
      const bx = rf.x - b.x, by = rf.y - b.y, bd2 = bx * bx + by * by;
      if (bd2 > R * R) continue;
      const bd = Math.sqrt(bd2) || 1;
      if (bd < rf.core) { b.dead = true; continue; }
      const f = 300 * (1 - bd / R) * dt;
      b.vx += (bx / bd) * f; b.vy += (by / bd) * f;
      b.ang = Math.atan2(b.vy, b.vx);
    }
    for (const kk of g.pickups) {
      const kx = rf.x - kk.x, ky = rf.y - kk.y, kd = Math.hypot(kx, ky) || 1;
      if (!kk.pull && kd < R) { kk.vx += (kx / kd) * 200 * dt; kk.vy += (ky / kd) * 200 * dt; }
    }
  }
}

// ------------------------------------------------------------------ Tidal Nebula: currents and whirlpools
// The tide only moves you: the swarm swims against it untouched.
function currents(g, hz, dt) {
  const k = stage(g), p = g.player;
  hz.turnT -= dt;
  if (hz.turnT <= 0) {
    hz.turnT = 11 - 0.8 * k;
    hz.flowTo = hz.flowA + g.rng.sign() * g.rng.range(1.2, 2.6);
    g.fx.text(p.x, p.y - 60, 'THE CURRENT TURNS', COL.teal, 13, 1.2);
    g.audio.play('telegraph');
  }
  let d = (hz.flowTo - hz.flowA) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  hz.flowA += clamp(d, -1.4 * dt, 1.4 * dt);
  hz.flowK = damp(hz.flowK, 1, 0.8, dt);
  const S = (125 + 22 * k) * hz.flowK, fx = Math.cos(hz.flowA) * S, fy = Math.sin(hz.flowA) * S;
  hz.fx = fx; hz.fy = fy;
  if (!p.dead) { p.pullX += fx; p.pullY += fy; }

  // whirlpools open near you, drag you around their rim, then burst
  hz.poolT -= dt;
  if (hz.poolT <= 0 && hz.pools.length < 1 + (k >= 2 ? 1 : 0)) {
    hz.poolT = 7 - 0.6 * k + g.rng.range(-0.8, 0.8);
    const a = g.rng.angle(), dd = g.rng.range(60, 200);
    const x = clamp(p.x + p.vx * 0.8 + Math.cos(a) * dd, -ARENA.hw + 140, ARENA.hw - 140);
    const y = clamp(p.y + p.vy * 0.8 + Math.sin(a) * dd, -ARENA.hh + 140, ARENA.hh - 140);
    hz.pools.push({ x, y, r: 170 + 10 * k, t: 0, dur: 3.6, spin: g.rng.sign() });
    g.audio.play('telegraph');
  }
  for (const w of hz.pools) {
    w.t += dt;
    const dx = p.x - w.x, dy = p.y - w.y, dist = Math.hypot(dx, dy) || 1;
    const pullR = w.r * 1.6;
    if (dist < pullR && !p.dead) {                   // a spiral: inward plus around
      const f = (1 - dist / pullR) * (90 + 70 * (w.t / w.dur));
      p.pullX += (-dx / dist) * f + (-dy / dist) * f * 0.9 * w.spin;
      p.pullY += (-dy / dist) * f + (dx / dist) * f * 0.9 * w.spin;
    }
    if (w.t >= w.dur) {
      w.dead = true;
      if (dist < w.r + p.r * 0.5) g.hurtPlayer(1, w.x, w.y);
      g.ringBullets(w.x, w.y, 10 + 2 * k, 210, g.rng.angle(), { r: 8, life: 2.2 });
      g.fx.ring(w.x, w.y, COL.teal, 20, w.r * 1.1, 0.4, 6);
      g.fx.burst(w.x, w.y, COL.cyan, 30, 480, 0.6, 5);
      g.fx.shake(6);
      g.audio.play('enemyBurst');
    }
  }
  hz.pools = hz.pools.filter((w) => !w.dead);
}

// ------------------------------------------------------------------ Black Corona: dimming
function dimming(g, hz, dt) {
  hz.dimT -= dt;
  if (hz.dimT <= 0) {
    hz.dim = !hz.dim;
    hz.dimT = hz.dim ? 8 + stage(g) * 0.6 : 6.5 - stage(g) * 0.6;
    if (hz.dim) { g.fx.text(g.player.x, g.player.y - 60, 'THE LIGHT FAILS', COL.gold, 13, 1.2); g.audio.play('telegraph'); }
  }
  fadeDark(g, hz, dt, !hz.dim);
}

function fadeDark(g, hz, dt, out) {
  hz.darkK = damp(hz.darkK || 0, out ? 0 : 0.88, out ? 2.5 : 1.4, dt);
  const p = g.player;
  if (out && hz.darkK < 0.02) { hz.darkK = 0; if (g.dark && g.dark.hz) g.dark = null; if (!active(g)) hz.dim = false; return; }
  // nearsighted: the light pool shrinks as the sector goes on
  g.dark = { x: p.x, y: p.y, r: 320 - 20 * Math.min(3, stage(g)), k: hz.darkK, hz: true };
}

// ------------------------------------------------------------------ registration
Object.assign(DEFS, {
  pod: {
    hp: 22, speed: 0, r: 24, xp: 7, threat: 0, col: 'lime', ai: aiPod, hazard: true, contact: false,
    noMove: true, noSep: true, noCharm: true, noElite: true, heavy: true, score: 120,
    onDeath(g, e) {                              // a burst of slow spores: harmless from range
      g.ringBullets(e.x, e.y, 11, 110, e.rot, { r: 9, life: 2.8, kind: 'spore' });
      g.ringBullets(e.x, e.y, 6, 60, e.rot + 0.5, { r: 8, life: 3.2, kind: 'spore' });   // a slow inner cloud
      g.fx.burst(e.x, e.y, COL.lime, 24, 320, 0.7, 6);
      g.audio.play('enemyBurst');
    },
  },
});
