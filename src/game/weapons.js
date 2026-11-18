// The player's hearts: firing, flight, and the single on-hit pipeline every
// technique plugs into (statuses -> blast -> chain -> charm -> split/bounce/pierce).

import { ARENA, COL } from '../config.js';
import { TAU, turnToward, segDist2 } from '../core/math.js';
import { igniteEnemy, chillEnemy, charmEnemy, envyEnemy, tieEnemy, tiedTo } from './status.js';
import { tagLine, pinArrow, letterBurst } from './arsenal.js';

const CRIT = { crit: true };
const SURE_CRIT = { crit: true, sure: true };   // beat volleys
const QUIET = { quiet: true };
const MAX_PROJ = 1400;

export function spawnProj(g, x, y, ang, o) {
  if (g.projs.length >= MAX_PROJ) return null;
  const st = g.stats;
  const spd = o.spd ?? st.projSpeed;
  const p = {
    x, y, ang, spd, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
    life: o.life ?? st.projLife, dmg: o.dmg, r: o.r ?? 10, kind: o.kind ?? 'heart',
    pierce: o.pierce ?? st.pierce, bounce: o.bounce ?? st.bounce, homing: o.homing ?? st.homing,
    canSplit: o.canSplit ?? st.split > 0, gen: o.gen ?? 0, coef: o.coef ?? 1, chill: o.chill || 0, beat: !!o.beat,
    hits: o.hits || [], tgt: null, tgtT: 0, t: 0, dead: false, lx: x, ly: y,
  };
  g.projs.push(p);
  return p;
}

export function volleyAngles(g, extra = 0) {
  const n = g.stats.multishot + extra;
  const spread = Math.min(0.12 * (n - 1), 0.66);
  const out = [];
  for (let i = 0; i < n; i++) out.push(n > 1 ? (i / (n - 1) - 0.5) * spread : 0);
  return out;
}

export function fireVolley(g) {
  const p = g.player, st = g.stats;
  const onBeat = st.beat > 0 && p.beatReady;
  if (onBeat) {
    p.beatReady = false;
    beatVolley(g);
    if (st.fus.encore) g.delayed.push({ t: 0.09, fn: () => { if (!g.player.dead) beatVolley(g); } });
    return;
  }
  const dmg = st.damage * st.shotMul;
  const ox = p.x + Math.cos(p.ang) * 22, oy = p.y + Math.sin(p.ang) * 22;
  for (const a of volleyAngles(g)) spawnProj(g, ox, oy, p.ang + a, { dmg });
  if (st.fus.heartstorm) {
    for (let k = 0; k < 3; k++) {
      spawnProj(g, ox, oy, p.ang + g.rng.range(-1.1, 1.1), { dmg: st.damage * 0.45, kind: 'mini', homing: 9, r: 6, spd: 780, life: 1.3, pierce: 0, bounce: 0, canSplit: false, coef: 0.4 });
    }
  }
  g.fx.spray(ox, oy, p.ang, 0.7, COL.rose, 3, 320, 0.2, 3);
  g.audio.play('shoot');
}

/** On the Beat: bigger hearts that always crit. */
function beatVolley(g) {
  const p = g.player, st = g.stats;
  const o = { dmg: st.damage * st.shotMul * (1 + 0.2 * st.beat), beat: true, r: 13 };
  const ox = p.x + Math.cos(p.ang) * 22, oy = p.y + Math.sin(p.ang) * 22;
  for (const a of volleyAngles(g, st.beat >= 3 ? 1 : 0)) spawnProj(g, ox, oy, p.ang + a, o);
  g.fx.ring(p.x, p.y, COL.gold, 18, 46, 0.22, 2);
  g.fx.spray(ox, oy, p.ang, 0.9, COL.gold, 6, 380, 0.25, 4);
  g.audio.play('shoot');
}

function spawnHalves(g, p, e) {
  const st = g.stats;
  for (const s of [-1, 1]) {
    spawnProj(g, p.x, p.y, p.ang + s * 0.62, {
      dmg: p.dmg * st.splitMul, kind: 'half', gen: p.gen + 1, canSplit: false,
      bounce: st.fus.kaleidoscope ? 1 : 0, pierce: 0, life: st.fus.quiver ? 0.7 : 0.5, r: 7, coef: 0.5, hits: [e.id],
      homing: st.fus.quiver ? 8 : st.homing,
    });
  }
}

/** Arc lightning from an enemy to its neighbours. */
export function chainFrom(g, e, dmg) {
  const st = g.stats;
  const skip = [e.id];
  let from = e;
  for (let i = 0; i < st.chainN; i++) {
    const t = g.findTarget(from.x, from.y, 250, skip);
    if (!t) break;
    skip.push(t.id);
    g.fx.lightning(from.x, from.y, t.x, t.y, COL.ice);
    g.damageEnemy(t, dmg, QUIET);
    if (st.fus.absolutezero && !t.dead) chillEnemy(g, t, 0.5);
    if (st.fus.wildfire && !t.dead) {              // Wildfire: arcs carry the flames
      const dps = st.damage * Math.max(0.5, st.burn);
      igniteEnemy(g, t, dps); igniteEnemy(g, t, dps);
    }
    from = t;
  }
  if (skip.length > 1) g.audio.play('zap');
}

/**
 * Everything a hit triggers besides its own damage. `coef` scales proc chances
 * for weak or rapid sources (beam ticks, drones, halves).
 */
export function applyHitEffects(g, e, dmg, coef, p) {
  const st = g.stats, rng = g.rng;
  if (!e.dead) {
    if (st.burn > 0) igniteEnemy(g, e, st.damage * st.burn);
    const ch = st.chill + (p ? p.chill : 0);
    if (ch > 0) chillEnemy(g, e, ch * Math.max(coef, 0.35));
    if (st.envy > 0) envyEnemy(g, e, 1);
    if (st.strings > 0) tieEnemy(g, e);
    // Soulmates: whatever one feels, so does the other
    const m = st.fus.soulmates ? tiedTo(e) : null;
    if (m && !e.dead) {
      if (e.burnT > 0) igniteEnemy(g, m, e.burn);
      if (ch > 0) chillEnemy(g, m, ch * 0.5);
      if (e.envy > (m.envy || 0)) { m.envy = e.envy; m.envyT = 4; }
    }
    if (st.charm > 0 && rng.chance(st.charm * coef)) charmEnemy(g, e);
  }
  if (st.explodeR > 0 && (coef >= 1 || rng.chance(coef))) {
    g.explode(e.x, e.y, st.explodeR, dmg * st.explodeMul, { col: COL.orange, skip: e, small: true });
  }
  if (st.chainChance > 0 && rng.chance(st.chainChance * coef)) chainFrom(g, e, dmg * 0.5);
}

function onHit(g, p, e) {
  const st = g.stats;
  g.damageEnemy(e, p.dmg, p.beat ? SURE_CRIT : CRIT);
  p.hits.push(e.id);
  if (p.hits.length > 10) p.hits.shift();
  applyHitEffects(g, e, p.dmg, p.coef, p);
  g.fx.spray(p.x, p.y, p.ang + Math.PI, 1.4, p.kind === 'shard' ? COL.ice : COL.pink, 3, 260, 0.25, 3);
  g.audio.play('hit');
  if (p.kind === 'letter') { letterBurst(g, p.x, p.y, 6, st.damage * 0.6); p.dead = true; return; }
  if (p.kind === 'half' && st.fus.quiver && !e.dead) { pinArrow(g, e, p); p.dead = true; return; }   // Cupid's Quiver

  if (p.canSplit && p.gen < 1) { p.canSplit = false; spawnHalves(g, p, e); }
  if (p.bounce > 0) {
    const t = g.findTarget(p.x, p.y, 460, p.hits);
    if (t) {
      if (st.fus.lasertag) tagLine(g, p);
      p.bounce--;
      p.ang = Math.atan2(t.y - p.y, t.x - p.x);
      p.vx = Math.cos(p.ang) * p.spd; p.vy = Math.sin(p.ang) * p.spd;
      p.life = Math.max(p.life, 0.4);
      p.tgt = t;
      if (st.fus.kaleidoscope && p.gen < 2) spawnHalves(g, p, e);
      return;
    }
  }
  if (p.pierce > 0) { p.pierce--; if (st.fus.lasertag) tagLine(g, p); return; }
  p.dead = true;
}

export function updateProjectiles(g, dt) {
  const hw = ARENA.hw + 40, hh = ARENA.hh + 40;
  const q = g._pq || (g._pq = []);
  const wardens = g.wardens;
  for (let i = 0, n = g.projs.length; i < n; i++) {
    const p = g.projs[i];
    if (p.dead) continue;
    p.t += dt;
    p.life -= dt;
    if (p.life <= 0) { p.dead = true; continue; }

    if (p.homing > 0) {
      p.tgtT -= dt;
      if (!p.tgt || p.tgt.dead || p.tgtT <= 0) { p.tgt = g.findTarget(p.x, p.y, 430, p.hits); p.tgtT = 0.15; }
      if (p.tgt) {
        p.ang = turnToward(p.ang, Math.atan2(p.tgt.y - p.y, p.tgt.x - p.x), p.homing * dt);
        p.vx = Math.cos(p.ang) * p.spd; p.vy = Math.sin(p.ang) * p.spd;
      }
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.x < -hw || p.x > hw || p.y < -hh || p.y > hh) { p.dead = true; continue; }

    // warden shields stop hearts that fly into the arc from outside
    let blocked = false;
    for (let w = 0; w < wardens.length; w++) {
      const e = wardens[w];
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy), R = e.def.shieldArc.r;
      if (d > R + 14 || d < R - 14) continue;
      if (p.vx * dx + p.vy * dy > 0) continue;                 // moving outward
      let da = (Math.atan2(dy, dx) - e.rot) % TAU;
      if (da > Math.PI) da -= TAU; else if (da < -Math.PI) da += TAU;
      if (Math.abs(da) < e.def.shieldArc.half) {
        blocked = true; e.shieldHit = 1;
        e.shieldHp = (e.shieldHp ?? 8) - 1;
        if (e.shieldHp <= 0) { g.fx.burst(e.x, e.y, COL.blue, 18, 380, 0.5, 4); g.fx.ring(e.x, e.y, COL.cyan, 30, 90, 0.3, 3); g.audio.play('shieldBreak'); }
        break;
      }
    }
    if (blocked) {
      p.dead = true;
      g.fx.spray(p.x, p.y, p.ang + Math.PI, 1.6, COL.blue, 5, 320, 0.3, 3);
      g.audio.play('block');
      continue;
    }

    g.grid.query(p.x, p.y, p.r, q);
    for (let k = 0; k < q.length; k++) {
      const e = q[k];
      if (e.dead || e.spawn > 0 || e.faded || e.charm > 0) continue;
      const dx = e.x - p.x, dy = e.y - p.y, rr = e.r + p.r;
      if (dx * dx + dy * dy > rr * rr) continue;
      if (p.hits.indexOf(e.id) >= 0) continue;
      onHit(g, p, e);
      if (p.dead) break;
    }
  }
}

/** Love Beam fusion: continuous piercing beams in place of volleys. */
export function updateBeams(g, firing, dt) {
  const p = g.player, st = g.stats;
  g.beams.length = 0;
  if (!firing || p.dead) return;
  p.beamTick -= dt;
  const tick = p.beamTick <= 0;
  if (tick) p.beamTick += 0.1;
  const dps = st.damage * st.shotMul * st.fireRate * 1.25;
  const len = 920;
  // On the Beat with Love Beam: every beat the beam surges for a guaranteed crit
  const surge = st.beat > 0 && p.beatReady;
  if (surge) p.beatReady = false;
  for (const a of volleyAngles(g)) {
    const ang = p.ang + a;
    const x1 = p.x + Math.cos(ang) * 22, y1 = p.y + Math.sin(ang) * 22;
    const x2 = x1 + Math.cos(ang) * len, y2 = y1 + Math.sin(ang) * len;
    g.beams.push({ x1, y1, x2, y2 });
    if (surge) g.flashBeams.push({ x1, y1, x2, y2, t: 0.22, max: 0.22 });
    if (!tick && !surge) continue;
    for (const e of g.enemies) {
      if (!g.hittable(e)) continue;
      const rr = e.r + 9;
      if (segDist2(e.x, e.y, x1, y1, x2, y2) > rr * rr) continue;
      if (surge) {
        const n = st.fus.encore ? 2 : 1;
        for (let k = 0; k < n && !e.dead; k++) g.damageEnemy(e, st.damage * st.shotMul * (1 + 0.2 * st.beat) * 1.5, SURE_CRIT);
        if (!tick || e.dead) continue;
      }
      g.damageEnemy(e, dps * 0.1, CRIT);
      applyHitEffects(g, e, dps * 0.25, 0.28, null);
      g.fx.mote(e.x, e.y, COL.pink, 0.7, 4, 0.3, 200, 0);
      if (st.split > 0 && g.rng.chance(0.1)) {
        for (const s of [-1, 1]) spawnProj(g, e.x, e.y, ang + s * 0.7, { dmg: st.damage * st.splitMul, kind: 'half', gen: 1, canSplit: false, bounce: st.fus.kaleidoscope ? 1 : 0, pierce: 0, life: 0.5, r: 7, coef: 0.5, hits: [e.id] });
      }
      if (st.bounce > 0 && g.rng.chance(0.1)) {
        const t = g.findTarget(e.x, e.y, 460, [e.id]);
        if (t) spawnProj(g, e.x, e.y, Math.atan2(t.y - e.y, t.x - e.x), { dmg: st.damage * 0.8, bounce: st.bounce - 1, pierce: 0, canSplit: false, hits: [e.id], coef: 0.6 });
      }
    }
  }
  if (tick) g.audio.play('beam');
}
