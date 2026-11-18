// The newer arsenal: The Ex (boomerang), Rose Whip, Mirror Ball, Love Letter,
// and the fusions that grow out of them and the older skills (Whiplash, Fan
// Mail, Cupid's Quiver, Laser Tag, Gold Rush, Heart of Gold, Running Wild).

import { ARENA, COL } from '../config.js';
import { TAU, clamp, damp, segDist2 } from '../core/math.js';
import { spawnProj, applyHitEffects } from './weapons.js';

const CRIT = { crit: true };
const QUIET = { quiet: true };

export function updateArsenal(g, dt) {
  const p = g.player, st = g.stats;
  const T = g.arsT || (g.arsT = { ex: 1, whip: 0.6, letter: 1.5, tag: 0, beams: 12 });
  updateRangs(g, dt);
  updateLashes(g, dt);
  updateLetters(g, dt);
  updateTags(g, dt, T);
  updatePins(g, dt);
  updateDecoy(g, dt);
  if (p.dead) { g.mirror = null; return; }

  // ---- The Ex: throw at the nearest enemy, it always comes back
  if (st.ex > 0) {
    T.ex -= dt;
    if (T.ex <= 0) {
      const t = g.findTarget(p.x, p.y, 820, null);
      if (t) {
        T.ex = (2.4 - 0.2 * st.ex) / st.spellRate;
        const ot = 0.62 + 0.07 * st.ex;                // flight time out: longer throws as it levels
        const n = st.ex >= 3 ? 2 : 1, a0 = Math.atan2(t.y - p.y, t.x - p.x);
        for (let k = 0; k < n; k++) {
          g.rangs.push({ x: p.x, y: p.y, ang: a0 + (n > 1 ? (k - 0.5) * 0.6 : 0), t: 0, ot, out: true, hits: new Set(), r: 24, rot: 0, dmg: st.damage * st.spellPow * (2.1 + 0.7 * st.ex), saw: 0, tick: 0 });
        }
        g.audio.play('lunge');
      } else T.ex = 0.3;
    }
  }

  // ---- Rose Whip
  if (st.whip > 0) {
    T.whip -= dt;
    const R = 210 + 30 * st.whip;
    if (T.whip <= 0) {
      const t = g.findTarget(p.x, p.y, R + 60, null);
      if (t) {
        T.whip = (1.8 - 0.2 * st.whip) / st.spellRate;
        lash(g, Math.atan2(t.y - p.y, t.x - p.x), R);
      } else T.whip = 0.15;
    }
  }

  // ---- Mirror Ball: hovers ahead of your aim
  if (st.mirror > 0) {
    const m = g.mirror || (g.mirror = { x: p.x, y: p.y, rot: 0, flash: 0 });
    const tx = p.x + Math.cos(p.ang) * 190, ty = p.y + Math.sin(p.ang) * 190;
    m.x = damp(m.x, tx, 7, dt); m.y = damp(m.y, ty, 7, dt);
    m.rot += dt * 1.6;
    m.flash = Math.max(0, m.flash - dt * 4);
    T.beams = Math.min(10, T.beams + dt * 10);              // beams per second budget
    mirrorPass(g, m, T);
    if (g.onBeat) mirrorBeat(g, m, g.beatN % 2 === 0);
  } else g.mirror = null;

  // ---- Love Letter: into the thickest crowd
  if (st.letter > 0) {
    T.letter -= dt;
    if (T.letter <= 0) {
      const t = densest(g, p.x, p.y, 800);
      if (t) {
        T.letter = (4.6 - 0.5 * st.letter) / st.spellRate;
        const n = st.letter >= 4 ? 3 : st.letter >= 3 ? 2 : 1, picked = [t];
        for (let k = 1; k < n; k++) {
          const o = densest(g, p.x, p.y, 800, picked);
          if (o) picked.push(o);
        }
        picked.forEach((o, k) => g.letters.push({ x: p.x, y: p.y, tgt: o, tx: o.x, ty: o.y, t: -k * 0.15, rot: 0 }));
        g.audio.play('pick');
      } else T.letter = 0.4;
    }
  }

  // ---- Running Wild: heat builds while you move
  if (st.fus.runningwild) {
    const sp = Math.hypot(p.vx, p.vy);
    if (p.dashT <= 0) p.heat = clamp((p.heat || 0) + (sp > 180 ? dt / 3.2 : -dt * 0.25), 0, 1);
    if (p.heat >= 1 && !p.hot) { p.hot = true; g.fx.ring(p.x, p.y, COL.orange, 20, 90, 0.35, 4); g.audio.play('dashReady'); }
  }
}

// ------------------------------------------------------------------ The Ex
function updateRangs(g, dt) {
  const p = g.player, st = g.stats;
  for (const r of g.rangs) {
    r.t += dt;
    r.rot += dt * 18;
    if (r.saw > 0) {                                 // Whiplash: a buzzsaw circling you
      r.saw -= dt;
      r.oa += dt * 8;
      r.x = p.x + Math.cos(r.oa) * 120; r.y = p.y + Math.sin(r.oa) * 120;
      r.tick -= dt;
      if (r.tick <= 0) { r.tick = 0.15; r.hits.clear(); }
      for (const b of g.bullets) {
        const dx = b.x - r.x, dy = b.y - r.y, rr = r.r + b.r + 6;
        if (!b.dead && dx * dx + dy * dy < rr * rr) { b.dead = true; r.saw -= 0.25; g.fx.mote(b.x, b.y, COL.rose, 1, 4, 0.3, 160); }
      }
      if (r.saw <= 0) r.dead = true;
    } else if (r.out) {
      const v = 1200 * Math.max(0, 1 - r.t / r.ot);
      r.x += Math.cos(r.ang) * v * dt; r.y += Math.sin(r.ang) * v * dt;
      if (r.t >= r.ot) { r.out = false; r.hits.clear(); }
    } else {
      const dx = p.x - r.x, dy = p.y - r.y, d = Math.hypot(dx, dy) || 1;
      const v = Math.min(1500, 250 + (r.t - r.ot) * 2600);
      r.x += (dx / d) * v * dt; r.y += (dy / d) * v * dt;
      if (d < 34 || r.t > 4) {
        if (st.fus.whiplash && d < 34) {
          r.saw = 3; r.oa = Math.atan2(r.y - p.y, r.x - p.x); r.tick = 0;
          g.fx.ring(p.x, p.y, COL.rose, 40, 130, 0.3, 3);
          g.audio.play('charge');
        } else r.dead = true;
      }
    }
    if (r.dead) continue;
    for (const e of g.grid.query(r.x, r.y, r.r + 30, [])) {
      if (!g.hittable(e) || r.hits.has(e.id)) continue;
      const dx = e.x - r.x, dy = e.y - r.y, rr = e.r + r.r;
      if (dx * dx + dy * dy > rr * rr) continue;
      r.hits.add(e.id);
      const dmg = r.saw > 0 ? r.dmg * 0.55 : r.dmg;
      g.damageEnemy(e, dmg, CRIT);
      applyHitEffects(g, e, dmg, 0.6, null);
      g.fx.spray(r.x, r.y, Math.atan2(dy, dx), 1.4, COL.rose, 4, 280, 0.3, 4);
    }
  }
  g.rangs = g.rangs.filter((r) => !r.dead);
}

// ------------------------------------------------------------------ Rose Whip
/** Is (x, y) inside a lash's arc around (cx, cy)? */
function inArc(cx, cy, ang, R, half, x, y, pad) {
  const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
  if (d > R + pad) return false;
  let da = (Math.atan2(dy, dx) - ang) % TAU;
  if (da > Math.PI) da -= TAU; else if (da < -Math.PI) da += TAU;
  return Math.abs(da) < half + pad / Math.max(d, 1);
}

const LASH_SWING = 0.26, LASH_LINGER = 0.7, WHIP_SNAG = 2;

function lash(g, ang, R) {
  const p = g.player, st = g.stats, half = 1.0;
  const dmg = st.damage * st.spellPow * (2.6 + 0.8 * st.whip);
  // the swing hits once, then the thorns hang in the air and keep cutting
  g.lashes.push({ x: p.x, y: p.y, ang, R, half, t: 0, dur: LASH_SWING + LASH_LINGER, tick: LASH_SWING, dmg: dmg * 0.3 });
  const inArcP = (x, y, pad) => inArc(p.x, p.y, ang, R, half, x, y, pad);
  for (const e of g.grid.query(p.x, p.y, R + 60, [])) {
    if (!g.hittable(e) || !inArcP(e.x, e.y, e.r)) continue;
    g.damageEnemy(e, dmg, CRIT);
    applyHitEffects(g, e, dmg, 0.8, null);
    if (!e.dead && !e.boss && !e.def.heavy) {        // the thorns drag them in
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      e.vx += (dx / d) * 520; e.vy += (dy / d) * 520;
    }
  }
  // the swing snags only the few bullets closest to you
  const snag = g.bullets.filter((b) => !b.dead && inArcP(b.x, b.y, b.r));
  if (snag.length > WHIP_SNAG + st.whip) snag.sort((u, v) => ((u.x - p.x) ** 2 + (u.y - p.y) ** 2) - ((v.x - p.x) ** 2 + (v.y - p.y) ** 2));
  for (const b of snag.slice(0, WHIP_SNAG + st.whip)) { b.dead = true; g.fx.mote(b.x, b.y, COL.rose, 1, 4, 0.3, 200); }
  g.fx.spray(p.x, p.y, ang, half, COL.rose, 10, R * 2.2, 0.3, 4);
  g.audio.play('dash');
}

function updateLashes(g, dt) {
  for (const l of g.lashes) {
    l.t += dt; l.x = g.player.x; l.y = g.player.y;
    if (l.t < LASH_SWING) continue;
    l.tick -= dt;
    if (l.tick > 0) continue;
    l.tick = 0.14;                                   // lingering thorns
    for (const e of g.grid.query(l.x, l.y, l.R + 60, [])) {
      if (g.hittable(e) && inArc(l.x, l.y, l.ang, l.R, l.half, e.x, e.y, e.r)) g.damageEnemy(e, l.dmg, QUIET);
    }
  }
  g.lashes = g.lashes.filter((l) => l.t < l.dur);
}

// ------------------------------------------------------------------ Mirror Ball
function mirrorPass(g, m, T) {
  const st = g.stats, n = g.projs.length;
  for (let i = 0; i < n; i++) {
    const q = g.projs[i];
    if (q.dead || q.mirrored || q.t < 0.03) continue;
    const dx = q.x - m.x, dy = q.y - m.y, rr = 34 + q.r;
    if (dx * dx + dy * dy > rr * rr) continue;
    q.mirrored = true;
    if (T.beams < 1) continue;
    const skip = [];
    for (let k = 0; k < st.mirrorN && T.beams >= 1; k++) {
      const t = g.findTarget(m.x, m.y, 620, skip);
      if (!t) break;
      skip.push(t.id);
      T.beams--;
      const dmg = Math.max(q.dmg, st.damage) * 0.5 * st.spellPow;
      g.flashBeams.push({ x1: m.x, y1: m.y, x2: t.x, y2: t.y, t: 0.16, max: 0.16, col: COL.cyan });
      g.damageEnemy(t, dmg, CRIT);
      applyHitEffects(g, t, dmg, 0.3, null);
    }
    m.flash = 1;
  }
}

function mirrorBeat(g, m, spot) {
  const st = g.stats, skip = [];
  for (let k = 0; spot && k < st.mirror; k++) {     // spotlights, every other beat
    const t = g.findTarget(m.x, m.y, 520, skip);
    if (!t) break;
    skip.push(t.id);
    g.flashBeams.push({ x1: m.x, y1: m.y, x2: t.x, y2: t.y, t: 0.3, max: 0.3, col: COL.gold, spot: true });
    g.damageEnemy(t, st.damage * st.spellPow * (1.4 + 0.4 * st.mirror), CRIT);
  }
  if (st.fus.fanmail) {                              // Fan Mail: a letter for everyone in the light
    let sent = 0;
    for (const e of g.grid.query(m.x, m.y, 460, [])) {
      if (sent >= 5 || !g.hittable(e) || e.def.untargetable) continue;
      if ((e.x - m.x) ** 2 + (e.y - m.y) ** 2 > 460 * 460) continue;
      const a = Math.atan2(e.y - m.y, e.x - m.x);
      const q = spawnProj(g, m.x, m.y, a, { dmg: st.damage * st.spellPow * 1.4, kind: 'letter', homing: 9, r: 10, spd: 700, life: 1.4, pierce: 0, bounce: 0, canSplit: false, coef: 0.5 });
      if (q) { q.tgt = e; q.mirrored = true; sent++; }
    }
  }
  m.flash = 1;
}

/** A letter (Fan Mail) bursting into a ring of small hearts. */
export function letterBurst(g, x, y, n, dmg) {
  const a0 = g.rng.angle();
  for (let i = 0; i < n; i++) {
    const q = spawnProj(g, x, y, a0 + (i / n) * TAU, { dmg, kind: 'mini', r: 7, spd: 700, life: 0.45, pierce: 1, bounce: 0, homing: 0, canSplit: false, coef: 0.4 });
    if (q) q.mirrored = true;
  }
}

// ------------------------------------------------------------------ Love Letter
function densest(g, x, y, range, avoid = []) {
  let best = null, score = -1;
  const cands = [];
  for (const e of g.enemies) {
    if (!g.hittable(e) || e.def.untargetable) continue;
    if (avoid.some((a) => (a.x - e.x) ** 2 + (a.y - e.y) ** 2 < 260 * 260)) continue;   // a different crowd
    if ((e.x - x) ** 2 + (e.y - y) ** 2 < range * range) cands.push(e);
  }
  for (let i = 0; i < cands.length && i < 40; i++) {
    const e = cands[Math.floor(g.rng.next() * cands.length)];
    let n = 0;
    for (const o of cands) if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 180 * 180) n++;
    if (n > score) { score = n; best = e; }
  }
  return best;
}

function updateLetters(g, dt) {
  const st = g.stats;
  for (const L of g.letters) {
    L.t += dt;
    if (L.t < 0) { L.x = g.player.x; L.y = g.player.y; continue; }   // staggered launch
    if (L.tgt && !L.tgt.dead) { L.tx = L.tgt.x; L.ty = L.tgt.y; }
    const dx = L.tx - L.x, dy = L.ty - L.y, d = Math.hypot(dx, dy) || 1;
    const v = 300 + L.t * 260;
    L.x += (dx / d) * Math.min(d, v * dt); L.y += (dy / d) * Math.min(d, v * dt);
    L.rot = Math.sin(L.t * 9) * 0.25;
    if (d < 24 || L.t > 3.2) {
      L.dead = true;
      const n = 10 + 2 * Math.max(1, st.letter), dmg = st.damage * st.spellPow * (0.95 + 0.2 * st.letter);
      const a0 = g.rng.angle();
      for (let w = 0; w < 2; w++) {                  // two waves, twisted: a spiral
        g.delayed.push({ t: w * 0.12, fn: () => {
          for (let i = 0; i < n / 2; i++) spawnProj(g, L.x, L.y, a0 + w * 0.3 + (i / (n / 2)) * TAU, { dmg, r: 10, spd: 820, life: 0.6, pierce: 1, bounce: 0, homing: 0, canSplit: false, coef: 0.6 });
        } });
      }
      g.fx.burst(L.x, L.y, COL.pink, 26, 420, 0.6, 5, 1);
      g.fx.ring(L.x, L.y, COL.rose, 20, 140, 0.3, 3);
      g.audio.play('enemyBurst');
    }
  }
  g.letters = g.letters.filter((L) => !L.dead);
}

// ------------------------------------------------------------------ Laser Tag
/** Called from the hit pipeline when a heart pierces or ricochets. */
export function tagLine(g, q) {
  const x1 = q.lx ?? q.x, y1 = q.ly ?? q.y;
  q.lx = q.x; q.ly = q.y;
  if ((q.x - x1) ** 2 + (q.y - y1) ** 2 < 30 * 30 || g.tags.length > 80) return;
  g.tags.push({ x1, y1, x2: q.x, y2: q.y, t: 0, dur: 0.6 });
}

function updateTags(g, dt, T) {
  if (!g.tags.length) return;
  T.tag -= dt;
  const tick = T.tag <= 0;
  if (tick) T.tag = 0.12;
  const dmg = g.stats.damage * 0.6;
  for (const l of g.tags) {
    l.t += dt;
    if (!tick) continue;
    for (const e of g.enemies) {
      if (!g.hittable(e)) continue;
      const rr = e.r + 8;
      if (segDist2(e.x, e.y, l.x1, l.y1, l.x2, l.y2) < rr * rr) g.damageEnemy(e, dmg, QUIET);
    }
  }
  g.tags = g.tags.filter((l) => l.t < l.dur);
}

// ------------------------------------------------------------------ Cupid's Quiver
/** A broken half sticks into the enemy it hit. */
export function pinArrow(g, e, q) {
  e.pins = Math.min(15, (e.pins || 0) + 1);
  (e.pinA || (e.pinA = [])).push(Math.atan2(q.y - e.y, q.x - e.x) - (e.rot || 0));
  if (e.pinA.length > 15) e.pinA.shift();
  if (!(e.pinT > 0)) e.pinT = 1.0;
}

function updatePins(g, dt) {
  const st = g.stats;
  if (!st.fus.quiver) return;
  for (const e of g.enemies) {
    if (!(e.pinT > 0)) continue;
    e.pinT -= dt;
    if (e.dead) { e.pinT = 0; continue; }
    if (e.pinT > 0) continue;
    const n = e.pins || 0;
    e.pins = 0; e.pinA = [];
    const dmg = st.damage * 0.9 * n * (1 + 0.06 * n);
    g.fx.burst(e.x, e.y, COL.pink, 8 + n * 2, 300 + n * 20, 0.5, 4, 1);
    g.fx.text(e.x, e.y - e.r - 16, `x${n}`, COL.rose, 10 + Math.min(8, n), 0.6);
    g.damageEnemy(e, dmg, CRIT);
    const a0 = g.rng.angle(), k = Math.min(n, 8);
    for (let i = 0; i < k; i++) spawnProj(g, e.x, e.y, a0 + (i / k) * TAU, { dmg: st.damage * 0.5, kind: 'mini', r: 6, spd: 760, life: 0.4, pierce: 0, bounce: 0, homing: 0, canSplit: false, coef: 0.3, hits: [e.id] });
    g.audio.play('hit');
  }
}

// ------------------------------------------------------------------ Heart of Gold
export function dropDecoy(g) {
  const p = g.player;
  g.decoy = { x: p.x, y: p.y, vx: 0, vy: 0, r: 22, t: 0, dur: 4, dead: false, decoy: true, pullX: 0, pullY: 0, slowNext: 0, invuln: 1, hp: 99 };
  g.fx.burst(p.x, p.y, COL.gold, 30, 420, 0.6, 5, 1);
  g.fx.text(p.x, p.y - 50, 'DECOY', COL.gold, 13, 0.9);
}

function updateDecoy(g, dt) {
  const d = g.decoy;
  if (!d) return;
  d.t += dt;
  for (const b of g.bullets) {                      // it soaks up shots meant for it
    const dx = b.x - d.x, dy = b.y - d.y, rr = d.r + b.r;
    if (!b.dead && dx * dx + dy * dy < rr * rr) { b.dead = true; g.fx.mote(b.x, b.y, COL.gold, 1, 4, 0.3, 160); }
  }
  if (d.t >= d.dur) {
    const st = g.stats;
    g.explode(d.x, d.y, 280, st.damage * (5 + st.maxHp), { col: COL.gold, knock: 420 });
    g.fx.shock(d.x, d.y, 1.4, 900, 0.7);
    g.fx.shake(12);
    g.audio.play('explode');
    g.decoy = null;
  }
}

// ------------------------------------------------------------------ Gold Rush
/** XP flying to you cuts through enemies on the way. */
export function goldStream(g, k) {
  const q = g._gq || (g._gq = []);
  g.grid.query(k.x, k.y, 18, q);
  for (let i = 0; i < q.length; i++) {
    const e = q[i];
    if (!g.hittable(e)) continue;
    if (k.hit && k.hit.indexOf(e.id) >= 0) continue;
    const dx = e.x - k.x, dy = e.y - k.y, rr = e.r + 10;
    if (dx * dx + dy * dy > rr * rr) continue;
    (k.hit || (k.hit = [])).push(e.id);
    g.damageEnemy(e, g.stats.damage * 0.7, QUIET);
    g.fx.mote(k.x, k.y, COL.gold, 1, 4, 0.3, 160);
  }
}

export function goldCollect(g, v) {
  g.goldAcc = (g.goldAcc || 0) + v;
  if (g.goldAcc >= 150) {
    g.goldAcc -= 150;
    const p = g.player, a = g.rng.angle();
    g.pickups.push(g.makePickup(clamp(p.x + Math.cos(a) * 160, -ARENA.hw + 40, ARENA.hw - 40), clamp(p.y + Math.sin(a) * 160, -ARENA.hh + 40, ARENA.hh - 40), 'heart', 1));
    g.fx.text(p.x, p.y - 44, 'GOLD RUSH', COL.gold, 12, 0.8);
  }
}
