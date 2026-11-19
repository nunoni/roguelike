// Stage hazards: every sector bends the arena in its own way during normal
// waves (never in boss fights). Each one is a threat and an opportunity:
// comets, flares and tesla arcs hit enemies too, prisms split your hearts,
// rifts and currents push the swarm around as much as they push you.
// Second layers: rifts collapse, prisms overcharge, ball lightning roams the
// storm, and shades stalk the Corona's dark.

import { ARENA, COL, WAVES_PER_SECTOR } from '../config.js';
import { TAU, clamp, damp } from '../core/math.js';
import { DEFS, spawnEnemy, steer } from './enemies.js';
import { spawnProj } from './weapons.js';
import { igniteEnemy, chillEnemy } from './status.js';

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
      hz.prisms.push({ x: s.x, y: s.y, r: 34, rot: g.rng.angle(), hit: 0, flareT: 3 + i * 1.3, charge: 0, load: i * 8, over: 0 });
    }
  } else if (id === 'storm') {
    hz.pylons = [];
    const n = k >= 2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const s = farSpot(g, 200, 800, 300);
      hz.pylons.push({ x: s.x, y: s.y, ang: g.rng.angle(), spin: g.rng.sign() * 0.22, half: g.rng.range(260, 340), timer: 2.5 + i * 1.4, arc: null, glow: 0 });
    }
    hz.balls = [];
    hz.ballT = k === 0 ? 8 : 4;
  } else if (id === 'hollow') {
    hz.rifts = [];
    const n = 1 + (k >= 1 ? 1 : 0) + (k >= 3 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const s = farSpot(g, 500, 900, 260);
      hz.rifts.push({ x: s.x, y: s.y, vx: 0, vy: 0, R: 430, core: 44, wob: g.rng.angle(), tick: 0, colT: 7 + i * 3.5, inh: 0, eat: 0, open: 1 });
    }
    hz.debris = [];
    hz.debT = 0.5;
  } else if (id === 'tidal') {
    hz.flowA = hz.flowTo = g.rng.angle();
    hz.flowK = 0;
    hz.turnT = 10;
    hz.pools = [];
    hz.poolT = k === 0 ? 4 : 2.5;
  } else if (id === 'corona') {
    hz.dimT = 3.5;             // seconds until the first dimming
    hz.dim = false;
    hz.darkK = 0;
    hz.shadeT = 1;
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
    case 'storm': pylons(g, hz, dt); lightningBalls(g, hz, dt); break;
    case 'hollow': rifts(g, hz, dt); debris(g, hz, dt); break;
    case 'tidal': currents(g, hz, dt); break;
    case 'corona': dimming(g, hz, dt); shades(g, hz, dt); break;
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
  hz.timer = (first ? 6 : 4.4 - 0.4 * k) + g.rng.range(-0.5, 0.5);
  const p = g.player, a = g.rng.angle();
  const cx = p.x + p.vx * 0.6, cy = p.y + p.vy * 0.6;
  const nx = Math.cos(a + Math.PI / 2), ny = Math.sin(a + Math.PI / 2);
  const n = first ? 1 : k >= 2 ? 3 : 2;
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
  const k = stage(g), want = 5 + Math.min(3, k);
  let n = 0;
  for (const e of g.enemies) if (!e.dead && e.type === 'pod') n++;
  hz.timer -= dt;
  if (n < want && hz.timer <= 0) {
    hz.timer = 2;
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
    // light it drinks (time, and every heart it splits) builds to an overcharge
    if (pr.over > 0) {
      pr.over -= dt;
      if (pr.over <= 0) overcharge(g, pr);
    } else {
      pr.load += dt * 1.6;
      if (pr.load >= 32) { pr.over = 1.1; pr.load = 0; g.audio.play('charge'); }
    }
    if (pr.flareT <= 0) {
      pr.flareT = 4.2 - 0.35 * k + g.rng.range(-0.5, 0.5);
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
      if (pr.over <= 0) pr.load += 1;
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

/** A frost nova: freezes and hurts the swarm around the prism, but throws crystal shards at everyone. */
function overcharge(g, pr) {
  const R = 300;
  for (const e of g.grid.query(pr.x, pr.y, R, [])) {
    if (e.dead || e.def.hazard || Math.hypot(e.x - pr.x, e.y - pr.y) > R + e.r) continue;
    chillEnemy(g, e, 1);
  }
  g.explode(pr.x, pr.y, R, g.stats.damage * 6, { col: COL.ice });
  g.ringBullets(pr.x, pr.y, 12 + 2 * stage(g), 240, pr.rot, { r: 9, kind: 'shard' });
  g.fx.ring(pr.x, pr.y, COL.ice, pr.r, R, 0.45, 5);
  g.fx.burst(pr.x, pr.y, COL.white, 30, 900, 0.5, 4);
  g.fx.shake(7);
  g.audio.play('freeze');
}

// ------------------------------------------------------------------ Ember Reach: solar flares
function flares(g, hz, dt) {
  const k = stage(g);
  hz.timer -= dt;
  if (hz.timer > 0) return;
  hz.timer = 5.5 - 0.4 * k + g.rng.range(-0.5, 0.5);
  const p = g.player, n = 3 + (k >= 1 ? 1 : 0) + (k >= 3 ? 1 : 0);
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
      py.timer = 3.7 - 0.25 * stage(g) + g.rng.range(-0.4, 0.4);
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

/** Ball lightning: drifts after you and discharges into everything around it every couple of seconds. */
function lightningBalls(g, hz, dt) {
  const k = stage(g), p = g.player;
  hz.ballT -= dt;
  if (hz.ballT <= 0 && hz.balls.length < 1 + (k >= 2 ? 1 : 0)) {
    hz.ballT = 7 - 0.5 * k + g.rng.range(-0.8, 0.8);
    const s = farSpot(g, 450, 750);
    hz.balls.push({ x: s.x, y: s.y, vx: 0, vy: 0, life: 16, t: 0, zapT: 2.4, charge: 0, R: 150 + 10 * k, wob: g.rng.angle() });
    g.audio.play('zap');
  }
  for (const b of hz.balls) {
    b.t += dt; b.life -= dt; b.wob += dt;
    const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1;
    b.vx = damp(b.vx, (dx / d) * 85 + Math.cos(b.wob * 1.7) * 55, 1.2, dt);
    b.vy = damp(b.vy, (dy / d) * 85 + Math.sin(b.wob * 1.3) * 55, 1.2, dt);
    b.x = clamp(b.x + b.vx * dt, -ARENA.hw + 80, ARENA.hw - 80);
    b.y = clamp(b.y + b.vy * dt, -ARENA.hh + 80, ARENA.hh - 80);
    b.zapT -= dt;
    b.charge = clamp(1 - b.zapT / 0.8, 0, 1);
    if (b.zapT <= 0) {
      b.zapT = 2.4 - 0.15 * k;
      if (!p.dead && d < b.R + p.r * 0.5) { g.fx.lightning(b.x, b.y, p.x, p.y, COL.cyan); g.hurtPlayer(1, b.x, b.y); }
      let n = 0;
      for (const e of g.grid.query(b.x, b.y, b.R, [])) {
        if (n >= 6 || e.dead || e.def.hazard || Math.hypot(e.x - b.x, e.y - b.y) > b.R + e.r) continue;
        g.damageEnemy(e, g.stats.damage * 4, { quiet: true });
        g.fx.lightning(b.x, b.y, e.x, e.y, COL.cyan);
        n++;
      }
      g.fx.ring(b.x, b.y, COL.cyan, 20, b.R, 0.25, 3);
      g.audio.play('zap');
    }
    if (b.life <= 0) { b.dead = true; g.fx.burst(b.x, b.y, COL.cyan, 16, 400, 0.4, 3); }
  }
  hz.balls = hz.balls.filter((b) => !b.dead);
}

// ------------------------------------------------------------------ The Hollow: rifts
function rifts(g, hz, dt) {
  const p = g.player;
  const k = stage(g);
  for (const rf of hz.rifts) {
    rf.wob += dt * 0.4;
    rf.open = Math.min(1, rf.open + dt * 0.7);
    // now and then a rift stops, inhales hard, implodes and opens somewhere else
    if (rf.inh > 0) {
      rf.inh -= dt;
      if (rf.inh <= 0) { collapse(g, rf); continue; }
    } else {
      rf.colT -= dt;
      if (rf.colT <= 0) {
        rf.inh = 1.6;
        rf.colT = 10 - 0.8 * k + g.rng.range(-1, 1);
        g.zones.push({ kind: 'blast', x: rf.x, y: rf.y, r: 190, t: 0, dur: 1.6, tick: 0, harm: 10, fall: true });
        g.audio.play('charge');
      }
    }
    const dx = p.x - rf.x, dy = p.y - rf.y, d = Math.hypot(dx, dy) || 1;
    if (rf.inh <= 0) {
      rf.vx = damp(rf.vx, (dx / d) * 38 + Math.cos(rf.wob) * 30, 1, dt);
      rf.vy = damp(rf.vy, (dy / d) * 38 + Math.sin(rf.wob * 1.3) * 30, 1, dt);
      rf.x = clamp(rf.x + rf.vx * dt, -ARENA.hw + 150, ARENA.hw - 150);
      rf.y = clamp(rf.y + rf.vy * dt, -ARENA.hh + 150, ARENA.hh - 150);
    }
    const R = rf.R * rf.open, pk = rf.inh > 0 ? 2.2 : 1;
    if (d < R && !p.dead) {
      const f = (1 - d / R) * pk;
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
      if (!e.def.heavy) { const f = 150 * pk * (1 - ed / R) * dt; e.x += (ex / ed) * Math.min(f, ed); e.y += (ey / ed) * Math.min(f, ed); }
      if (tick && ed < rf.core + e.r) g.damageEnemy(e, g.stats.damage * 1.5, { quiet: true });   // the rift crushes what it swallows
    }
    for (const b of g.bullets) {
      if (b.dead) continue;
      const bx = rf.x - b.x, by = rf.y - b.y, bd2 = bx * bx + by * by;
      if (bd2 > R * R) continue;
      const bd = Math.sqrt(bd2) || 1;
      if (bd < rf.core) { b.dead = true; rf.eat++; continue; }
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

/** The rift implodes: it spits back what it swallowed and reopens elsewhere. */
function collapse(g, rf) {
  g.ringBullets(rf.x, rf.y, clamp(8 + rf.eat, 8, 22), 230, g.rng.angle(), { r: 9 });
  g.fx.ring(rf.x, rf.y, COL.violet, rf.core, rf.R * 0.6, 0.4, 4);
  g.fx.burst(rf.x, rf.y, COL.hot, 26, 700, 0.5, 4);
  rf.eat = 0;
  for (const d of g.hz.debris || []) {           // the blast flings nearby debris back out
    const dx = d.x - rf.x, dy = d.y - rf.y, dd = Math.hypot(dx, dy) || 1;
    if (dd < rf.R) { const f = 520 * (1 - dd / rf.R) + 180; d.vx = (dx / dd) * f; d.vy = (dy / dd) * f; }
  }
  const s = farSpot(g, 450, 900, 260);
  rf.x = s.x; rf.y = s.y; rf.vx = rf.vy = 0; rf.open = 0;
}

/** Debris: rocks drift in from the dark and spiral into the nearest rift. Touching one hurts. */
function debris(g, hz, dt) {
  const k = stage(g), p = g.player;
  if (!hz.rifts.length) return;
  hz.debT -= dt;
  if (hz.debT <= 0 && hz.debris.length < 10 + 3 * k) {
    hz.debT = 0.9 - 0.1 * k;
    const rf = g.rng.pick(hz.rifts), a = g.rng.angle(), d = rf.R * g.rng.range(1.2, 1.6), spin = g.rng.sign();
    const x = clamp(rf.x + Math.cos(a) * d, -ARENA.hw + 30, ARENA.hw - 30), y = clamp(rf.y + Math.sin(a) * d, -ARENA.hh + 30, ARENA.hh - 30);
    const v = g.rng.range(90, 150);          // a sideways start, so they spiral in rather than fall straight
    hz.debris.push({ x, y, vx: -Math.sin(a) * v * spin, vy: Math.cos(a) * v * spin, r: g.rng.range(10, 20), rot: g.rng.angle(), spin: g.rng.range(-3, 3), sides: g.rng.int(5, 7), t: 0 });
  }
  for (const d of hz.debris) {
    d.t += dt; d.rot += d.spin * dt;
    let near = null, nd = 1e9;
    for (const rf of hz.rifts) { const q = Math.hypot(rf.x - d.x, rf.y - d.y); if (q < nd) { nd = q; near = rf; } }
    const dx = near.x - d.x, dy = near.y - d.y, dd = nd || 1;
    const pull = (90 + 320 * clamp(1 - dd / (near.R * 1.7), 0, 1)) * (near.open ?? 1) * (near.inh > 0 ? 2.2 : 1);
    d.vx += (dx / dd) * pull * dt; d.vy += (dy / dd) * pull * dt;
    const sp = Math.hypot(d.vx, d.vy), cap = 520;
    if (sp > cap) { d.vx *= cap / sp; d.vy *= cap / sp; }
    d.x += d.vx * dt; d.y += d.vy * dt;
    if (dd < near.core * 0.85) {                 // swallowed
      d.dead = true;
      g.fx.burst(d.x, d.y, COL.violet, 6, 160, 0.3, 2);
      continue;
    }
    if (d.t > 24 || Math.abs(d.x) > ARENA.hw + 200 || Math.abs(d.y) > ARENA.hh + 200) { d.dead = true; continue; }
    if (!p.dead && Math.hypot(p.x - d.x, p.y - d.y) < d.r + p.r * 0.7) {
      d.dead = true;
      g.hurtPlayer(1, d.x, d.y);
      g.fx.burst(d.x, d.y, COL.ghost, 12, 300, 0.4, 3);
    }
  }
  hz.debris = hz.debris.filter((d) => !d.dead);
}

// ------------------------------------------------------------------ Tidal Nebula: currents and whirlpools
// The tide only moves you: the swarm swims against it untouched.
function currents(g, hz, dt) {
  const k = stage(g), p = g.player;
  hz.turnT -= dt;
  if (hz.turnT <= 0) {
    hz.turnT = 9 - 0.8 * k;
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
  if (hz.poolT <= 0 && hz.pools.length < 2 + (k >= 2 ? 1 : 0)) {
    hz.poolT = 4.8 - 0.5 * k + g.rng.range(-0.6, 0.6);
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
    hz.dimT = hz.dim ? 9 + stage(g) * 0.6 : 5 - stage(g) * 0.6;
    if (hz.dim) { g.fx.text(g.player.x, g.player.y - 60, 'THE LIGHT FAILS', COL.gold, 13, 1.2); g.audio.play('telegraph'); }
    else dawn(g);
  }
  fadeDark(g, hz, dt, !hz.dim);
}

/** Light returns in a flash: the swarm near you is dazzled (frozen) and the shades burn away. */
function dawn(g) {
  const p = g.player;
  for (const e of g.enemies) {
    if (e.dead || e.boss) continue;
    if (e.type === 'shade') { g.killEnemy(e); continue; }
    if (Math.hypot(e.x - p.x, e.y - p.y) < 650) chillEnemy(g, e, 1);
  }
  g.fx.ring(p.x, p.y, COL.gold, 40, 650, 0.5, 5);
  g.fx.text(p.x, p.y - 60, 'DAWN', COL.gold, 14, 1);
}

/** In the dark, shades gather outside your light. */
function shades(g, hz, dt) {
  const k = stage(g), p = g.player;
  if (!hz.dim || hz.darkK < 0.5 || !g.dark) return;
  let n = 0;
  for (const e of g.enemies) if (!e.dead && e.type === 'shade') n++;
  hz.shadeT -= dt;
  if (hz.shadeT <= 0 && n < 3 + k) {
    hz.shadeT = 1.6 - 0.2 * k;
    const a = g.rng.angle(), d = g.dark.r + 240;
    const x = clamp(p.x + Math.cos(a) * d, -ARENA.hw + 60, ARENA.hw - 60), y = clamp(p.y + Math.sin(a) * d, -ARENA.hh + 60, ARENA.hh - 60);
    spawnEnemy(g, 'shade', x, y, { spawn: 0.3 });
  }
}

/** A shade creeps in; once it reaches your light it shrieks and bursts into bullets. */
function aiShade(g, e, dt) {
  const p = g.player, dk = g.dark;
  if (e.shriek !== undefined) {
    e.shriek += dt;
    e.vx = e.vy = 0;
    if (e.shriek > 0.55) {
      g.ringBullets(e.x, e.y, 10, 190, g.rng.angle(), { r: 8 });
      g.fx.burst(e.x, e.y, COL.red, 14, 300, 0.4, 3);
      g.killEnemy(e, true);
    }
    return;
  }
  if (!dk || Math.hypot(e.x - dk.x, e.y - dk.y) < dk.r * 0.6) { e.shriek = 0; g.audio.play('telegraph'); return; }
  steer(e, p.x, p.y, e.speed, 3, dt);
  e.rot = Math.atan2(e.vy, e.vx);
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
  shade: {
    hp: 20, speed: 150, r: 16, xp: 2, threat: 0, col: 'ghost', ai: aiShade, hazard: true,
    noCharm: true, noElite: true, noSep: true, score: 60,
  },
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
