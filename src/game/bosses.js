// Sector bosses. Each registers itself into the shared enemy DEFS table.

import { ARENA, COL } from '../config.js';
import { TAU, clamp, damp, turnToward } from '../core/math.js';
import { DEFS, spawnEnemy, steer, makeSegments, followChain } from './enemies.js';

const toPlayer = (g, e) => Math.atan2(g.player.y - e.y, g.player.x - e.x);
const hpFrac = (e) => e.hp / e.maxHp;

function summon(g, e, types, n, dist = 140) {
  if (g.enemies.length > 260) return;
  for (let i = 0; i < n; i++) {
    const a = g.rng.angle();
    spawnEnemy(g, g.rng.pick(types), e.x + Math.cos(a) * dist, e.y + Math.sin(a) * dist, { spawn: 0.6 });
  }
}

// ------------------------------------------------------------------ The Monolith
function aiMonolith(g, e, dt) {
  const p = g.player;
  const rage = hpFrac(e) < 0.5;
  steer(e, p.x, p.y, rage ? 85 : 55, 1.5, dt);
  e.rot += dt * (rage ? 0.5 : 0.3);

  // orbiting shield plates soak up hearts and regrow
  e.plates = e.plates.filter((s) => !s.dead);
  if (e.plates.length < 4) {
    e.plateT -= dt;
    if (e.plateT <= 0) {
      e.plateT = 8;
      const s = spawnEnemy(g, 'plate', e.x, e.y, { spawn: 0.4, hpScale: g.waves.hpScale });
      s.owner = e;
      s.oa = g.rng.angle();
      e.plates.push(s);
    }
  }
  const spin = e.t * 0.9;
  e.plates.forEach((s, i) => {
    const a = spin + (i / 4) * TAU;
    s.x = e.x + Math.cos(a) * 150; s.y = e.y + Math.sin(a) * 150;
    s.rot = a;
  });

  e.timer -= dt;
  if (e.state === 0) {
    if (e.timer <= 0) {
      e.atk = (e.atk + 1) % 3;
      if (e.atk === 0) { e.state = 1; e.count = rage ? 5 : 3; e.timer = 0.3; }
      else if (e.atk === 1) {
        const n = rage ? 4 : 3, a0 = g.rng.angle(), dir = g.rng.sign();
        for (let i = 0; i < n; i++) g.addLaser({ x: e.x, y: e.y, ang: a0 + (i / n) * TAU, len: 1300, w: 26, warn: 1.1, dur: 3.2, owner: e, spin: dir * (rage ? 0.55 : 0.42) });
        g.audio.play('charge');
        e.timer = 5;
      } else {
        summon(g, e, rage ? ['drifter', 'lancer', 'spitter'] : ['drifter', 'lancer'], rage ? 6 : 4, 190);
        e.timer = 2.4;
      }
    }
  } else if (e.timer <= 0) {       // radial burst volleys
    const n = rage ? 22 : 16;
    g.ringBullets(e.x, e.y, n, 260, e.rot + e.count * 0.19);
    g.fx.ring(e.x, e.y, COL.violet, e.r, e.r * 1.8, 0.3, 4);
    g.audio.play('enemyBurst');
    e.count--;
    e.timer = 0.5;
    if (e.count <= 0) { e.state = 0; e.timer = rage ? 1.3 : 2; }
  }
}

// ------------------------------------------------------------------ Binary
function aiBinary(g, e, dt) {
  const p = g.player, c = e.ctl;
  const twin = e.twin && !e.twin.dead ? e.twin : null;
  if (twin) {
    if (c.frame !== g.frame) {           // shared orbit, advanced once per frame
      c.frame = g.frame;
      c.t += dt;
      c.ang += dt * 0.85;
      c.rad = 250 + Math.sin(c.t * 0.5) * 110;
      const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy) || 1;
      if (d > 260) { c.x += (dx / d) * 70 * dt; c.y += (dy / d) * 70 * dt; }
      if (!c.beam || c.beam.dead) c.beam = g.addLaser({ x: 0, y: 0, ang: 0, len: 10, w: 18, warn: 2.2, dur: 1, perm: true, owner: e });
      c.beam.free = true;
    }
    const a = c.ang + e.idx * Math.PI;
    e.x = c.x + Math.cos(a) * c.rad; e.y = c.y + Math.sin(a) * c.rad;
    e.vx = e.vy = 0;
    if (e.idx === 0 && c.beam) {         // tether between the stars is deadly
      c.beam.owner = e;
      c.beam.x = e.x; c.beam.y = e.y;
      c.beam.ang = Math.atan2(twin.y - e.y, twin.x - e.x);
      c.beam.len = Math.hypot(twin.x - e.x, twin.y - e.y);
    }
    e.rot += dt * 1.5;
    e.timer -= dt;
    if (e.timer <= 0) {
      if (e.idx === 0) {                 // aimed fan
        const a0 = toPlayer(g, e);
        for (let i = -2; i <= 2; i++) g.fireBullet(e.x, e.y, a0 + i * 0.16, 360);
        e.timer = 1.5;
      } else {                           // spiral
        e.spiral = (e.spiral || 0) + 0.42;
        for (let i = 0; i < 4; i++) g.fireBullet(e.x, e.y, e.spiral + (i / 4) * TAU, 240);
        e.timer = 0.26;
      }
      g.audio.play('enemyShot');
    }
  } else {
    // the survivor goes nova
    if (!e.enraged) {
      e.enraged = true;
      e.timer = 1.2; e.state = 0;
      if (c.beam) c.beam.dead = true;
      g.fx.shock(e.x, e.y, 1.5, 900, 0.8);
      g.fx.burst(e.x, e.y, COL.white, 60, 700, 0.9, 6);
      g.ui.banner('ENRAGED', '', 'warn');
      g.audio.play('bossRoar');
    }
    e.rot += dt * 4;
    e.timer -= dt;
    if (e.state === 0) {                 // chase, spraying rings
      steer(e, p.x, p.y, 230, 2, dt);
      e.shotT = (e.shotT || 0) - dt;
      if (e.shotT <= 0) { e.shotT = 1.1; g.ringBullets(e.x, e.y, 18, 270, e.rot); g.audio.play('enemyBurst'); }
      if (e.timer <= 0) { e.state = 1; e.timer = 0.75; e.da = toPlayer(g, e); g.audio.play('telegraph'); }
    } else if (e.state === 1) {          // wind up
      e.vx = damp(e.vx, 0, 8, dt); e.vy = damp(e.vy, 0, 8, dt);
      if (e.timer > 0.25) e.da = toPlayer(g, e);
      if (e.timer <= 0) { e.state = 2; e.timer = 0.5; g.audio.play('lunge'); }
    } else {                             // dash
      e.vx = Math.cos(e.da) * 1150; e.vy = Math.sin(e.da) * 1150;
      g.fx.mote(e.x, e.y, COL.amber, 1, 8, 0.4, 80);
      if (e.timer <= 0) { e.state = 0; e.timer = 2.6; g.ringBullets(e.x, e.y, 14, 220, 0); }
    }
    e.x += e.vx * dt; e.y += e.vy * dt;
  }
}

// ------------------------------------------------------------------ Ouroboros
function aiOuroboros(g, e, dt) {
  const p = g.player;
  const rage = hpFrac(e) < 0.4;
  e.timer -= dt;

  // shed the tail as health drops; each lost segment bursts into bullets
  const alive = e.segs.filter((s) => !s.dead);
  const want = Math.max(3, Math.ceil(16 * (0.25 + 0.75 * hpFrac(e))));
  if (alive.length > want) {
    const tail = alive[alive.length - 1];
    g.ringBullets(tail.x, tail.y, 10, 200, g.rng.angle());
    g.killEnemy(tail, true);
    g.audio.play('killBig');
  }

  let speed = rage ? 400 : 330, turn = 1.9;
  if (e.state === 0) {                   // circle the player, laying drifting mines
    e.ca += dt * (rage ? 0.75 : 0.6) * e.cdir;
    const tx = clamp(p.x + Math.cos(e.ca) * 520, -ARENA.hw + 120, ARENA.hw - 120);
    const ty = clamp(p.y + Math.sin(e.ca) * 520, -ARENA.hh + 120, ARENA.hh - 120);
    e.rot = turnToward(e.rot, Math.atan2(ty - e.y, tx - e.x), turn * dt);
    e.mineT -= dt;
    if (e.mineT <= 0) {
      e.mineT = rage ? 0.22 : 0.3;
      const tail = alive[alive.length - 1] || e;
      g.fireBullet(tail.x, tail.y, g.rng.angle(), 12, { life: rage ? 6 : 5, r: 9, kind: 'mine' });
    }
    if (rage) {
      e.shotT -= dt;
      if (e.shotT <= 0) { e.shotT = 1.3; for (let i = -1; i <= 1; i++) g.fireBullet(e.x, e.y, toPlayer(g, e) + i * 0.22, 340); g.audio.play('enemyShot'); }
    }
    if (e.timer <= 0) { e.state = 1; e.timer = 0.95; g.audio.play('charge'); }
  } else if (e.state === 1) {            // line up a charge
    speed = 130;
    e.rot = turnToward(e.rot, toPlayer(g, e), 4.5 * dt);
    if (e.timer <= 0) { e.state = 2; e.timer = rage ? 1.25 : 1.05; g.audio.play('bossRoar'); g.fx.shake(8); }
  } else {                               // charge straight through
    speed = rage ? 1250 : 1080;
    g.fx.mote(e.x, e.y, COL.teal, 1, 8, 0.4, 100);
    if (e.timer <= 0) { e.state = 0; e.timer = rage ? 4 : 5.5; e.cdir = g.rng.sign(); e.ca = Math.atan2(e.y - p.y, e.x - p.x); }
  }
  e.vx = Math.cos(e.rot) * speed; e.vy = Math.sin(e.rot) * speed;
  e.x = clamp(e.x + e.vx * dt, -ARENA.hw + 30, ARENA.hw - 30);
  e.y = clamp(e.y + e.vy * dt, -ARENA.hh + 30, ARENA.hh - 30);
  followChain(e, e.segs, dt);
}

// ------------------------------------------------------------------ The Hollow Heart
function aiHollow(g, e, dt) {
  const p = g.player;
  const f = hpFrac(e);
  const phase = f > 0.66 ? 1 : f > 0.33 ? 2 : 3;
  if (phase !== e.phase) {
    e.phase = phase;
    g.fx.shock(e.x, e.y, 1.8, 1100, 0.9);
    g.fx.burst(e.x, e.y, COL.hot, 70, 800, 1, 7, 1);
    g.fx.shake(14);
    g.audio.play('bossRoar');
    for (const b of g.bullets) b.dead = true;
    if (phase === 3) {
      g.ringArena = { x: clamp(e.x, -700, 700), y: clamp(e.y, -350, 350), r: 1150 };
      g.ui.banner('THE VOID CLOSES IN', '', 'warn');
    }
    e.state = 0; e.timer = 1.4;
  }
  if (g.ringArena) {
    g.ringArena.r = Math.max(540, g.ringArena.r - 26 * dt);
    // keep the fight inside the ring
    const dx = g.ringArena.x - e.x, dy = g.ringArena.y - e.y, d = Math.hypot(dx, dy);
    if (d > g.ringArena.r - 150) { e.x += (dx / d) * 200 * dt; e.y += (dy / d) * 200 * dt; }
  }
  e.pulse = (e.pulse || 0) + dt;
  e.rot = turnToward(e.rot, toPlayer(g, e), 3 * dt);
  e.timer -= dt;
  const fast = phase === 3 ? 0.72 : 1;

  if (e.state !== 4) {
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    if (d > 420) steer(e, p.x, p.y, 110, 2, dt); else { e.vx = damp(e.vx, 0, 2, dt); e.vy = damp(e.vy, 0, 2, dt); }
  }

  switch (e.state) {
    case 0:                              // pick the next attack
      if (e.timer <= 0) {
        const opts = phase === 1 ? [1, 2] : phase === 2 ? [1, 2, 3, 4] : [1, 2, 3, 4, 3];
        let pick = g.rng.pick(opts);
        if (pick === e.last) pick = g.rng.pick(opts);
        e.last = pick;
        e.state = pick;
        e.count = pick === 1 ? 3 : pick === 2 ? 4 : pick === 4 ? (phase === 3 ? 3 : 2) : 0;
        e.timer = pick === 3 ? 4.2 : 0.4;
        e.shotT = 0;
        if (pick === 4) { e.sub = 0; e.timer = 0.7; g.audio.play('telegraph'); }
        if (phase === 3 && g.rng.chance(0.4)) summon(g, e, ['phantom', 'drifter'], 2, 260);
      }
      break;
    case 1:                              // volleys of seeking broken hearts
      if (e.timer <= 0) {
        const n = phase === 1 ? 5 : 7, a0 = toPlayer(g, e);
        for (let i = 0; i < n; i++) g.fireBullet(e.x, e.y, a0 + (i - (n - 1) / 2) * 0.42, 250, { kind: 'bheart', turn: 1.0, life: 4.2, r: 10 });
        g.audio.play('enemyBurst');
        e.count--;
        e.timer = 1.0 * fast;
        if (e.count <= 0) { e.state = 0; e.timer = 1.5 * fast; }
      }
      break;
    case 2:                              // heartbeat rings with a gap to slip through
      if (e.timer <= 0) {
        const n = 30, gap = g.rng.angle(), w = phase === 1 ? 0.6 : 0.46;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          let da = (a - gap) % TAU; if (da > Math.PI) da -= TAU; else if (da < -Math.PI) da += TAU;
          if (Math.abs(da) < w) continue;
          g.fireBullet(e.x, e.y, a, 215);
        }
        g.fx.ring(e.x, e.y, COL.hot, e.r, e.r * 2.4, 0.4, 5);
        g.fx.shock(e.x, e.y, 0.4, 500, 0.4);
        e.pulse = 0;
        g.audio.play('bossBeat');
        e.count--;
        e.timer = 0.72 * fast;
        if (e.count <= 0) { e.state = 0; e.timer = 1.6 * fast; }
      }
      break;
    case 3: {                            // gravity pull + spiral arms
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
      const pull = phase === 3 ? 190 : 150;
      p.pullX += (dx / d) * pull; p.pullY += (dy / d) * pull;
      g.fx.mote(p.x + (dx / d) * 60, p.y + (dy / d) * 60, COL.violet, 0.5, 4, 0.4, 40);
      e.shotT -= dt;
      if (e.shotT <= 0) {
        e.shotT = 0.13;
        e.spiral = (e.spiral || 0) + 0.23;
        const arms = phase === 3 ? 3 : 2;
        for (let i = 0; i < arms; i++) g.fireBullet(e.x, e.y, e.spiral + (i / arms) * TAU, 235);
        if (g.frame % 3 === 0) g.audio.play('enemyShot');
      }
      if (e.timer <= 0) { e.state = 0; e.timer = 1.5 * fast; }
      break;
    }
    case 4:                              // telegraphed dashes
      if (e.sub === 0) {
        e.vx = damp(e.vx, 0, 8, dt); e.vy = damp(e.vy, 0, 8, dt);
        if (e.timer > 0.22) e.da = toPlayer(g, e);
        e.rot = e.da;
        if (e.timer <= 0) { e.sub = 1; e.timer = 0.48; g.audio.play('lunge'); }
      } else {
        e.vx = Math.cos(e.da) * 1200; e.vy = Math.sin(e.da) * 1200;
        g.fx.mote(e.x, e.y, COL.hot, 1, 9, 0.4, 100, 1);
        if (e.timer <= 0) {
          g.ringBullets(e.x, e.y, 12, 230, g.rng.angle());
          e.count--;
          if (e.count > 0) { e.sub = 0; e.timer = 0.6; g.audio.play('telegraph'); }
          else { e.state = 0; e.timer = 1.4 * fast; }
        }
      }
      break;
  }
  e.x = clamp(e.x + e.vx * dt, -ARENA.hw + e.r, ARENA.hw - e.r);
  e.y = clamp(e.y + e.vy * dt, -ARENA.hh + e.r, ARENA.hh - e.r);
}

// ------------------------------------------------------------------ registration
const bossBase = { boss: true, heavy: true, noCharm: true, noSep: true, noElite: true, threat: 30 };

Object.assign(DEFS, {
  monolith: {
    ...bossBase, name: 'THE MONOLITH', hp: 1900, speed: 60, r: 78, xp: 120, col: 'violet', score: 4000, ai: aiMonolith,
    init(g, e) { e.plates = []; e.plateT = 0.5; e.atk = -1; e.timer = 2.2; },
    onDeath(g, e) { for (const s of e.plates) if (!s.dead) g.killEnemy(s, true); },
  },
  plate: { hp: 70, speed: 0, r: 26, xp: 0, threat: 0, col: 'blue', ai() {}, noMove: true, noSep: true, noCharm: true, heavy: true, noElite: true, free: true, untargetable: false, score: 20 },
  binary: {
    ...bossBase, name: 'BINARY', hp: 3600, speed: 0, r: 52, xp: 90, col: 'amber', score: 4000, ai: aiBinary, noMove: true,
    init(g, e, o) {
      e.idx = o.idx || 0;
      e.ctl = o.ctl || { x: e.x, y: e.y, ang: 0, rad: 250, t: 0, frame: -1, beam: null };
      e.timer = 2.5 + e.idx * 0.6;
    },
  },
  ouroboros: {
    ...bossBase, name: 'OUROBOROS', hp: 13000, speed: 330, r: 44, xp: 220, col: 'teal', score: 6000, ai: aiOuroboros, noMove: true,
    init(g, e) {
      e.ca = 0; e.cdir = 1; e.mineT = 1; e.shotT = 1; e.timer = 5;
      makeSegments(g, e, 16, 'ouroseg');
    },
    onDeath(g, e) {
      e.segs.forEach((s, i) => g.delayed.push({ t: 0.06 * (i + 1), fn: () => { if (!s.dead) g.killEnemy(s, true); } }));
    },
  },
  ouroseg: { hp: 1e9, speed: 0, r: 32, xp: 0, threat: 0, col: 'teal', ai() {}, noMove: true, noSep: true, untargetable: true, statusImmune: true, noCharm: true, heavy: true, noElite: true },
  hollow: {
    ...bossBase, name: 'THE HOLLOW HEART', hp: 22000, speed: 110, r: 70, xp: 400, col: 'hot', score: 12000, ai: aiHollow, noMove: true,
    init(g, e) { e.phase = 1; e.timer = 2.5; e.last = 0; },
  },
});

export const BOSS_ORDER = ['monolith', 'binary', 'ouroboros', 'hollow'];

/** Spawn the boss for a given boss index (0..3, cycling in endless). */
export function spawnBoss(g, index) {
  const type = BOSS_ORDER[index % BOSS_ORDER.length];
  const p = g.player;
  const x = clamp(p.x + (p.x > 0 ? -1 : 1) * 470, -ARENA.hw + 260, ARENA.hw - 260);
  const y = clamp(p.y + (p.y > 0 ? -1 : 1) * 120, -ARENA.hh + 260, ARENA.hh - 260);
  g.bossName = DEFS[type].name;
  if (type === 'binary') {
    const a = spawnEnemy(g, 'binary', x, y, { spawn: 2, idx: 0 });
    spawnEnemy(g, 'binary', x, y, { spawn: 2, idx: 1, ctl: a.ctl }).twin = a;
    a.twin = g.enemies[g.enemies.length - 1];
    return a;
  }
  return spawnEnemy(g, type, x, y, { spawn: 2 });
}
