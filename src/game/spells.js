// Skills that act on their own: pulse, guardians, cherubs, gravity wells,
// starfall, barrier, stardust trail.

import { COL } from '../config.js';
import { TAU, damp, segDist2 } from '../core/math.js';
import { spawnProj } from './weapons.js';

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
    if (tick) T.orbit += 0.2;
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
      T.pulse += 2.6 - 0.25 * st.pulse;
      const R = 170 + 35 * st.pulse;
      fx.ring(p.x, p.y, COL.pink, 24, R, 0.38, 6);
      fx.ring(p.x, p.y, COL.white, 16, R * 0.8, 0.3, 2);
      fx.shock(p.x, p.y, 0.5, R * 1.9, 0.45);
      g.audio.play('pulse');
      for (const e of g.grid.query(p.x, p.y, R, [])) {
        if (!g.hittable(e)) continue;
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
        if (d > R + e.r) continue;
        g.damageEnemy(e, st.damage * (1.2 + 0.5 * st.pulse), null);
        if (!e.dead && !e.boss && !e.def.heavy) { e.vx += (dx / d) * 260; e.vy += (dy / d) * 260; }
      }
      if (st.fus.pulsar) {
        for (const o of orb) {
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
  }

  // ---- Cherubs (and Entourage ghosts)
  const drones = g.drones;
  let real = 0;
  for (const d of drones) if (!d.ghost) real++;
  while (real < st.drones) { drones.push({ x: p.x, y: p.y, cd: 0.3, ang: 0, ghost: false, slot: real }); real++; }
  const rate = Math.max(0.3, 0.74 - 0.08 * st.droneLvl);
  for (let i = 0; i < drones.length; i++) {
    const d = drones[i];
    const a = g.time * (d.ghost ? -0.7 : 0.9) + (i / Math.max(1, drones.length)) * TAU;
    const rad = d.ghost ? 150 : 64;
    d.x = damp(d.x, p.x + Math.cos(a) * rad, 6, dt);
    d.y = damp(d.y, p.y + Math.sin(a) * rad, 6, dt);
    d.cd -= dt;
    if (d.cd <= 0) {
      const t = g.findTarget(d.x, d.y, 620, null);
      if (t) {
        d.cd = rate * (d.ghost ? 1.25 : 1);
        d.ang = Math.atan2(t.y - d.y, t.x - d.x);
        spawnProj(g, d.x, d.y, d.ang, { dmg: st.damage * 0.45, kind: 'mini', r: 7, spd: 950, life: 0.8, canSplit: false, coef: 0.45, bounce: Math.min(1, st.bounce) });
      } else d.cd = 0.2;
    }
  }

  // ---- Irresistible
  if (st.well > 0) {
    T.well -= dt;
    if (T.well <= 0) {
      const t = g.findTarget(p.x, p.y, 640, null);
      if (t) {
        T.well = 9 - st.well;
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
      T.stars += (1.7 - 0.25 * st.stars) * (st.fus.stardust ? 0.5 : 1);
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
