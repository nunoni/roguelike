// A simple autopilot. Used for the title-screen attract mode and for headless
// test runs; it is not meant to play well, only plausibly.

import { ARENA } from '../config.js';
import { SKILL_BY_ID, RECIPES_OF, otherOf, usedSkills } from './upgrades.js';

export function botInput(g) {
  const p = g.player;
  let fx = 0, fy = 0, near = null, nd = 1e9, crowd = 0, danger = 0;

  for (const e of g.enemies) {
    if (e.dead || e.charm > 0) continue;
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (e.spawn <= 0 && !e.faded && !e.def.untargetable && d < nd) { nd = d; near = e; }
    const reach = 260 + e.r * 2;
    if (d < reach) {
      const w = (reach - d) / reach;
      fx += (dx / d) * w * 2.2; fy += (dy / d) * w * 2.2;
      crowd++;
      if (d < 90 + e.r) danger++;
    }
  }
  for (const b of g.bullets) {
    const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1;
    if (d < 190) {
      const w = (190 - d) / 190;
      // sidestep across the bullet's path rather than straight back
      const s = Math.sign(b.vx * dy - b.vy * dx) || 1;
      const bl = Math.hypot(b.vx, b.vy) || 1;
      fx += (-b.vy / bl) * s * w * 2.6 + (dx / d) * w; fy += (b.vx / bl) * s * w * 2.6 + (dy / d) * w;
      if (d < 70) danger++;
    }
  }
  for (const z of g.zones) {
    if (z.kind === 'blast' && z.gapX !== undefined) {   // Crystal Prison: run for the gap
      const dx = p.x - z.x, dy = p.y - z.y;
      if (Math.hypot(dx, dy) < 420) {
        const gx = z.gapX - p.x, gy = z.gapY - p.y, gd = Math.hypot(gx, gy) || 1;
        fx += (gx / gd) * 14; fy += (gy / gd) * 14;
        if (z.t > z.dur - 0.5) danger++;
      }
    } else if (z.kind === 'blast') {
      const dx = p.x - z.x, dy = p.y - z.y, d = Math.hypot(dx, dy) || 1;
      if (d < z.r + 60) { fx += (dx / d) * 4; fy += (dy / d) * 4; }
    } else if (z.kind === 'tile') {           // square floor tiles: step out of the lit ones
      const dx = p.x - z.x, dy = p.y - z.y;
      if (Math.abs(dx) < z.r + 30 && Math.abs(dy) < z.r + 30) {
        const d = Math.hypot(dx, dy) || 1;
        fx += (dx / d) * 4.5; fy += (dy / d) * 4.5;
        if (z.t > z.dur - 0.25 && Math.abs(dx) < z.r && Math.abs(dy) < z.r) danger++;
      }
    } else if (z.kind === 'web') {
      const dx = p.x - z.x, dy = p.y - z.y, d = Math.hypot(dx, dy) || 1;
      if (d < z.r + 40) { fx += (dx / d) * 1.5; fy += (dy / d) * 1.5; }
    }
  }
  for (const e of g.enemies) {                  // a singing Siren: dash to break the pull
    if (e.type === 'siren' && e.state === 1 && !e.dead && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < 800 * 800) danger++;
  }
  for (const l of g.lasers) {
    const ex = l.x + Math.cos(l.ang) * l.len, ey = l.y + Math.sin(l.ang) * l.len;
    const dx = ex - l.x, dy = ey - l.y, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - l.x) * dx + (p.y - l.y) * dy) / l2));
    const cx = l.x + dx * t, cy = l.y + dy * t;
    const ox = p.x - cx, oy = p.y - cy, d = Math.hypot(ox, oy) || 1;
    const reach = l.w * 0.5 + 130;
    if (d < reach) { const w = (reach - d) / reach * 5; fx += (ox / d) * w; fy += (oy / d) * w; if (d < l.w * 0.5 + 40 && l.t > l.warn - 0.25) danger++; }
    if (l.pendulum) {                          // swinging beam: back out of its reach
      const rx = p.x - l.x, ry = p.y - l.y, rd = Math.hypot(rx, ry) || 1;
      if (rd < l.len + 90) { fx += (rx / rd) * 4; fy += (ry / rd) * 4; }
    }
  }
  // stay off the walls, drift toward loot when it is quiet
  fx -= Math.pow(p.x / ARENA.hw, 3) * 3; fy -= Math.pow(p.y / ARENA.hh, 3) * 3;
  if (g.ringArena) {
    const dx = g.ringArena.x - p.x, dy = g.ringArena.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (d > g.ringArena.r - 160) { fx += (dx / d) * 5; fy += (dy / d) * 5; }
  }
  if (g.dark && !g.dark.hz && Math.hypot(g.dark.x - p.x, g.dark.y - p.y) > g.dark.r * 0.55) {   // Eclipse: stay in the wandering light
    const dx = g.dark.x - p.x, dy = g.dark.y - p.y, d = Math.hypot(dx, dy) || 1, k = d / g.dark.r;
    fx += (dx / d) * 6 * k; fy += (dy / d) * 6 * k;
  }
  if (crowd < 3) {
    let best = null, bd = 700 * 700;
    for (const k of g.pickups) {
      const d = (k.x - p.x) ** 2 + (k.y - p.y) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    if (best) { const d = Math.sqrt(bd) || 1; fx += ((best.x - p.x) / d) * 0.9; fy += ((best.y - p.y) / d) * 0.9; }
    else if (near && nd > 420) { fx += ((near.x - p.x) / nd) * 0.6; fy += ((near.y - p.y) / nd) * 0.6; }
  }
  // gentle circling so the bot never stands still
  fx += Math.cos(g.time * 0.7) * 0.25; fy += Math.sin(g.time * 0.9) * 0.25;
  if (g.gates && g.gates[0].t > 2) {          // route choice: fly into the nearer warp gate
    let gt = g.gates[0];
    for (const o of g.gates) if (Math.hypot(o.x - p.x, o.y - p.y) < Math.hypot(gt.x - p.x, gt.y - p.y)) gt = o;
    const dx = gt.x - p.x, dy = gt.y - p.y, d = Math.hypot(dx, dy) || 1;
    fx += (dx / d) * 8; fy += (dy / d) * 8;
  }
  const hz = g.hz;
  if (hz && hz.prisms) for (const pr of hz.prisms) {
    const dx = p.x - pr.x, dy = p.y - pr.y, d = Math.hypot(dx, dy) || 1;
    if (d < 110) { fx += (dx / d) * 1.5; fy += (dy / d) * 1.5; }
  }
  if (hz && hz.rifts) for (const rf of hz.rifts) {
    const dx = p.x - rf.x, dy = p.y - rf.y, d = Math.hypot(dx, dy) || 1;
    if (d < rf.R) { fx += (dx / d) * 3 * (1 - d / rf.R) + (dx / d) * (d < 140 ? 3 : 0); fy += (dy / d) * 3 * (1 - d / rf.R) + (dy / d) * (d < 140 ? 3 : 0); }
  }
  if (hz && hz.fx) { fx -= hz.fx / 160; fy -= hz.fy / 160; }   // lean into the current
  if (hz && hz.waves) for (const w of hz.waves) {                // outrun a fire wave rolling toward you
    const dx = p.x - w.x, dy = p.y - w.y, d = Math.hypot(dx, dy) || 1;
    if (d > w.r && d - w.r < 90) { fx += (dx / d) * 2.5; fy += (dy / d) * 2.5; }
  }
  if (hz && hz.debris) for (const d of hz.debris) {              // dodge debris like bullets
    const dx = p.x - d.x, dy = p.y - d.y, dd = Math.hypot(dx, dy) || 1;
    if (dd < 150) {
      const w = (150 - dd) / 150, s = Math.sign(d.vx * dy - d.vy * dx) || 1, l = Math.hypot(d.vx, d.vy) || 1;
      fx += (-d.vy / l) * s * w * 2.6 + (dx / dd) * w; fy += (d.vx / l) * s * w * 2.6 + (dy / dd) * w;
      if (dd < 60) danger++;
    }
  }
  if (hz && hz.balls) for (const b of hz.balls) {                // keep clear of ball lightning
    const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1;
    if (d < b.R + 60) { const k = 2 + 4 * b.charge; fx += (dx / d) * k; fy += (dy / d) * k; }
  }
  if (hz && hz.prisms) for (const pr of hz.prisms) if (pr.over > 0) {   // a prism about to overcharge
    const dx = p.x - pr.x, dy = p.y - pr.y, d = Math.hypot(dx, dy) || 1;
    if (d < 380) { fx += (dx / d) * 3; fy += (dy / d) * 3; }
  }
  if (hz && hz.pools) for (const w of hz.pools) {                // swim out of a whirlpool before it bursts
    const dx = p.x - w.x, dy = p.y - w.y, d = Math.hypot(dx, dy) || 1;
    if (d < w.r * 1.3) { const k = 1.5 + 2.5 * (w.t / w.dur); fx += (dx / d) * k; fy += (dy / d) * k; }
  }

  const l = Math.hypot(fx, fy);
  const mx = l > 0.05 ? fx / l : 0, my = l > 0.05 ? fy / l : 0;
  const ax = near ? near.x + near.vx * 0.12 : p.x + Math.cos(g.time) * 200;
  const ay = near ? near.y + near.vy * 0.12 : p.y + Math.sin(g.time) * 200;
  return {
    mx, my, ax, ay,
    fire: !!near && nd < 900,
    dash: danger > 0 && p.dashCharges > 0 && p.invuln <= 0,
    bomb: g.bomb >= 1 && (crowd >= 10 || danger >= 3 || (p.hp <= 2 && crowd >= 4)),
  };
}

/** Pick an upgrade: fusions first, then whatever advances an owned pair. */
export function botChoose(g) {
  const L = g.levels;
  let best = 0, score = -1;
  g.choices.forEach((c, i) => {
    let s = g.rng.next();
    if (c.kind === 'fusion') s += 100;
    else if (c.kind === 'skill') {
      const lv = L[c.id] || 0;
      if (lv > 0) s += 4 + lv;
      const used = usedSkills(g.fusions);
      let best = 0;
      for (const f of RECIPES_OF[c.id] || []) {
        const other = otherOf(f, c.id), ol = L[other] || 0;
        if (g.fusions[f.id] || used.has(other) || !ol) continue;
        best = Math.max(best, 3 + ol + (ol >= SKILL_BY_ID[other].max ? 5 : 0));
      }
      s += best;
      if (c.id === 'hp' && g.player.hp <= 2) s += 6;
    }
    if (s > score) { score = s; best = i; }
  });
  return best;
}
