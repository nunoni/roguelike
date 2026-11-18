// Sector bosses. Each registers itself into the shared enemy DEFS table.

import { ARENA, COL, BPM } from '../config.js';
import { TAU, clamp, damp, turnToward } from '../core/math.js';
import { DEFS, spawnEnemy, steer, makeSegments, followChain } from './enemies.js';

const toPlayer = (g, e) => Math.atan2(g.player.y - e.y, g.player.x - e.x);
const hpFrac = (e) => e.hp / e.maxHp;
const BEAT = 60 / BPM;

function summon(g, e, types, n, dist = 140) {
  if (g.enemies.length > 260) return;
  for (let i = 0; i < n; i++) {
    const a = g.rng.angle();
    spawnEnemy(g, g.rng.pick(types), e.x + Math.cos(a) * dist, e.y + Math.sin(a) * dist, { spawn: 0.6 });
  }
}

/** A telegraphed blast circle where the player is heading. */
function slam(g, r, lead = 0.35, dur = 0.9, spread = 0) {
  const p = g.player, a = g.rng.angle(), d = spread ? g.rng.range(0, spread) : 0;
  g.zones.push({ kind: 'blast', x: p.x + p.vx * lead + Math.cos(a) * d, y: p.y + p.vy * lead + Math.sin(a) * d, r, t: 0, dur, tick: 0 });
  g.audio.play('telegraph');
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
      e.plateT = rage ? 5.5 : 8;
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
      e.atk = (e.atk + 1) % 4;
      if (e.atk === 3) { e.state = 2; e.count = rage ? 5 : 4; e.timer = 0.1; }
      else if (e.atk === 0) { e.state = 1; e.count = rage ? 6 : 4; e.timer = 0.3; }
      else if (e.atk === 1) {
        const n = rage ? 5 : 4, a0 = g.rng.angle(), dir = g.rng.sign();
        for (let i = 0; i < n; i++) g.addLaser({ x: e.x, y: e.y, ang: a0 + (i / n) * TAU, len: 1300, w: 26, warn: 1.3, dur: 2.6, owner: e, spin: dir * (rage ? 0.45 : 0.34) });
        g.audio.play('charge');
        e.timer = 5;
      } else {
        summon(g, e, rage ? ['drifter', 'lancer', 'spitter'] : ['drifter', 'lancer'], rage ? 6 : 4, 190);
        e.timer = 2.4;
      }
    }
  } else if (e.state === 2) {      // ground slams that chase you
    if (e.timer <= 0) {
      slam(g, 125, 0.4, 0.85);
      g.fx.ring(e.x, e.y, COL.violet, e.r, e.r * 1.5, 0.25, 3);
      e.count--;
      e.timer = 0.5;
      if (e.count <= 0) { e.state = 0; e.timer = rage ? 1.2 : 1.8; }
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
      c.rad = 260 + Math.sin(c.t * 0.75) * 160;
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
        for (let i = -3; i <= 3; i++) g.fireBullet(e.x, e.y, a0 + i * 0.15, 380);
        e.timer = 1.15;
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
      e.hp = Math.max(e.hp, e.maxHp * 0.3);   // the survivor draws on its twin's light
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
      steer(e, p.x, p.y, 260, 2, dt);
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
      if (e.timer <= 0) { e.state = 0; e.timer = 1.9; g.ringBullets(e.x, e.y, 14, 220, 0); slam(g, 120, 0.3, 0.8); }
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
      e.mineT = rage ? 0.18 : 0.24;
      const tail = alive[alive.length - 1] || e;
      g.fireBullet(tail.x, tail.y, g.rng.angle(), 12, { life: rage ? 6 : 5, r: 9, kind: 'mine' });
    }
    if (rage) {
      e.shotT -= dt;
      if (e.shotT <= 0) { e.shotT = 1.3; for (let i = -1; i <= 1; i++) g.fireBullet(e.x, e.y, toPlayer(g, e) + i * 0.22, 340); g.audio.play('enemyShot'); }
    }
    if (e.timer <= 0) { e.state = 1; e.timer = 0.85; g.audio.play('charge'); }
  } else if (e.state === 1) {            // line up a charge
    speed = 130;
    e.rot = turnToward(e.rot, toPlayer(g, e), 4.5 * dt);
    if (e.timer <= 0) { e.state = 2; e.timer = rage ? 1.25 : 1.05; g.audio.play('bossRoar'); g.fx.shake(8); }
  } else {                               // charge straight through
    speed = rage ? 1250 : 1080;
    g.fx.mote(e.x, e.y, COL.teal, 1, 8, 0.4, 100);
    if (e.timer <= 0) { slam(g, 135, 0.25, 0.8); e.state = 0; e.timer = rage ? 2.8 : 4; e.cdir = g.rng.sign(); e.ca = Math.atan2(e.y - p.y, e.x - p.x); }
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
  const fast = phase === 3 ? 0.68 : phase === 2 ? 0.85 : 1;

  if (e.state !== 4) {
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    if (d > 420) steer(e, p.x, p.y, 110, 2, dt); else { e.vx = damp(e.vx, 0, 2, dt); e.vy = damp(e.vy, 0, 2, dt); }
  }

  switch (e.state) {
    case 0:                              // pick the next attack
      if (e.timer <= 0) {
        const opts = phase === 1 ? [1, 2, 4] : phase === 2 ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 3, 5];
        let pick = g.rng.pick(opts);
        if (pick === e.last) pick = g.rng.pick(opts);
        e.last = pick;
        e.state = pick;
        e.count = pick === 1 ? 4 : pick === 2 ? 5 : pick === 4 ? phase + 2 : pick === 5 ? 4 + phase : 0;
        e.timer = pick === 3 ? 4.2 : 0.4;
        e.shotT = 0;
        if (pick === 4) { e.sub = 0; e.timer = 0.7; g.audio.play('telegraph'); }
        if (phase >= 2 && g.rng.chance(phase === 3 ? 0.4 : 0.2)) summon(g, e, ['phantom', 'drifter'], 2, 260);
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
      const pull = phase === 3 ? 218 : 172;
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
    case 5:                              // heartquake: slams that chase you
      if (e.timer <= 0) {
        slam(g, 115, 0.45, 0.8, 70);
        e.count--;
        e.timer = 0.38 * fast;
        if (e.count <= 0) { e.state = 0; e.timer = 1.3 * fast; }
      }
      break;
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


// ------------------------------------------------------------------ Shatterheart
// A crystal heart that bursts into shards at 66% and 33%. While shards live the
// core is encased; shards that survive fly home and heal it.
function aiShatter(g, e, dt) {
  const p = g.player, f = hpFrac(e);
  e.shards = e.shards.filter((s) => !s.dead);
  if (e.broken < 2 && f < (e.broken === 0 ? 0.66 : 0.33)) {
    e.broken++;
    const n = e.broken + 1;
    for (let i = 0; i < n; i++) {
      const a = g.rng.angle();
      const s = spawnEnemy(g, 'shard', e.x + Math.cos(a) * 90, e.y + Math.sin(a) * 90, { spawn: 0.25, hpScale: 1 });
      s.hp = s.maxHp = e.maxHp * 0.13;
      s.core = e; s.life = 10;
      s.vx = Math.cos(a) * 600; s.vy = Math.sin(a) * 600;
      e.shards.push(s);
    }
    g.ringBullets(e.x, e.y, 16, 240, g.rng.angle());
    g.fx.burst(e.x, e.y, COL.ice, 50, 600, 0.8, 6, 1);
    g.fx.shock(e.x, e.y, 1.2, 800, 0.7);
    g.fx.shake(10);
    g.audio.play('shieldBreak');
    g.ui.banner('SHATTERED', 'Break the shards before they return', 'warn');
    e.state = 0; e.timer = 1.4;
  }
  e.armor = e.shards.length ? 0.25 : 1;

  const d = Math.hypot(p.x - e.x, p.y - e.y), a = toPlayer(g, e);
  if (d > 430) steer(e, p.x, p.y, 120, 1.6, dt);
  else steer(e, e.x + Math.cos(a + 1.4) * 100, e.y + Math.sin(a + 1.4) * 100, 80, 1.6, dt);
  e.rot += dt * (e.shards.length ? 1.6 : 0.6);

  e.timer -= dt;
  if (e.state === 0) {
    if (e.timer > 0) return;
    e.atk = (e.atk + 1) % 3;
    e.state = e.atk + 1;
    e.count = e.atk === 0 ? 4 : e.atk === 2 ? 5 : 1;
    e.timer = e.atk === 1 ? 0 : 0.2;
  } else if (e.state === 1) {               // splinter fans
    if (e.timer <= 0) {
      for (let i = -3; i <= 3; i++) g.fireBullet(e.x, e.y, a + i * 0.13, 390, { r: 7 });
      g.audio.play('enemyBurst');
      e.count--; e.timer = 0.38;
      if (e.count <= 0) { e.state = 0; e.timer = e.shards.length ? 1.3 : 0.9; }
    }
  } else if (e.state === 2) {               // crystal lances
    for (const k of [-0.45, 0, 0.45]) g.addLaser({ x: e.x, y: e.y, ang: a + k, len: 760, w: 24, warn: 0.85, dur: 0.35, owner: e });
    g.audio.play('charge');
    e.state = 0; e.timer = 1.7;
  } else if (e.timer <= 0) {                // slams
    slam(g, 115, 0.4, 0.8);
    e.count--; e.timer = 0.42;
    if (e.count <= 0) { e.state = 0; e.timer = 1.3; }
  }
}

function aiShard(g, e, dt) {
  const p = g.player, core = e.core;
  e.rot += dt * 4;
  e.life -= dt;
  if (!core || core.dead) { g.killEnemy(e, true); return; }
  if (e.life <= 0) {                        // fly home and mend the core
    const d = steer(e, core.x, core.y, 750, 6, dt);
    if (d < core.r) {
      core.hp = Math.min(core.maxHp, core.hp + core.maxHp * 0.05);
      g.fx.ring(core.x, core.y, COL.ice, core.r, core.r * 2, 0.4, 4);
      g.fx.text(core.x, core.y - core.r - 20, 'MENDED', COL.ice, 14, 0.8);
      g.killEnemy(e, true);
    }
    return;
  }
  e.timer -= dt;
  if (e.state === 0) {                      // circle the player
    e.oa = (e.oa ?? g.rng.angle()) + dt * 1.1;
    steer(e, p.x + Math.cos(e.oa) * 280, p.y + Math.sin(e.oa) * 280, 330, 3, dt);
    if (e.timer <= 0) { e.state = 1; e.timer = 0.45; e.da = toPlayer(g, e); g.audio.play('telegraph'); }
  } else if (e.state === 1) {               // wind up
    e.vx = damp(e.vx, 0, 10, dt); e.vy = damp(e.vy, 0, 10, dt);
    if (e.timer > 0.15) e.da = toPlayer(g, e);
    if (e.timer <= 0) { e.state = 2; e.timer = 0.32; }
  } else {                                  // dash, then splinter
    e.vx = Math.cos(e.da) * 950; e.vy = Math.sin(e.da) * 950;
    if (e.timer <= 0) { e.state = 0; e.timer = g.rng.range(1.6, 2.4); g.ringBullets(e.x, e.y, 6, 210, g.rng.angle(), { r: 6 }); }
  }
}

// ------------------------------------------------------------------ The Weaver
// Spins anchors around you and joins them with deadly threads: a cage that
// tightens until you cut your way out.
function aiWeaver(g, e, dt) {
  const p = g.player, rage = hpFrac(e) < 0.4;
  e.anchors = e.anchors.filter((a) => !a.dead);
  const d = Math.hypot(p.x - e.x, p.y - e.y), a = toPlayer(g, e);
  if (d > 520) steer(e, p.x, p.y, 150, 2, dt);
  else if (d < 330) steer(e, e.x - Math.cos(a) * 100, e.y - Math.sin(a) * 100, 150, 2, dt);
  else steer(e, e.x + Math.cos(a + Math.PI / 2) * 100, e.y + Math.sin(a + Math.PI / 2) * 100, 90, 2, dt);
  e.rot = turnToward(e.rot, a, 3 * dt);

  e.anchorT -= dt;
  const maxA = rage ? 6 : 5;
  // a thin web gets rewoven all at once
  e.reweaveT -= dt;
  if (e.anchors.length < 3 && e.anchorT <= 0 && !e.weave && e.reweaveT <= 0) {
    e.weave = 4; e.reweaveT = rage ? 6 : 8;
    if (!e.warned) { e.warned = true; g.ui.banner('THE WEB TIGHTENS', 'Cut the anchors', 'warn'); }
  }
  if (e.anchors.length < maxA && (e.anchorT <= 0 || e.weave > 0)) {
    e.anchorT = rage ? 2.5 : 4.5;
    if (e.weave > 0) e.weave--;
    // fill the biggest angular gap around the player
    const angs = e.anchors.map((o) => Math.atan2(o.y - p.y, o.x - p.x)).sort((x, y) => x - y);
    let na = g.rng.angle();
    if (angs.length) {
      let best = 0;
      for (let i = 0; i < angs.length; i++) {
        const nx = i + 1 < angs.length ? angs[i + 1] : angs[0] + TAU, gap = nx - angs[i];
        if (gap > best) { best = gap; na = angs[i] + gap / 2; }
      }
    }
    const R = g.rng.range(400, 520);
    const x = clamp(p.x + Math.cos(na) * R, -ARENA.hw + 50, ARENA.hw - 50), y = clamp(p.y + Math.sin(na) * R, -ARENA.hh + 50, ARENA.hh - 50);
    const an = spawnEnemy(g, 'anchor', x, y, { spawn: 0.5, hpScale: 1 });
    an.hp = an.maxHp = Math.max(80, e.maxHp * 0.05);
    an.web = e;
    e.anchors.push(an);
    g.audio.play('telegraph');
  }
  updateThreads(g, e);
  e.armor = e.anchors.length >= 4 ? 0.7 : 1;          // the web shields its maker

  e.timer -= dt;
  if (e.timer <= 0) {
    e.atk = (e.atk + 1) % 2;
    if (e.atk === 0) {                      // sticky silk where you're heading
      for (let i = 0; i < 2; i++) {
        const tx = p.x + p.vx * 0.5 + g.rng.range(-90, 90), ty = p.y + p.vy * 0.5 + g.rng.range(-90, 90);
        g.zones.push({ kind: 'web', x: tx, y: ty, r: 95, t: 0, dur: 6.5, tick: 0, land: 0.55 });
      }
      g.audio.play('enemyShot');
      e.timer = rage ? 1.6 : 2.2;
    } else {                                 // a fan of venom
      for (let i = -3; i <= 3; i++) g.fireBullet(e.x, e.y, a + i * 0.17, 350);
      g.audio.play('enemyBurst');
      e.timer = rage ? 1.4 : 2;
    }
  }
}

/** Keep one laser per thread: a ring through the anchors plus one back to the Weaver. */
function updateThreads(g, e) {
  const p = g.player, an = e.anchors.filter((o) => o.spawn <= 0);
  const pairs = [];
  if (an.length >= 2) {
    let cx = 0, cy = 0;
    for (const o of an) { cx += o.x; cy += o.y; }
    cx /= an.length; cy /= an.length;
    an.sort((u, v) => Math.atan2(u.y - cy, u.x - cx) - Math.atan2(v.y - cy, v.x - cx));
    for (let i = 0; i < an.length; i++) {
      if (an.length === 2 && i === 1) break;
      const u = an[i], v = an[(i + 1) % an.length];
      pairs.push([u, v]);
    }
  }
  if (an.length) {
    let near = an[0], nd = Infinity;
    for (const o of an) { const dd = (o.x - e.x) ** 2 + (o.y - e.y) ** 2; if (dd < nd) { nd = dd; near = o; } }
    pairs.push([e, near]);
  }
  const keep = new Map();
  for (const [u, v] of pairs) {
    const key = u.id < v.id ? `${u.id}-${v.id}` : `${v.id}-${u.id}`;
    let l = e.threads.get(key);
    if (!l || l.dead) l = g.addLaser({ x: u.x, y: u.y, ang: 0, len: 1, w: 13, warn: 0.9, dur: 1, perm: true, owner: e });
    l.free = true; l.thread = true;
    l.x = u.x; l.y = u.y;
    l.ang = Math.atan2(v.y - u.y, v.x - u.x);
    l.len = Math.hypot(v.x - u.x, v.y - u.y);
    keep.set(key, l);
  }
  for (const [key, l] of e.threads) if (!keep.has(key)) l.dead = true;
  e.threads = keep;
}

function aiAnchor(g, e, dt) {
  const p = g.player, d = Math.hypot(p.x - e.x, p.y - e.y);
  if (d > 240) steer(e, p.x, p.y, 32, 1.5, dt); else { e.vx = damp(e.vx, 0, 3, dt); e.vy = damp(e.vy, 0, 3, dt); }
  e.rot += dt * 2;
}

// ------------------------------------------------------------------ The Metronome
// Everything lands on the beat: a swinging pendulum laser and checkerboard
// floor tiles that detonate on the next downbeat.
function aiMetronome(g, e, dt) {
  const p = g.player, rage = hpFrac(e) < 0.5;
  const d = Math.hypot(p.x - e.x, p.y - e.y), a = toPlayer(g, e);
  const swinging = e.pend && !e.pend.dead;
  if (swinging) { e.vx = damp(e.vx, 0, 4, dt); e.vy = damp(e.vy, 0, 4, dt); }   // plant the pendulum: step back out of reach
  else if (d > 480) steer(e, p.x, p.y, 120, 1.5, dt);
  else if (d < 300) steer(e, e.x - Math.cos(a) * 100, e.y - Math.sin(a) * 100, 110, 1.5, dt);
  else { e.vx = damp(e.vx, 0, 2, dt); e.vy = damp(e.vy, 0, 2, dt); }

  if (g.onBeat && e.spawn <= 0) {
    e.beat++;
    e.rot = (e.beat % 2 ? 1 : -1) * 0.5;        // the hand ticks side to side
    const cyc = e.beat % 12;
    if (cyc === 0) {
      e.pend = g.addLaser({ x: e.x, y: e.y, ang: a, len: 560, w: 26, warn: 2 * BEAT, dur: 8 * BEAT, owner: e });
      e.pend.pendulum = true;
      e.pend.base = a; e.pend.swing = 1.1;
      e.pendBase = a; e.pendT = 0;
      g.audio.play('charge');
    }
    const every = rage ? 3 : 4;
    if (e.beat % every === 2 % every) stampTiles(g, e, rage);
    if (rage && e.beat % 4 === 1) g.ringBullets(e.x, e.y, 14, 210, e.beat * 0.26);
    g.fx.ring(e.x, e.y, COL.amber, e.r, e.r * 1.3, 0.2, 2);
  }
  if (e.pend && !e.pend.dead) {
    e.pendT += dt;
    e.pend.ang = e.pendBase + Math.sin(e.pendT * Math.PI / (4 * BEAT)) * 1.1;   // one swing every 4 beats
    e.pend.base = e.pendBase;
  }
}

/** A 5x5 checkerboard around the player; one colour detonates two beats later. */
function stampTiles(g, e, rage) {
  const p = g.player, S = 170, parity = e.bar++ % 2;
  const cx = Math.round(p.x / S) * S, cy = Math.round(p.y / S) * S;
  let lead = true;
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      if (((i + j) & 1) !== parity) continue;
      const x = cx + i * S, y = cy + j * S;
      if (Math.abs(x) > ARENA.hw || Math.abs(y) > ARENA.hh) continue;
      g.zones.push({ kind: 'tile', x, y, r: S * 0.5, t: 0, dur: 2 * BEAT, tick: 0, lead });
      lead = false;
    }
  }
  g.audio.play('bossBeat');
}

// ------------------------------------------------------------------ The Eclipse
// The final boss swallows the light. Only a pool around you stays lit; it
// hunts from the dark, sends decoys, and finally burns as a diamond ring.
function aiEclipse(g, e, dt) {
  const p = g.player, f = hpFrac(e);
  const phase = f > 0.66 ? 1 : f > 0.33 ? 2 : 3;
  if (phase !== e.phase) {
    e.phase = phase;
    if (phase > 1) {
      for (const b of g.bullets) b.dead = true;
      g.fx.shock(e.x, e.y, 1.8, 1100, 0.9);
      g.fx.burst(e.x, e.y, COL.gold, 70, 800, 1, 7, 1);
      g.fx.shake(14);
      g.audio.play('bossRoar');
      g.ui.banner(phase === 2 ? 'TOTALITY' : 'DIAMOND RING', '', 'warn');
    }
    e.state = 0; e.timer = 1.4;
  }
  // darkness and the pool of light around the player
  const pulse = phase === 3 ? 0.5 + 0.5 * Math.cos((g.time / BEAT) * Math.PI * 2) : 0;
  const target = phase === 1 ? 0.78 : phase === 2 ? 0.9 : 0.55 + 0.35 * pulse;
  e.darkK = damp(e.darkK, e.spawn > 0 ? 0 : target, 1.5, dt);
  const lightR = phase === 2 ? 290 : 380;
  e.lightR = damp(e.lightR || 600, lightR, 1.2, dt);
  g.dark = { x: p.x, y: p.y, r: e.lightR, k: e.darkK };
  e.reveal = Math.max(0, (e.reveal || 0) - dt * 1.2);
  e.rot += dt * 0.4;

  if (e.state !== 2 && e.state !== 3) {           // stalk at the edge of the light
    e.oa = (e.oa ?? Math.atan2(e.y - p.y, e.x - p.x)) + dt * 0.45 * e.odir;
    const R = e.lightR + 150;
    steer(e, p.x + Math.cos(e.oa) * R, p.y + Math.sin(e.oa) * R, 260, 2.2, dt);
  }

  e.timer -= dt;
  switch (e.state) {
    case 0: {                                   // choose
      if (e.timer > 0) break;
      const opts = phase === 1 ? [1, 2, 1] : phase === 2 ? [1, 2, 4, 5] : [1, 6, 7, 2, 4];
      let pick = g.rng.pick(opts);
      if (pick === e.last) pick = g.rng.pick(opts);
      e.last = pick;
      if (pick === 1) { e.state = 2; e.timer = 0.75; e.count = phase; g.audio.play('telegraph'); }
      else if (pick === 2) { e.state = 4; e.count = phase + 1; e.timer = 0.1; }
      else if (pick === 4) { e.state = 5; e.count = 4 + phase; e.timer = 0.1; }
      else if (pick === 5) {
        const decoys = g.enemies.filter((o) => o.type === 'umbra' && !o.dead).length;
        for (let i = decoys; i < 2; i++) {
          const a = g.rng.angle(), u = spawnEnemy(g, 'umbra', p.x + Math.cos(a) * (e.lightR + 160), p.y + Math.sin(a) * (e.lightR + 160), { spawn: 0.6, hpScale: 1 });
          u.odir = g.rng.sign();
        }
        e.state = 0; e.timer = 1.2;
      } else if (pick === 6) {                    // rotating corona lasers
        const a0 = g.rng.angle(), dir = g.rng.sign();
        for (let i = 0; i < 4; i++) g.addLaser({ x: e.x, y: e.y, ang: a0 + (i / 4) * TAU, len: 1300, w: 26, warn: 1.2, dur: 3, owner: e, spin: dir * 0.42 });
        e.reveal = 1; g.audio.play('charge');
        e.state = 0; e.timer = 4.2;
      } else {                                    // gravity + spiral arms
        e.state = 7; e.timer = 3.6; e.shotT = 0;
      }
      break;
    }
    case 2:                                     // eyes flare: wind up a lunge
      e.vx = damp(e.vx, 0, 8, dt); e.vy = damp(e.vy, 0, 8, dt);
      e.flare = 1;
      if (e.timer > 0.22) e.da = toPlayer(g, e);
      if (e.timer <= 0) { e.state = 3; e.timer = 0.55; g.audio.play('lunge'); }
      break;
    case 3:                                     // lunge out of the dark
      e.vx = Math.cos(e.da) * 1250; e.vy = Math.sin(e.da) * 1250;
      e.reveal = Math.max(e.reveal, 0.6);
      g.fx.mote(e.x, e.y, COL.gold, 1, 9, 0.4, 100, 1);
      if (e.timer <= 0) {
        g.ringBullets(e.x, e.y, 12, 230, g.rng.angle());
        e.count--;
        if (e.count > 0) { e.state = 2; e.timer = 0.6; g.audio.play('telegraph'); }
        else { e.state = 0; e.timer = phase === 3 ? 0.8 : 1.1; e.odir = g.rng.sign(); }
      }
      break;
    case 4:                                     // corona flares
      if (e.timer <= 0) {
        g.ringBullets(e.x, e.y, phase === 1 ? 18 : 22, 230, g.rng.angle());
        g.fx.ring(e.x, e.y, COL.gold, e.r, e.r * 2.6, 0.4, 5);
        e.reveal = 1;
        g.audio.play('enemyBurst');
        e.count--; e.timer = 0.6;
        if (e.count <= 0) { e.state = 0; e.timer = 1; }
      }
      break;
    case 5:                                     // slams from the dark
      if (e.timer <= 0) {
        slam(g, 115, 0.45, 0.8, 60);
        e.count--; e.timer = 0.38;
        if (e.count <= 0) { e.state = 0; e.timer = 0.9; }
      }
      break;
    case 7: {                                   // pull you toward it and spiral
      const dx = e.x - p.x, dy = e.y - p.y, dd = Math.hypot(dx, dy) || 1;
      p.pullX += (dx / dd) * 200; p.pullY += (dy / dd) * 200;
      e.reveal = 1;
      e.shotT -= dt;
      if (e.shotT <= 0) {
        e.shotT = 0.14;
        e.spiral = (e.spiral || 0) + 0.25;
        for (let i = 0; i < 3; i++) g.fireBullet(e.x, e.y, e.spiral + (i / 3) * TAU, 235);
      }
      if (e.timer <= 0) { e.state = 0; e.timer = 1.2; }
      break;
    }
  }
  if (e.state !== 2) e.flare = Math.max(0, (e.flare || 0) - dt * 3);
}

function aiUmbra(g, e, dt) {
  const p = g.player, boss = g.enemies.find((o) => o.type === 'eclipse' && !o.dead);
  const lightR = boss ? boss.lightR : 380;
  e.oa = (e.oa ?? Math.atan2(e.y - p.y, e.x - p.x)) + dt * 0.5 * (e.odir || 1);
  e.rot += dt * 0.4;
  e.timer -= dt;
  if (e.state === 0) {
    steer(e, p.x + Math.cos(e.oa) * (lightR + 140), p.y + Math.sin(e.oa) * (lightR + 140), 250, 2.2, dt);
    if (e.timer <= 0) { e.state = 1; e.timer = 0.75; e.flare = 1; }
  } else if (e.state === 1) {
    e.vx = damp(e.vx, 0, 8, dt); e.vy = damp(e.vy, 0, 8, dt);
    if (e.timer > 0.22) e.da = toPlayer(g, e);
    if (e.timer <= 0) { e.state = 2; e.timer = 0.5; }
  } else {
    e.vx = Math.cos(e.da) * 1100; e.vy = Math.sin(e.da) * 1100;
    if (e.timer <= 0) { e.state = 0; e.timer = g.rng.range(2.5, 4); e.flare = 0; }
  }
  if (e.state !== 1) e.flare = Math.max(0, (e.flare || 0) - dt * 3);
}

// ------------------------------------------------------------------ registration
const bossBase = { boss: true, heavy: true, noCharm: true, noSep: true, noElite: true, threat: 30 };

Object.assign(DEFS, {
  monolith: {
    ...bossBase, name: 'THE MONOLITH', hp: 3000, speed: 60, r: 78, xp: 120, col: 'violet', score: 4000, ai: aiMonolith,
    init(g, e) { e.plates = []; e.plateT = 0.5; e.atk = -1; e.timer = 2.2; },
    onDeath(g, e) { for (const s of e.plates) if (!s.dead) g.killEnemy(s, true); },
  },
  plate: { hp: 70, speed: 0, r: 26, xp: 0, threat: 0, col: 'blue', ai() {}, noMove: true, noSep: true, noCharm: true, heavy: true, noElite: true, free: true, untargetable: false, score: 20 },
  binary: {
    ...bossBase, name: 'BINARY', hp: 8500, speed: 0, r: 52, xp: 90, col: 'amber', score: 4000, ai: aiBinary, noMove: true,
    init(g, e, o) {
      e.idx = o.idx || 0;
      e.ctl = o.ctl || { x: e.x, y: e.y, ang: 0, rad: 250, t: 0, frame: -1, beam: null };
      e.timer = 2.5 + e.idx * 0.6;
    },
  },
  ouroboros: {
    ...bossBase, name: 'OUROBOROS', hp: 32000, speed: 330, r: 44, xp: 220, col: 'teal', score: 6000, ai: aiOuroboros, noMove: true,
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
    ...bossBase, name: 'THE HOLLOW HEART', hp: 65000, speed: 110, r: 70, xp: 400, col: 'hot', score: 12000, ai: aiHollow, noMove: true,
    init(g, e) { e.phase = 1; e.timer = 2.5; e.last = 0; },
  },

  shatter: {
    ...bossBase, name: 'SHATTERHEART', hp: 3500, speed: 120, r: 64, xp: 130, col: 'ice', score: 4000, ai: aiShatter,
    init(g, e) { e.shards = []; e.broken = 0; e.atk = -1; e.timer = 2; e.armor = 1; },
    onDeath(g, e) { for (const s of e.shards) if (!s.dead) g.killEnemy(s, true); },
  },
  shard: { hp: 100, speed: 330, r: 22, xp: 6, threat: 0, col: 'ice', ai: aiShard, noCharm: true, noElite: true, heavy: true, noSep: true, score: 300 },
  weaver: {
    ...bossBase, name: 'THE WEAVER', hp: 12000, speed: 150, r: 56, xp: 100, col: 'lime', score: 4000, ai: aiWeaver,
    init(g, e) { e.anchors = []; e.anchorT = 1.2; e.weave = 0; e.reweaveT = 0; e.armor = 1; e.threads = new Map(); e.atk = -1; e.timer = 2.5; },
    onDeath(g, e) {
      for (const a of e.anchors) if (!a.dead) g.killEnemy(a, true);
      for (const l of e.threads.values()) l.dead = true;
      for (const z of g.zones) if (z.kind === 'web') z.dead = true;
    },
  },
  anchor: {
    hp: 200, speed: 32, r: 17, xp: 2, threat: 0, col: 'lime', ai: aiAnchor, noCharm: true, noElite: true, heavy: true, noSep: true, score: 100,
    onDeath(g, e) {                         // a cut thread snaps back and wounds the Weaver
      const w = e.web;
      if (!w || w.dead) return;
      g.fx.lightning(e.x, e.y, w.x, w.y, COL.lime);
      g.fx.text(w.x, w.y - w.r - 18, 'SNAP', COL.lime, 13, 0.6);
      w.hp -= w.maxHp * 0.035;
      w.flash = 1;
      if (w.hp <= 0) g.killEnemy(w);
    },
  },
  metronome: {
    ...bossBase, name: 'THE METRONOME', hp: 32000, speed: 110, r: 62, xp: 220, col: 'amber', score: 6000, ai: aiMetronome,
    init(g, e) { e.beat = -1; e.bar = 0; e.pend = null; e.timer = 1; },
  },
  eclipse: {
    ...bossBase, name: 'THE ECLIPSE', hp: 140000, speed: 260, r: 66, xp: 500, col: 'gold', score: 15000, ai: aiEclipse,
    init(g, e) { e.phase = 0; e.timer = 2.5; e.darkK = 0; e.odir = 1; e.last = 0; },
    onDeath(g, e) { g.dark = null; for (const u of g.enemies) if (u.type === 'umbra' && !u.dead) g.killEnemy(u, true); },
  },
  umbra: {
    hp: 1, speed: 250, r: 54, xp: 4, threat: 0, col: 'gold', ai: aiUmbra, noCharm: true, noElite: true, heavy: true, noSep: true, statusImmune: true, score: 200,
    onDeath(g, e) { g.ringBullets(e.x, e.y, 10, 200, g.rng.angle()); g.fx.burst(e.x, e.y, COL.gold, 30, 500, 0.6, 5); },
  },
});

/** Each sector draws its boss from a pool; the Hollow Heart and the Eclipse are fixed. */
export const BOSS_POOLS = [['monolith', 'shatter'], ['binary', 'weaver'], ['ouroboros', 'metronome'], ['hollow'], ['eclipse']];
export const BOSS_ORDER = BOSS_POOLS.flat();
export const rollBossPlan = (rng) => BOSS_POOLS.map((pool) => rng.pick(pool));

/** Spawn the boss for a given boss index (0, 1, 2, ... cycling through the sectors in endless). */
export function spawnBoss(g, index) {
  const sector = index % BOSS_POOLS.length;
  // the first loop follows the run's plan; endless re-rolls every pool
  const type = index < BOSS_POOLS.length && g.bossPlan ? g.bossPlan[sector] : g.rng.pick(BOSS_POOLS[sector]);
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
