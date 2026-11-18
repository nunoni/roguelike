// Support enemies that change what you should shoot first:
//   Chaperone - tethers nearby enemies and makes them untouchable and faster.
//   Siren     - sings in pulses that drag you toward her; a dash breaks the song.
//   Mourner   - raises ghost copies of enemies that died nearby.

import { COL } from '../config.js';
import { clamp, damp } from '../core/math.js';
import { DEFS, spawnEnemy, steer } from './enemies.js';

const LINK_R = 380;
const toward = (g, e) => Math.atan2(g.player.y - e.y, g.player.x - e.x);

/** Keep a preferred band of distance from the player, circling inside it. */
function keepBand(g, e, near, far, speed, dt) {
  const p = g.player, d = Math.hypot(p.x - e.x, p.y - e.y), a = toward(g, e);
  if (!e.dir) e.dir = g.rng.sign();
  let ma = a + (Math.PI / 2) * e.dir;
  if (d > far) ma = a; else if (d < near) ma = a + Math.PI;
  steer(e, e.x + Math.cos(ma) * 100, e.y + Math.sin(ma) * 100, speed, 3, dt);
  return d;
}

// ------------------------------------------------------------------ Chaperone
function aiChaperone(g, e, dt) {
  // hang back behind its friends, away from you
  let cx = 0, cy = 0, n = 0;
  for (const o of g.enemies) {
    if (o === e || o.dead || o.boss || o.def.loot || o.def.hazard) continue;
    if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 > 600 * 600) continue;
    cx += o.x; cy += o.y; n++;
  }
  const d = keepBand(g, e, 430, 640, e.speed, dt);
  if (n && d > 380) {                                // drift toward the group it protects
    cx /= n; cy /= n;
    e.vx = damp(e.vx, e.vx + (cx - e.x) * 0.4, 2, dt);
    e.vy = damp(e.vy, e.vy + (cy - e.y) * 0.4, 2, dt);
  }
  e.rot += dt * 1.2;
  e.linkT -= dt;
  if (e.linkT <= 0) {
    e.linkT = 0.4;
    e.links = e.links.filter((o) => !o.dead && !(o.charm > 0) && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < LINK_R * LINK_R);
    if (e.links.length < 4) {
      const cands = g.enemies
        .filter((o) => o !== e && !o.dead && o.spawn <= 0 && !o.boss && !o.def.loot && !o.def.hazard && !o.def.untargetable && !o.transfer
          && o.type !== 'chaperone' && !(o.charm > 0) && !(o.guard && !o.guard.dead && o.guard !== e) && !e.links.includes(o)
          && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < LINK_R * LINK_R)
        .sort((u, v) => ((u.x - e.x) ** 2 + (u.y - e.y) ** 2) - ((v.x - e.x) ** 2 + (v.y - e.y) ** 2));
      for (const o of cands) {
        if (e.links.length >= 4) break;
        e.links.push(o);
        g.fx.ring(o.x, o.y, COL.gold, o.r * 2.2, o.r, 0.3, 2);
      }
    }
  }
  for (const o of e.links) { o.guard = e; o.guardT = 0.6; }
}

function chaperoneDeath(g, e) {
  for (const o of e.links) {
    if (o.dead) continue;
    o.guardT = 0; o.guard = null;
    g.fx.lightning(e.x, e.y, o.x, o.y, COL.gold);
    g.fx.burst(o.x, o.y, COL.gold, 8, 220, 0.4, 3);
  }
  g.fx.text(e.x, e.y - e.r - 18, 'UNGUARDED', COL.gold, 12, 0.8);
}

// ------------------------------------------------------------------ Siren
function aiSiren(g, e, dt) {
  const p = g.player;
  e.timer -= dt;
  e.rot += dt * (e.state === 1 ? 3 : 0.8);
  if (e.state === 2) {                               // dazed after you dashed through her song
    e.vx = damp(e.vx, 0, 5, dt); e.vy = damp(e.vy, 0, 5, dt);
    if (e.timer <= 0) { e.state = 0; e.timer = 2.2; }
    return;
  }
  const d = keepBand(g, e, 330, 520, e.speed, dt);
  if (e.state === 0) {
    if (e.timer <= 0 && d < 800) { e.state = 1; e.timer = 2.6; g.audio.play('charge'); }
  } else {                                           // singing: a slow, steady pull toward her
    e.vx = damp(e.vx, 0, 4, dt); e.vy = damp(e.vy, 0, 4, dt);
    if (p.dashT > 0 && d < 900) {                    // a dash breaks the spell
      e.state = 2; e.timer = 1.4;
      g.fx.text(e.x, e.y - e.r - 16, 'BROKEN', COL.pink, 12, 0.7);
      g.fx.ring(e.x, e.y, COL.pink, e.r, e.r * 3, 0.3, 3);
      return;
    }
    if (d < 900 && !p.dead) {
      const f = 175 * clamp(1.2 - d / 900, 0.4, 1);
      p.pullX += ((e.x - p.x) / (d || 1)) * f; p.pullY += ((e.y - p.y) / (d || 1)) * f;
    }
    e.noteT = (e.noteT || 0) - dt;
    if (e.noteT <= 0) { e.noteT = 0.45; g.fx.ring(e.x, e.y, COL.rose, e.r, Math.min(d, 900), 0.6, 2); }
    if (e.timer <= 0) { e.state = 0; e.timer = g.rng.range(2.8, 3.8); }
  }
}

// ------------------------------------------------------------------ Mourner
const RAISABLE = new Set(['drifter', 'lancer', 'spitter', 'splitter', 'bomber', 'warden', 'pinwheel', 'phantom', 'ray', 'leech', 'siren']);

/** Remember recent deaths so a Mourner can call them back. */
export function noteGrave(g, e) {
  if (!RAISABLE.has(e.type) || e.ghost) return;
  if (!g.enemies.some((o) => o.type === 'mourner' && !o.dead)) return;
  g.graves.push({ x: e.x, y: e.y, type: e.type, t: g.time });
  if (g.graves.length > 30) g.graves.shift();
}

function aiMourner(g, e, dt) {
  keepBand(g, e, 380, 560, e.speed, dt);
  e.rot += dt * 0.7;
  e.timer -= dt;
  g.graves = g.graves.filter((gr) => g.time - gr.t < 9);
  if (e.raise) {                                     // channeling: a beam into the grave
    e.raise.t += dt;
    if (e.raise.t >= 0.8) {
      const gr = e.raise;
      e.raise = null;
      const o = spawnEnemy(g, gr.type, gr.x, gr.y, { spawn: 0.3 });
      o.ghost = true; o.xp = 0;
      o.hp = o.maxHp = o.maxHp * 0.6;
      g.fx.burst(gr.x, gr.y, COL.ghost, 18, 260, 0.6, 4);
      g.audio.play('enemyBurst');
    }
    return;
  }
  if (e.timer <= 0) {
    e.timer = 3.2;
    let best = null, bd = 520 * 520;
    for (const gr of g.graves) {
      const dd = (gr.x - e.x) ** 2 + (gr.y - e.y) ** 2;
      if (dd < bd) { bd = dd; best = gr; }
    }
    if (best && g.enemies.length < 260) {
      g.graves.splice(g.graves.indexOf(best), 1);
      e.raise = { ...best, t: 0 };
      g.audio.play('telegraph');
    }
  }
}

// ------------------------------------------------------------------ registration
Object.assign(DEFS, {
  chaperone: {
    hp: 120, speed: 125, r: 20, xp: 12, threat: 6, col: 'gold', ai: aiChaperone, maxAlive: 2, pointer: true,
    init(g, e) { e.links = []; e.linkT = 0.5; },
    onDeath: chaperoneDeath,
  },
  siren: { hp: 85, speed: 120, r: 18, xp: 9, threat: 5, col: 'rose', ai: aiSiren, maxAlive: 2, init(g, e) { e.timer = g.rng.range(1.5, 3); } },
  mourner: { hp: 110, speed: 95, r: 20, xp: 11, threat: 6, col: 'ghost', ai: aiMourner, maxAlive: 2, init(g, e) { e.raise = null; e.timer = 2; } },
});
