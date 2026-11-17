// Skills that act on their own: pulse, guardians, cherubs, butterflies,
// gravity wells, starfall, barrier, stardust trail.

import { COL, PLAYER } from '../config.js';
import { TAU, damp, segDist2 } from '../core/math.js';
import { spawnProj, applyHitEffects } from './weapons.js';
import { igniteEnemy, charmEnemy } from './status.js';

const QUIET = { quiet: true };

export function updateSpells(g, input, dt) {
  const p = g.player, st = g.stats, fx = g.fx;
  const T = g.spellT || (g.spellT = { pulse: 1.2, well: 3, stars: 1, orbit: 0, trail: 0 });

  for (let i = g.flashBeams.length - 1; i >= 0; i--) {
    g.flashBeams[i].t -= dt;
    if (g.flashBeams[i].t <= 0) g.flashBeams.splice(i, 1);
  }
  if (p.dead) { g.orbitals.length = 0; return; }

  // ---- Guarded Heart
  if (st.shield > 0 && !p.shield) {
    p.shieldT += dt;
    if (p.shieldT >= 17 - 2.5 * st.shield) {
      p.shield = true; p.shieldT = 0;
      fx.ring(p.x, p.y, COL.cyan, 70, 30, 0.35, 3);
      g.audio.play('shieldUp');
    }
  }

  // ---- Guardian Hearts
  const orb = g.orbitals;
  const nOrb = st.orbit > 0 ? st.orbit + 1 + (st.fus.pulsar ? 1 : 0) : 0;
  orb.length = nOrb;
  if (nOrb) {
    const R = 108 + (st.fus.pulsar ? 14 : 0), spin = g.time * 2.3;
    T.orbit -= dt;
    const tick = T.orbit <= 0;
    if (tick) T.orbit += 0.2 / st.spellRate;
    const or = st.fus.pulsar ? 17 : 14;
    for (let i = 0; i < nOrb; i++) {
      const a = spin + (i / nOrb) * TAU;
      const o = orb[i] || (orb[i] = { x: 0, y: 0, a: 0 });
      o.a = a; o.r = or;
      o.x = p.x + Math.cos(a) * R; o.y = p.y + Math.sin(a) * R;
      if (tick) {
        for (const e of g.grid.query(o.x, o.y, or, [])) {
          if (!g.hittable(e)) continue;
          const dx = e.x - o.x, dy = e.y - o.y, rr = or + e.r + 4;
          if (dx * dx + dy * dy > rr * rr) continue;
          g.damageEnemy(e, st.damage * (0.5 + 0.2 * st.orbit), QUIET);
          fx.spray(o.x, o.y, Math.atan2(dy, dx), 1.5, COL.rose, 3, 240, 0.25, 3);
        }
      }
      for (const b of g.bullets) {
        const dx = b.x - o.x, dy = b.y - o.y, rr = or + b.r + 3;
        if (!b.dead && dx * dx + dy * dy < rr * rr) { b.dead = true; fx.mote(b.x, b.y, COL.rose, 1, 4, 0.3, 140); }
      }
    }
  }

  // ---- Heartbeat
  if (st.pulse > 0) {
    T.pulse -= dt;
    if (T.pulse <= 0) {
      T.pulse += (2.6 - 0.25 * st.pulse) / st.spellRate;
      firePulse(g, p.x, p.y);
    }
  }

  // ---- Cherubs (and Entourage ghosts)
  const drones = g.drones;
  let real = 0;
  for (const d of drones) if (!d.ghost) real++;
  while (real < st.drones) { drones.push({ x: p.x, y: p.y, cd: 0.3, ang: 0, ghost: false, slot: real }); real++; }
  // cherubs inherit your volley: Racing Pulse speeds them up, Twin Flame adds
  // hearts (one per two of yours), and their hearts carry every on-hit effect
  const rate = Math.max(0.1, (0.74 - 0.08 * st.droneLvl) * (PLAYER.fireRate / st.fireRate));
  const shots = st.fus.choir ? st.multishot : Math.ceil(st.multishot / 2);
  const halo = st.fus.halo;
  const haloTick = halo && (T.halo = (T.halo || 0) - dt) <= 0;
  if (haloTick) T.halo = 0.25;
  const proj = {
    dmg: st.damage * 0.45, kind: 'mini', r: 7, spd: 950, life: 0.8,
    canSplit: st.split > 0, coef: 0.7, bounce: st.bounce, pierce: st.pierce,
  };
  for (let i = 0; i < drones.length; i++) {
    const d = drones[i];
    const a = g.time * (d.ghost ? -0.7 : 0.9) + (i / Math.max(1, drones.length)) * TAU;
    const rad = d.ghost ? 150 : 64;
    d.x = damp(d.x, p.x + Math.cos(a) * rad, 6, dt);
    d.y = damp(d.y, p.y + Math.sin(a) * rad, 6, dt);
    if (halo) {                                  // Halo: cherubs guard you too
      for (const b of g.bullets) {
        const dx = b.x - d.x, dy = b.y - d.y, rr = 20 + b.r;
        if (!b.dead && dx * dx + dy * dy < rr * rr) { b.dead = true; fx.mote(b.x, b.y, COL.gold, 1, 4, 0.3, 140); }
      }
      if (haloTick) {
        for (const e of g.grid.query(d.x, d.y, 24, [])) {
          if (!g.hittable(e)) continue;
          const dx = e.x - d.x, dy = e.y - d.y, rr = 24 + e.r;
          if (dx * dx + dy * dy > rr * rr) continue;
          g.damageEnemy(e, st.damage * 0.9, QUIET);
          fx.spray(d.x, d.y, Math.atan2(dy, dx), 1.4, COL.gold, 3, 240, 0.25, 3);
        }
      }
    }
    d.cd -= dt;
    if (d.cd <= 0) {
      const t = g.findTarget(d.x, d.y, 620, null);
      if (t) {
        d.cd = rate * (d.ghost ? 1.25 : 1);
        d.ang = Math.atan2(t.y - d.y, t.x - d.x);
        for (let k = 0; k < shots; k++) {
          spawnProj(g, d.x, d.y, d.ang + (shots > 1 ? (k / (shots - 1) - 0.5) * 0.14 * (shots - 1) : 0), proj);
        }
      } else d.cd = 0.2;
    }
  }

  updateButterflies(g, dt);

  // ---- Irresistible
  if (st.well > 0) {
    T.well -= dt;
    if (T.well <= 0) {
      const t = g.findTarget(p.x, p.y, 640, null);
      if (t) {
        T.well = (9 - st.well) / st.spellRate;
        g.zones.push({ kind: 'well', x: t.x, y: t.y, r: 230 + 25 * st.well, t: 0, dur: 2.6 + 0.3 * st.well, tick: 0, dmg: st.damage * 0.5 });
        fx.ring(t.x, t.y, COL.violet, 260, 20, 0.4, 4);
        g.audio.play('well');
      } else T.well = 0.5;
    }
  }

  // ---- Shooting Stars
  if (st.stars > 0) {
    T.stars -= dt;
    if (T.stars <= 0) {
      T.stars += (1.7 - 0.25 * st.stars) * (st.fus.stardust ? 0.5 : 1) / st.spellRate;
      const cands = [];
      for (const e of g.enemies) {
        if (g.hittable(e) && !e.def.untargetable && Math.abs(e.x - p.x) < 800 && Math.abs(e.y - p.y) < 520) cands.push(e);
      }
      if (cands.length) {
        const e = g.rng.pick(cands);
        g.zones.push({ kind: 'meteor', x: e.x + e.vx * 0.3, y: e.y + e.vy * 0.3, r: 95, t: 0, dur: 0.45, tick: 0, dmg: st.damage * (2 + 0.6 * st.stars) });
      }
    }
  }

  // ---- Stardust Waltz
  if (st.fus.stardust && Math.hypot(p.vx, p.vy) > 120) {
    T.trail -= dt;
    if (T.trail <= 0) {
      T.trail = 0.07;
      g.zones.push({ kind: 'trail', x: p.x, y: p.y, r: 28, t: 0, dur: 1.5, tick: 0 });
    }
  }
}

/** Heartbeat: a damaging ring around (x, y). Also used by Skipping Heart. */
export function firePulse(g, x, y) {
  const st = g.stats, fx = g.fx;
  const R = 170 + 35 * Math.max(1, st.pulse);
  fx.ring(x, y, COL.pink, 24, R, 0.38, 6);
  fx.ring(x, y, COL.white, 16, R * 0.8, 0.3, 2);
  fx.shock(x, y, 0.5, R * 1.9, 0.45);
  g.audio.play('pulse');
  for (const e of g.grid.query(x, y, R, [])) {
    if (!g.hittable(e)) continue;
    const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy) || 1;
    if (d > R + e.r) continue;
    g.damageEnemy(e, st.damage * (1.2 + 0.5 * st.pulse), null);
    if (e.dead) continue;
    if (st.fus.fever) {                          // Fever Pitch: 3 burn stacks
      const dps = st.damage * Math.max(0.5, st.burn);
      for (let k = 0; k < 3; k++) igniteEnemy(g, e, dps);
    }
    if (st.fus.serenade && g.rng.chance(0.25)) charmEnemy(g, e);
    if (!e.dead && !e.boss && !e.def.heavy && !(e.charm > 0)) { e.vx += (dx / d) * 260; e.vy += (dy / d) * 260; }
  }
  if (st.fus.pulsar) {
    for (const o of g.orbitals) {
      const x2 = o.x + Math.cos(o.a) * 560, y2 = o.y + Math.sin(o.a) * 560;
      g.flashBeams.push({ x1: o.x, y1: o.y, x2, y2, t: 0.28, max: 0.28 });
      for (const e of g.enemies) {
        if (!g.hittable(e)) continue;
        const rr = e.r + 14;
        if (segDist2(e.x, e.y, o.x, o.y, x2, y2) < rr * rr) g.damageEnemy(e, st.damage * 3.2, null);
      }
    }
  }
}

const KISS = { crit: true };

/**
 * Butterflies flutter around the ship, dart at nearby enemies and strike on
 * contact. With Ballroom they all swoop on one target on every beat.
 */
function updateButterflies(g, dt) {
  const p = g.player, st = g.stats, fx = g.fx;
  const bs = g.butterflies;
  while (bs.length < st.flutter) {
    bs.push({ x: p.x, y: p.y, vx: 0, vy: 0, dart: false, tgt: null, cd: 0.4 + bs.length * 0.13, dartT: 0, swoop: false, ph: bs.length * 1.7, ang: 0 });
  }
  if (bs.length > st.flutter) bs.length = st.flutter;
  if (!bs.length) return;

  if (st.fus.ballroom && g.onBeat) {
    const t = g.findTarget(p.x, p.y, 650, null);
    if (t) for (const b of bs) { b.dart = true; b.tgt = t; b.swoop = true; b.dartT = 0; }
  }

  const n = bs.length;
  for (let i = 0; i < n; i++) {
    const b = bs[i];
    b.ph += dt;
    if (b.dart && (!b.tgt || !g.hittable(b.tgt) || b.dartT > 1.1)) { b.dart = false; b.swoop = false; b.cd = 0.3; }
    if (b.dart) {
      const t = b.tgt;
      b.dartT += dt;
      const dx = t.x - b.x, dy = t.y - b.y, d = Math.hypot(dx, dy) || 1;
      const sp = b.swoop ? 1250 : 900;
      b.vx = damp(b.vx, (dx / d) * sp, 10, dt);
      b.vy = damp(b.vy, (dy / d) * sp, 10, dt);
      if (d < t.r + 12) {
        const dmg = st.damage * 0.6 * (b.swoop ? 3 : 1);
        g.damageEnemy(t, dmg, KISS);
        applyHitEffects(g, t, dmg, 0.35, null);
        if (st.fus.kiss && !t.dead && g.rng.chance(0.15)) charmEnemy(g, t);
        fx.burst(b.x, b.y, b.swoop ? COL.gold : COL.violet, b.swoop ? 8 : 4, 220, 0.35, 3, 1);
        b.dart = false; b.swoop = false; b.cd = 0.6;
        b.vx *= -0.4; b.vy *= -0.4;
      }
    } else {
      const a = g.time * 0.6 + (i / n) * TAU + Math.sin(g.time * 2 + i) * 0.4;
      const R = 95 + 25 * Math.sin(g.time * 1.3 + i * 2);
      const hx = p.x + Math.cos(a) * R + Math.sin(b.ph * 3.1) * 14;
      const hy = p.y + Math.sin(a) * R + Math.cos(b.ph * 2.3) * 14;
      b.vx = damp(b.vx, (hx - b.x) * 5, 6, dt);
      b.vy = damp(b.vy, (hy - b.y) * 5, 6, dt);
      b.cd -= dt;
      if (b.cd <= 0) {
        const t = g.findTarget(b.x, b.y, 450, null);
        if (t) { b.dart = true; b.tgt = t; b.dartT = 0; } else b.cd = 0.25;
      }
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (Math.abs(b.vx) + Math.abs(b.vy) > 30) b.ang = Math.atan2(b.vy, b.vx);
  }
}
