// The heart ship: movement, dash, firing.

import { ARENA, COL, PLAYER } from '../config.js';
import { clamp, damp } from '../core/math.js';
import { fireVolley, updateBeams, spawnProj } from './weapons.js';
import { firePulse } from './spells.js';

export function makePlayer(stats) {
  return {
    x: 0, y: 0, vx: 0, vy: 0, r: PLAYER.r, ang: -Math.PI / 2,
    hp: stats.maxHp, invuln: 1.5, hurtT: 0,
    fireT: 0, beamTick: 0, firing: false,
    dashT: 0, dashDx: 0, dashDy: 0, dashCharges: stats.dashCharges, dashCdT: 0, dashHits: null, afterT: 0,
    shield: false, shieldInit: false, shieldT: 0,
    slow: 0, slowNext: 0, pullX: 0, pullY: 0,
    trailT: 0, ringT: 0, dead: false, aimX: 0, aimY: -100, beatReady: false,
  };
}

export function updatePlayer(g, input, dt) {
  const p = g.player, st = g.stats, fx = g.fx;
  if (p.dead) { g.beams.length = 0; return; }

  p.ang = Math.atan2(input.ay - p.y, input.ax - p.x);
  p.aimX = input.ax; p.aimY = input.ay;
  if (p.invuln > 0) p.invuln -= dt;
  if (p.hurtT > 0) p.hurtT -= dt * 1.5;

  // ---- dash
  if (p.dashCharges < st.dashCharges) {
    p.dashCdT += dt;
    if (p.dashCdT >= st.dashCd) { p.dashCharges++; p.dashCdT = 0; g.audio.play('dashReady'); }
  } else p.dashCdT = 0;

  if (input.dash && p.dashCharges > 0 && p.dashT <= 0) {
    let dx = input.mx, dy = input.my;
    if (!dx && !dy) { dx = Math.cos(p.ang); dy = Math.sin(p.ang); }
    p.dashDx = dx; p.dashDy = dy;
    p.dashT = PLAYER.dashTime;
    p.dashCharges--;
    p.dashHits = new Set();
    p.afterT = 0;
    p.invuln = Math.max(p.invuln, PLAYER.dashTime + 0.14);
    fx.burst(p.x, p.y, COL.rose, 14, 380, 0.4, 4);
    fx.ring(p.x, p.y, COL.pink, 16, 70, 0.25, 3);
    g.audio.play('dash');
  }

  if (p.dashT > 0) {
    p.dashT -= dt;
    p.vx = p.dashDx * PLAYER.dashSpeed;
    p.vy = p.dashDy * PLAYER.dashSpeed;
    fx.spray(p.x, p.y, Math.atan2(-p.dashDy, -p.dashDx), 0.8, COL.pink, 3, 300, 0.35, 5);
    if (st.dash >= 1) {
      p.afterT -= dt;
      if (p.afterT <= 0) {
        p.afterT = 0.035;
        g.zones.push({ kind: 'after', x: p.x, y: p.y, r: 30, t: 0, dur: 0.7, tick: 0, dmg: st.damage * (0.8 + 0.4 * st.dash), ang: p.ang });
      }
    }
    if (st.fus.comet) {
      for (const e of g.grid.query(p.x, p.y, 72, [])) {
        if (!g.hittable(e) || p.dashHits.has(e.id)) continue;
        const dx = e.x - p.x, dy = e.y - p.y, rr = 72 + e.r;
        if (dx * dx + dy * dy > rr * rr) continue;
        p.dashHits.add(e.id);
        g.damageEnemy(e, st.damage * 6, { crit: true });
        if (e.dead) p.shieldT += 3;
      }
      for (const b of g.bullets) {
        const dx = b.x - p.x, dy = b.y - p.y;
        if (b.dead || dx * dx + dy * dy > 95 * 95) continue;
        b.dead = true;
        spawnProj(g, b.x, b.y, Math.atan2(-b.vy, -b.vx), { dmg: st.damage * 2, kind: 'mini', homing: 6, pierce: 1, bounce: 0, canSplit: false, coef: 0.5, life: 1.2, r: 7 });
      }
      fx.spray(p.x, p.y, Math.atan2(-p.dashDy, -p.dashDx), 1.2, COL.gold, 4, 420, 0.5, 6);
    }
    if (p.dashT <= 0) {
      p.vx *= 0.3; p.vy *= 0.3;
      if (st.fus.comet) g.explode(p.x, p.y, 170, st.damage * 4, { col: COL.gold, knock: 380 });
      if (st.fus.skipping) firePulse(g, p.x, p.y);   // Skipping Heart
    }
  } else {
    const sp = st.speed * (1 - p.slow);
    p.vx = damp(p.vx, input.mx * sp, 16, dt);
    p.vy = damp(p.vy, input.my * sp, 16, dt);
  }
  p.slow = p.slowNext; p.slowNext = 0;

  p.x += (p.vx + p.pullX) * dt;
  p.y += (p.vy + p.pullY) * dt;
  p.pullX = p.pullY = 0;
  const hw = ARENA.hw - p.r, hh = ARENA.hh - p.r;
  p.x = clamp(p.x, -hw, hw);
  p.y = clamp(p.y, -hh, hh);

  // closing ring during the final boss: standing outside hurts
  const ra = g.ringArena;
  if (ra) {
    const d = Math.hypot(p.x - ra.x, p.y - ra.y);
    if (d > ra.r) {
      p.ringT += dt;
      if (p.ringT > 0.9) { p.ringT = 0; g.hurtPlayer(1, p.x, p.y); }
    } else p.ringT = Math.max(0, p.ringT - dt);
  }

  // engine glow
  const speed = Math.hypot(p.vx, p.vy);
  if (speed > 60) fx.mote(p.x - Math.cos(p.ang) * 16, p.y - Math.sin(p.ang) * 16, COL.hot, 0.5, 5, 0.35, 50);

  // ---- firing
  p.firing = !!input.fire;
  if (st.fus.lovebeam) {
    updateBeams(g, p.firing, dt);
  } else {
    g.beams.length = 0;
    p.fireT -= dt;
    if (p.firing) {
      if (p.fireT < -dt) p.fireT = -dt;
      const step = 1 / st.fireRate;
      while (p.fireT <= 0) { fireVolley(g); p.fireT += step; }
    } else if (p.fireT < 0) p.fireT = 0;
  }

  if (input.bomb) g.useBomb();
}
