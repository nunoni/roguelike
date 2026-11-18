// The Heartless: enemy definitions, AI, and the shared per-frame update.

import { ARENA, COL } from '../config.js';
import { TAU, clamp, damp, turnToward } from '../core/math.js';
import { updateStatus } from './status.js';

const QUIET = { quiet: true };

// ------------------------------------------------------------------ helpers
export function steer(e, tx, ty, speed, accel, dt) {
  const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy) || 1;
  e.vx = damp(e.vx, (dx / d) * speed, accel, dt);
  e.vy = damp(e.vy, (dy / d) * speed, accel, dt);
  return d;
}
function brake(e, k, dt) {
  e.vx = damp(e.vx, 0, k, dt);
  e.vy = damp(e.vy, 0, k, dt);
}
const toPlayer = (g, e) => Math.atan2(g.player.y - e.y, g.player.x - e.x);
const distPlayer = (g, e) => Math.hypot(g.player.x - e.x, g.player.y - e.y);

export function spawnEnemy(g, type, x, y, o = {}) {
  const def = DEFS[type];
  const W = g.waves;
  const hs = o.hpScale ?? (def.boss ? W.bossScale : W.hpScale);
  const e = {
    id: ++g.eid, type, def, x, y, vx: 0, vy: 0, r: def.r,
    hp: def.hp * hs, maxHp: def.hp * hs, speed: def.speed * (def.boss ? 1 : W.spdScale), xp: def.xp,
    rot: g.rng.angle(), t: 0, spawn: o.spawn ?? 0.7, state: 0, timer: g.rng.range(0.4, 1.4), seed: g.rng.next(),
    flash: 0, burn: 0, burnT: 0, burnAcc: 0, burnStacks: 0, envy: 0, envyT: 0, tie: null, tieT: 0, wireT: 0, chill: 0, frozen: 0, freezeImm: 0, charm: 0, ctgt: null, ctgtT: 0,
    faded: false, dead: false, boss: !!def.boss, elite: null, hitT: 0,
  };
  if (o.elite && !def.boss && !def.noElite) {
    e.elite = o.elite;
    e.hp = e.maxHp = e.hp * (o.elite === 'armored' ? 4 : 2.2);
    if (o.elite === 'swift') e.speed *= 1.5;
    e.r *= 1.15;
    e.xp *= 4;
  }
  if (def.init) def.init(g, e, o);
  g.enemies.push(e);
  g.stat.seen[type] = (g.stat.seen[type] || 0) + 1;
  if (e.spawn > 0) g.fx.ring(x, y, COL[def.col] || COL.cyan, e.r * 3, e.r * 0.5, e.spawn, 2);
  return e;
}

// ------------------------------------------------------------------ AI
function aiDrifter(g, e, dt) {
  steer(e, g.player.x, g.player.y, e.speed, 3, dt);
  e.rot = Math.atan2(e.vy, e.vx);
}

function aiMote(g, e, dt) {
  const p = g.player, a = toPlayer(g, e) + Math.PI / 2;
  const w = Math.sin(e.t * 5 + e.seed * 40) * 90;
  steer(e, p.x + Math.cos(a) * w, p.y + Math.sin(a) * w, e.speed, 5, dt);
  e.rot += dt * 6;
}

function aiLancer(g, e, dt) {
  const p = g.player;
  e.timer -= dt;
  if (e.state === 0) {                       // close in
    const d = steer(e, p.x, p.y, e.speed, 3, dt);
    e.rot = turnToward(e.rot, toPlayer(g, e), 6 * dt);
    if (d < 430 && e.timer <= 0) { e.state = 1; e.timer = 0.7; g.audio.play('telegraph'); }
  } else if (e.state === 1) {                // aim (telegraph)
    brake(e, 8, dt);
    if (e.timer > 0.2) e.rot = turnToward(e.rot, toPlayer(g, e), 5 * dt);
    if (e.timer <= 0) { e.state = 2; e.timer = 0.42; g.audio.play('lunge'); }
  } else if (e.state === 2) {                // dash
    e.vx = Math.cos(e.rot) * 1250; e.vy = Math.sin(e.rot) * 1250;
    g.fx.mote(e.x, e.y, COL.orange, 0.8, 5, 0.3, 60);
    if (e.timer <= 0) { e.state = 3; e.timer = 0.8; }
  } else {                                   // recover
    brake(e, 6, dt);
    if (e.timer <= 0) { e.state = 0; e.timer = g.rng.range(0.3, 1); }
  }
}

function aiSpitter(g, e, dt) {
  const p = g.player, d = distPlayer(g, e), a = toPlayer(g, e);
  if (!e.dir) e.dir = g.rng.sign();
  let ma = a + (Math.PI / 2) * e.dir;
  if (d > 520) ma = a; else if (d < 340) ma = a + Math.PI;
  steer(e, e.x + Math.cos(ma) * 100, e.y + Math.sin(ma) * 100, e.speed, 3, dt);
  e.rot = turnToward(e.rot, a, 5 * dt);
  e.timer -= dt;
  if (e.timer <= 0 && d < 760) {
    e.timer = g.wave >= 9 ? 2.7 : 2.2;
    const n = g.wave >= 9 ? 3 : 1;
    for (let i = 0; i < n; i++) g.fireBullet(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, a + (i - (n - 1) / 2) * 0.2, 390);
    g.audio.play('enemyShot');
    if (g.rng.chance(0.3)) e.dir = -e.dir;
  }
}

const SPLIT = { r: [30, 21, 14], hp: [1, 0.42, 0.18], spd: [1, 1.35, 1.75], xp: [3, 2, 1] };
function aiSplitter(g, e, dt) {
  steer(e, g.player.x, g.player.y, e.speed, 2.5, dt);
  e.rot += dt * 0.8;
}

function aiBomber(g, e, dt) {
  const p = g.player;
  if (e.state === 0) {
    const d = steer(e, p.x, p.y, e.speed, 4, dt);
    e.rot = Math.atan2(e.vy, e.vx);
    if (d < 115) {
      e.state = 1;
      g.zones.push({ kind: 'blast', x: e.x, y: e.y, r: 150, t: 0, dur: 0.6, tick: 0, src: e });
      g.audio.play('telegraph');
    }
  } else {
    brake(e, 10, dt);
    e.rot += dt * 14;
  }
}

function aiWarden(g, e, dt) {
  steer(e, g.player.x, g.player.y, e.speed, 2, dt);
  e.rot = turnToward(e.rot, toPlayer(g, e), 0.9 * dt);
  if (e.shieldHit > 0) e.shieldHit -= dt * 5;
  if (e.shieldHp === undefined) e.shieldHp = 8;
  if (e.shieldHp <= 0) {                     // broken: recharge, then snap back up
    e.shieldDown = (e.shieldDown || 0) + dt;
    if (e.shieldDown >= 4) { e.shieldHp = 8; e.shieldDown = 0; g.fx.ring(e.x, e.y, COL.blue, 20, 52, 0.3, 3); }
  }
}

function aiPinwheel(g, e, dt) {
  const p = g.player, d = distPlayer(g, e);
  if (d > 520) steer(e, p.x, p.y, e.speed, 2, dt); else brake(e, 2, dt);
  e.rot += dt * 1.15;
  e.timer -= dt;
  if (e.state === 0) {
    if (e.timer <= 0) { e.state = 1; e.timer = 2.0; e.shotT = 0; }
  } else {
    e.shotT -= dt;
    if (e.shotT <= 0 && d < 1000) {
      e.shotT += 0.45;
      for (let i = 0; i < 3; i++) {
        const a = e.rot + (i / 3) * TAU;
        g.fireBullet(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, a, 240, { life: 3.2 });
      }
      g.audio.play('enemyShot');
    }
    if (e.timer <= 0) { e.state = 0; e.timer = 3.4; }
  }
}

function aiPhantom(g, e, dt) {
  const p = g.player;
  e.timer -= dt;
  if (e.state === 0) {                       // faded: drift to a flank, cannot be hit
    e.faded = true;
    if (e.pa === undefined) e.pa = g.rng.angle();
    const d = steer(e, p.x + Math.cos(e.pa) * 210, p.y + Math.sin(e.pa) * 210, 430, 4, dt);
    if (d < 40 || e.timer < -2.6) { e.state = 1; e.timer = 0.6; e.faded = false; g.audio.play('telegraph'); }
  } else if (e.state === 1) {                // materialise (telegraph)
    brake(e, 8, dt);
    e.rot = toPlayer(g, e);
    if (e.timer <= 0) { e.state = 2; e.timer = 0.32; e.vx = Math.cos(e.rot) * 950; e.vy = Math.sin(e.rot) * 950; g.audio.play('lunge'); }
  } else if (e.state === 2) {                // strike
    if (e.timer <= 0) { e.state = 3; e.timer = 1.4; }
  } else {                                   // linger, vulnerable
    brake(e, 4, dt);
    if (e.timer <= 0) { e.state = 0; e.timer = 0; e.pa = g.rng.angle(); }
  }
}

function aiRay(g, e, dt) {
  const p = g.player, d = distPlayer(g, e), a = toPlayer(g, e);
  if (!e.dir) e.dir = g.rng.sign();
  e.timer -= dt;
  if (e.state === 0) {
    let ma = a + (Math.PI / 2) * e.dir;
    if (d > 780) ma = a; else if (d < 560) ma = a + Math.PI;
    steer(e, e.x + Math.cos(ma) * 100, e.y + Math.sin(ma) * 100, e.speed, 3, dt);
    e.rot = turnToward(e.rot, a, 4 * dt);
    if (e.timer <= 0 && d < 1100) {
      e.state = 1; e.timer = 2.0;
      e.laser = g.addLaser({ x: e.x, y: e.y, ang: e.rot, len: 1700, w: 20, warn: 1.6, dur: 0.3, owner: e });
      g.audio.play('charge');
    }
  } else {
    brake(e, 6, dt);
    if (e.timer > 1.0) e.rot = turnToward(e.rot, a, 1.8 * dt);   // tracks, then locks
    if (e.laser && !e.laser.dead) {
      e.laser.ang = e.rot;
      if (!e.fired && e.laser.t >= e.laser.warn) { e.fired = true; g.audio.play('laser'); g.fx.shake(5); }
    }
    if (e.timer <= 0) { e.state = 0; e.timer = 4.0; e.fired = false; e.laser = null; }
  }
}

function aiLeech(g, e, dt) {
  const p = g.player, d = distPlayer(g, e), a = toPlayer(g, e);
  if (!e.dir) e.dir = g.rng.sign();
  let ma = a + (Math.PI / 2) * e.dir;
  if (d > 290) ma = a; else if (d < 200) ma = a + Math.PI;
  steer(e, e.x + Math.cos(ma) * 100, e.y + Math.sin(ma) * 100, e.speed, 3, dt);
  e.rot += dt * 2;
  if (d < 380 && !p.dead) {
    e.tether = true;
    p.slowNext = Math.max(p.slowNext, 0.32);
    e.drainT = (e.drainT || 0) + dt;
    if (e.drainT >= 4) {
      e.drainT = 0;
      g.fx.lightning(e.x, e.y, p.x, p.y, COL.violet);
      g.hurtPlayer(1, e.x, e.y);
    }
  } else if (d > 460 || p.dead) {
    e.tether = false;
    e.drainT = 0;
  }
}

function aiHive(g, e, dt) {
  steer(e, g.player.x, g.player.y, e.speed, 1.5, dt);
  e.rot += dt * 0.4;
  e.timer -= dt;
  if (e.timer <= 0) {
    e.timer = 3.6;
    if (g.enemies.length < 300) {
      for (let i = 0; i < 3; i++) {
        const a = g.rng.angle();
        spawnEnemy(g, 'mote', e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, { spawn: 0.25 });
      }
      g.fx.ring(e.x, e.y, COL.amber, e.r, e.r * 1.6, 0.3, 3);
    }
  }
}

/** Serpent head: steers by heading with a sinuous wobble. Segments trail behind. */
function aiWyrm(g, e, dt) {
  const want = toPlayer(g, e) + Math.sin(e.t * 2.3) * 0.9;
  e.rot = turnToward(e.rot, want, 2.4 * dt);
  e.vx = Math.cos(e.rot) * e.speed; e.vy = Math.sin(e.rot) * e.speed;
  followChain(e, e.segs, dt);
}

export function makeSegments(g, head, n, type) {
  head.segs = [];
  for (let i = 0; i < n; i++) {
    const s = spawnEnemy(g, type, head.x, head.y, { spawn: head.spawn });
    s.transfer = head;
    s.idx = i;
    head.segs.push(s);
  }
}

export function followChain(head, segs, dt) {
  let lead = head;
  for (const s of segs) {
    if (s.dead) continue;
    const gap = (lead.r + s.r) * 0.8;
    const dx = lead.x - s.x, dy = lead.y - s.y, d = Math.hypot(dx, dy) || 1;
    if (d > gap) { s.x += (dx / d) * (d - gap); s.y += (dy / d) * (d - gap); }
    s.rot = Math.atan2(dy, dx);
    lead = s;
  }
}

/** A charmed enemy turns on its former friends. */
function aiCharmed(g, e, dt) {
  e.ctgtT -= dt;
  if (!e.ctgt || e.ctgt.dead || e.ctgtT <= 0) {
    e.ctgtT = 0.35;
    e.ctgt = null;
    let bd = 520 * 520;
    for (const o of g.grid.query(e.x, e.y, 520, [])) {
      if (o === e || o.dead || o.spawn > 0 || o.charm > 0 || o.faded || o.def.untargetable) continue;
      const d = (o.x - e.x) ** 2 + (o.y - e.y) ** 2;
      if (d < bd) { bd = d; e.ctgt = o; }
    }
  }
  const t = e.ctgt;
  if (t) {
    const d = steer(e, t.x, t.y, Math.max(e.speed, 170) * 1.25, 5, dt);
    e.rot = Math.atan2(e.vy, e.vx);
    if (d < e.r + t.r + 6) {
      e.hitT -= dt;
      if (e.hitT <= 0) {
        e.hitT = 0.3;
        g.damageEnemy(t, (10 + g.wave * 4) * 0.3 + e.maxHp * 0.03, QUIET);
        g.fx.spray(t.x, t.y, Math.atan2(t.y - e.y, t.x - e.x), 1.4, COL.rose, 3, 220, 0.25, 3);
      }
    }
  } else {
    const p = g.player;
    if (Math.hypot(p.x - e.x, p.y - e.y) > 200) steer(e, p.x, p.y, e.speed, 2, dt); else brake(e, 3, dt);
  }
}

// ------------------------------------------------------------------ definitions
export const DEFS = {
  drifter: { hp: 18, speed: 175, r: 15, xp: 2, threat: 1, col: 'cyan', ai: aiDrifter },
  mote: { hp: 6, speed: 280, r: 8, xp: 1, threat: 0.4, col: 'lime', ai: aiMote, pack: [5, 8] },
  lancer: { hp: 28, speed: 175, r: 16, xp: 3, threat: 2, col: 'orange', ai: aiLancer },
  spitter: { hp: 26, speed: 130, r: 16, xp: 3, threat: 2.5, col: 'violet', ai: aiSpitter },
  splitter: {
    hp: 55, speed: 115, r: 30, xp: 3, threat: 3, col: 'teal', ai: aiSplitter,
    init(g, e, o) {
      const gen = (e.gen = o.gen || 0);
      e.r = SPLIT.r[gen] * (e.elite ? 1.15 : 1);
      e.hp = e.maxHp = e.hp * SPLIT.hp[gen];
      e.speed *= SPLIT.spd[gen];
      e.xp = SPLIT.xp[gen];
    },
    onDeath(g, e) {
      if (e.gen >= 2) return;
      for (const s of [-1, 1]) {
        const a = g.rng.angle();
        const c = spawnEnemy(g, 'splitter', e.x + Math.cos(a) * 10, e.y + Math.sin(a) * 10, { gen: e.gen + 1, spawn: 0.12 });
        c.vx = Math.cos(a) * 320 * s; c.vy = Math.sin(a) * 320 * s;
      }
    },
  },
  bomber: {
    hp: 30, speed: 240, r: 17, xp: 3, threat: 2.5, col: 'red', ai: aiBomber,
    // shot down before it goes off: the blast only hurts other Heartless
    onDeath(g, e) { g.explode(e.x, e.y, 120, 45 * g.waves.hpScale, { col: COL.red }); },
  },
  warden: { hp: 95, speed: 100, r: 22, xp: 5, threat: 4, col: 'blue', ai: aiWarden, shieldArc: { r: 48, half: 0.95 }, maxAlive: 6 },
  pinwheel: { hp: 110, speed: 65, r: 24, xp: 6, threat: 5, col: 'amber', ai: aiPinwheel, maxAlive: 3 },
  phantom: { hp: 60, speed: 300, r: 18, xp: 5, threat: 4, col: 'ghost', ai: aiPhantom, noSep: true },
  ray: { hp: 60, speed: 125, r: 17, xp: 6, threat: 5, col: 'lime', ai: aiRay, maxAlive: 3 },
  leech: { hp: 70, speed: 165, r: 18, xp: 5, threat: 4, col: 'violet', ai: aiLeech, maxAlive: 4 },
  hive: {
    hp: 240, speed: 55, r: 42, xp: 10, threat: 8, col: 'amber', ai: aiHive, heavy: true, maxAlive: 3,
    onDeath(g, e) {
      for (let i = 0; i < 7; i++) {
        const a = g.rng.angle();
        const m = spawnEnemy(g, 'mote', e.x + Math.cos(a) * 20, e.y + Math.sin(a) * 20, { spawn: 0.15 });
        m.vx = Math.cos(a) * 300; m.vy = Math.sin(a) * 300;
      }
    },
  },
  wyrm: {
    hp: 260, speed: 215, r: 22, xp: 14, threat: 12, col: 'teal', ai: aiWyrm, maxAlive: 2, noCharm: true, noSep: true, heavy: true, noElite: true,
    init(g, e) { makeSegments(g, e, 8, 'wyrmseg'); },
    onDeath(g, e) {
      e.segs.forEach((s, i) => g.delayed.push({ t: 0.05 * (i + 1), fn: () => { if (!s.dead) { g.killEnemy(s, true); g.audio.play('kill'); } } }));
    },
  },
  wyrmseg: { hp: 1e9, speed: 0, r: 17, xp: 0, threat: 0, col: 'teal', ai() {}, noMove: true, noSep: true, untargetable: true, statusImmune: true, noCharm: true, heavy: true, noElite: true },
};

// ------------------------------------------------------------------ shared update
export function updateEnemies(g, dt) {
  const p = g.player;
  const sep = g._sq || (g._sq = []);
  const hw = ARENA.hw, hh = ARENA.hh;
  g.wardens.length = 0;

  for (let i = 0, n = g.enemies.length; i < n; i++) {
    const e = g.enemies[i];
    if (e.dead) continue;
    if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 7);
    if (e.spawn > 0) { e.spawn -= dt; continue; }
    e.t += dt;
    if (!updateStatus(g, e, dt)) continue;
    if (e.elite === 'regen' && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.03 * dt);

    if (e.frozen > 0) {
      e.frozen -= dt;
      e.vx = e.vy = 0;
      if (e.def.shieldArc && e.shieldHp > 0) g.wardens.push(e);
      continue;
    }
    let edt = dt;
    if (e.chill > 0) {
      edt = dt * (1 - 0.6 * Math.min(1, e.chill));
      e.chill = Math.max(0, e.chill - 0.12 * dt);
    }
    const def = e.def;
    if (e.charm > 0) aiCharmed(g, e, edt); else def.ai(g, e, edt);
    if (e.dead) continue;
    if (!def.noMove) { e.x += e.vx * edt; e.y += e.vy * edt; }

    if (!e.boss && !def.noSep) {
      g.grid.query(e.x, e.y, e.r, sep);
      for (let k = 0; k < sep.length; k++) {
        const o = sep[k];
        if (o === e || o.dead || o.def.noSep || o.boss) continue;
        const dx = e.x - o.x, dy = e.y - o.y, rr = e.r + o.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 === 0) continue;
        const d = Math.sqrt(d2), push = (rr - d) * 0.5 * Math.min(1, dt * 14);
        e.x += (dx / d) * push; e.y += (dy / d) * push;
      }
    }
    if (!def.free) {
      e.x = clamp(e.x, -hw + e.r, hw - e.r);
      e.y = clamp(e.y, -hh + e.r, hh - e.r);
    }
    if (def.shieldArc && !(e.shieldHp <= 0) && !(e.charm > 0)) g.wardens.push(e);

    if (!e.faded && !(e.charm > 0) && def.contact !== false && !p.dead) {
      const dx = p.x - e.x, dy = p.y - e.y, rr = e.r + p.r * 0.75;
      if (dx * dx + dy * dy < rr * rr) g.hurtPlayer(def.boss ? 2 : 1, e.x, e.y);   // bosses hit twice as hard
    }
  }
}
