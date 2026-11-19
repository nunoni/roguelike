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
    if (s.launch) { flyPlate(g, s, dt); return; }
    const a = spin + (i / 4) * TAU;
    s.x = e.x + Math.cos(a) * 150; s.y = e.y + Math.sin(a) * 150;
    s.rot = a;
    s.faded = e.faded;
  });

  e.timer -= dt;
  if (e.state === 3) {             // plate barrage: launch the shields one by one
    if (e.timer <= 0) {
      const s = e.plates.find((o) => !o.launch && o.spawn <= 0);
      if (!s || e.count <= 0) { e.state = 0; e.timer = 1.4; e.plateT = 1.5; return; }
      const a = Math.atan2(p.y + p.vy * 0.3 - s.y, p.x + p.vx * 0.3 - s.x);
      s.launch = { ang: a, t: 0 };
      g.addLaser({ x: s.x, y: s.y, ang: a, len: 1700, w: 40, warn: 0.6, dur: 0.3 });
      g.audio.play('charge');
      e.count--; e.timer = rage ? 0.32 : 0.42;
    }
    return;
  }
  if (e.state === 4) {             // Monolith Fall: rise out of reach, then crash down on you
    const z = e.fallZ;
    e.vx = e.vy = 0;
    if (z.t < z.dur - 0.45) {
      z.x = damp(z.x, clamp(p.x + p.vx * 0.25, -ARENA.hw + 80, ARENA.hw - 80), 5, dt);
      z.y = damp(z.y, clamp(p.y + p.vy * 0.25, -ARENA.hh + 80, ARENA.hh - 80), 5, dt);
    }
    if (z.t > 0.35) { e.x = z.x; e.y = z.y; }
    if (z.dead || z.t >= z.dur) {
      e.faded = false;
      g.ringBullets(e.x, e.y, 20, 250, g.rng.angle());
      g.fx.shake(18);
      e.state = 0; e.timer = 1.6;
    }
    return;
  }
  if (e.state === 0) {
    if (e.timer <= 0) {
      e.atk = (e.atk + 1) % (rage ? 6 : 5);
      if (e.atk === 4 && e.plates.filter((o) => !o.launch).length < 2) e.atk = rage ? 5 : 0;
      if (e.atk === 4) { e.state = 3; e.count = 4; e.timer = 0.2; g.fx.text(e.x, e.y - e.r - 24, 'BARRAGE', COL.violet, 13, 0.9); return; }
      if (e.atk === 5) {
        e.state = 4; e.faded = true;
        e.fallZ = { kind: 'blast', x: p.x, y: p.y, r: 210, t: 0, dur: 1.75, tick: 0, fall: true };
        g.zones.push(e.fallZ);
        g.fx.burst(e.x, e.y, COL.violet, 40, 500, 0.6, 6);
        g.audio.play('bossRoar');
        return;
      }
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

function flyPlate(g, s, dt) {
  const L = s.launch;
  L.t += dt;
  s.faded = false;
  if (L.t < 0.6) { s.x += g.rng.range(-2, 2); s.y += g.rng.range(-2, 2); return; }   // rattle, then fly
  s.x += Math.cos(L.ang) * 2600 * dt; s.y += Math.sin(L.ang) * 2600 * dt;
  s.rot += dt * 12;
  if (Math.abs(s.x) > ARENA.hw + 60 || Math.abs(s.y) > ARENA.hh + 60) g.killEnemy(s, true);
}

// ------------------------------------------------------------------ Binary
function aiBinary(g, e, dt) {
  const p = g.player, c = e.ctl;
  const twin = e.twin && !e.twin.dead ? e.twin : null;
  if (twin) {
    if (c.frame !== g.frame) {           // shared orbit, advanced once per frame
      c.frame = g.frame;
      c.t += dt;
      const base = 260 + Math.sin(c.t * 0.75) * 160;
      // Scissor: the pair snaps together, then flings wide with the tether sweeping fast
      c.scT = (c.scT ?? 8) - dt;
      if (c.scT <= 0 && c.sc === undefined) { c.sc = 0; g.audio.play('charge'); g.fx.ring(c.x, c.y, COL.amber, 40, 500, 0.6, 3); }
      if (c.sc !== undefined) {
        c.sc += dt;
        const q = c.sc;
        c.rad = q < 0.9 ? base + (70 - base) * (q / 0.9) : q < 1.8 ? 70 + 400 * ((q - 0.9) / 0.9) : 470 + (base - 470) * Math.min(1, (q - 1.8) / 0.8);
        c.ang += dt * (q > 0.9 && q < 2.2 ? 2.4 : 0.85);
        if (q >= 2.6) { c.sc = undefined; c.scT = 8.5; }
      } else {
        c.rad = base;
        c.ang += dt * 0.85;
      }
      // Tether Wall: bullets peel off both sides of the beam
      c.wallT = (c.wallT ?? 4) - dt;
      if (c.wallT <= 0 && c.sc === undefined && c.beam && c.beam.t > c.beam.warn) {
        c.wallT = 4.6;
        const b = c.beam, nx = -Math.sin(b.ang), ny = Math.cos(b.ang);
        for (let i = 1; i <= 7; i++) {
          const f = i / 8, x = b.x + Math.cos(b.ang) * b.len * f, y = b.y + Math.sin(b.ang) * b.len * f;
          g.fireBullet(x, y, Math.atan2(ny, nx), 200);
          g.fireBullet(x, y, Math.atan2(-ny, -nx), 200);
        }
        g.audio.play('enemyBurst');
      }
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
    } else if (e.state === 2) {          // dash
      e.vx = Math.cos(e.da) * 1150; e.vy = Math.sin(e.da) * 1150;
      g.fx.mote(e.x, e.y, COL.amber, 1, 8, 0.4, 80);
      if (e.timer <= 0) {
        g.ringBullets(e.x, e.y, 14, 220, 0); slam(g, 120, 0.3, 0.8);
        e.dashes = (e.dashes || 0) + 1;
        if (e.dashes % 2 === 0) { e.state = 3; e.timer = 1.6; e.shotT = 0; }   // collapse: pull you in and spiral
        else { e.state = 0; e.timer = 1.9; }
      }
    } else {
      e.vx = damp(e.vx, 0, 6, dt); e.vy = damp(e.vy, 0, 6, dt);
      const dx = e.x - p.x, dy = e.y - p.y, dd = Math.hypot(dx, dy) || 1;
      p.pullX += (dx / dd) * 170; p.pullY += (dy / dd) * 170;
      e.shotT -= dt;
      if (e.shotT <= 0) {
        e.shotT = 0.12;
        e.spiral = (e.spiral || 0) + 0.27;
        for (let i = 0; i < 3; i++) g.fireBullet(e.x, e.y, e.spiral + (i / 3) * TAU, 230);
      }
      if (e.timer <= 0) { e.state = 0; e.timer = 1.6; }
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
  }
  if (rage && e.state !== 2) {           // venom: the body spits too
    e.venomT = (e.venomT ?? 1.4) - dt;
    if (e.venomT <= 0 && alive.length) {
      e.venomT = 1.4;
      for (let k = 0; k < 3; k++) {
        const sg = alive[Math.floor(g.rng.next() * alive.length)];
        g.fireBullet(sg.x, sg.y, Math.atan2(p.y - sg.y, p.x - sg.x), 250, { r: 8 });
      }
    }
  }
  if (e.state === 0) {
    if (e.timer <= 0) {
      e.cycles = (e.cycles || 0) + 1;
      if (e.cycles % 2 === 0) {            // Coil: wrap around you and squeeze
        e.state = 3; e.timer = 3.6; e.shotT = 0.6;
        e.cx = p.x; e.cy = p.y; e.ca = Math.atan2(e.y - p.y, e.x - p.x);
        g.ui.banner('COIL', '', 'warn');
        g.audio.play('bossRoar');
      } else { e.state = 1; e.timer = 0.85; g.audio.play('charge'); }
    }
  } else if (e.state === 3) {            // circle tight around where you stand, then tighten
    e.cx = damp(e.cx, p.x, 0.9, dt); e.cy = damp(e.cy, p.y, 0.9, dt);
    const R = e.timer > 1.1 ? 330 : 200 + 130 * (e.timer / 1.1);
    e.ca += dt * 2.5 * e.cdir;
    const tx = e.cx + Math.cos(e.ca) * R, ty = e.cy + Math.sin(e.ca) * R;
    e.rot = turnToward(e.rot, Math.atan2(ty - e.y, tx - e.x), 7 * dt);
    speed = Math.min(1100, 2.5 * R + Math.hypot(tx - e.x, ty - e.y) * 2);
    e.shotT -= dt;
    if (e.shotT <= 0) {                  // fangs: fans aimed inward
      e.shotT = rage ? 0.45 : 0.6;
      for (let i = -1; i <= 1; i++) g.fireBullet(e.x, e.y, toPlayer(g, e) + i * 0.2, 300);
      g.audio.play('enemyShot');
    }
    if (e.timer <= 0) { e.state = 1; e.timer = 0.7; g.audio.play('charge'); }
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
    if (e.fl) { e.fl.a.dead = e.fl.b.dead = true; e.fl = null; }
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
        const opts = phase === 1 ? [1, 2, 4] : phase === 2 ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 3, 5, 6];
        let pick = g.rng.pick(opts);
        if (pick === e.last) pick = g.rng.pick(opts);
        e.last = pick;
        e.state = pick;
        e.count = pick === 1 ? 4 : pick === 2 ? 5 : pick === 4 ? phase + 2 : pick === 5 ? 4 + phase : 0;
        e.timer = pick === 3 ? 4.2 : 0.4;
        e.shotT = 0;
        if (pick === 4) { e.sub = 0; e.timer = 0.7; g.audio.play('telegraph'); }
        if (pick === 6) startFlatline(g, e);
        if (pick === 3 && phase === 3) {          // arteries: slow spokes while it pulls
          const a0 = g.rng.angle(), dir = g.rng.sign();
          for (let i = 0; i < 3; i++) g.addLaser({ x: e.x, y: e.y, ang: a0 + (i / 3) * TAU, len: 720, w: 22, warn: 1.1, dur: 3.1, owner: e, spin: dir * 0.5 });
          g.audio.play('charge');
        }
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
    case 6:                              // Flatline: a heartbeat wall sweeps the arena
      if (updateFlatline(g, e, dt, phase)) { e.state = 0; e.timer = 1.2 * fast; }
      break;
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


/** An EKG line: a vertical laser wall with a gap that jumps with the heartbeat. */
function startFlatline(g, e) {
  const p = g.player, dir = p.x > e.x ? 1 : -1;
  const ra = g.ringArena;
  const left = ra ? ra.x - ra.r : -ARENA.hw, right = ra ? ra.x + ra.r : ARENA.hw;
  const x0 = dir > 0 ? Math.max(left, p.x - 1000) : Math.min(right, p.x + 1000);
  const top = -ARENA.hh - 40, bot = ARENA.hh + 40;
  e.fl = {
    x: x0, dir, end: dir > 0 ? Math.min(right, p.x + 900) : Math.max(left, p.x - 900),
    gy: clamp(p.y, -ARENA.hh + 200, ARENA.hh - 200), gto: p.y, half: 150, beats: 0,
    a: g.addLaser({ x: x0, y: top, ang: Math.PI / 2, len: 10, w: 24, warn: 1.0, dur: 1, perm: true, owner: e }),
    b: g.addLaser({ x: x0, y: bot, ang: -Math.PI / 2, len: 10, w: 24, warn: 1.0, dur: 1, perm: true, owner: e }),
    top, bot,
  };
  e.fl.a.free = e.fl.b.free = true;
  e.fl.a.ekg = e.fl.b.ekg = true;
  g.ui.banner('FLATLINE', 'Ride the gap', 'warn');
  g.audio.play('charge');
}

function updateFlatline(g, e, dt, phase) {
  const f = e.fl, p = g.player;
  if (!f) return true;
  if (f.a.t > f.a.warn) f.x += f.dir * (phase === 3 ? 400 : 340) * dt;
  if (g.onBeat && f.a.t > f.a.warn && ++f.beats % 2 === 0) {     // the gap jumps on every other beat
    f.gto = clamp(f.gy + g.rng.range(-230, 230), -ARENA.hh + 180, ARENA.hh - 180);
    g.audio.play('bossBeat');
  }
  f.gy = damp(f.gy, f.gto, 6, dt);
  const gTop = f.gy - f.half, gBot = f.gy + f.half;
  f.a.x = f.x; f.a.y = f.top; f.a.len = Math.max(1, gTop - f.top);
  f.b.x = f.x; f.b.y = f.bot; f.b.len = Math.max(1, f.bot - gBot);
  if ((f.dir > 0 && f.x >= f.end) || (f.dir < 0 && f.x <= f.end)) {
    f.a.dead = f.b.dead = true;
    e.fl = null;
    return true;
  }
  return false;
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
    e.atk = (e.atk + 1) % 5;
    if (e.atk === 3) { crystalPrison(g); e.timer = 2; return; }
    if (e.atk === 4) {                        // Shatter Storm: spinning crystal spokes
      const a0 = g.rng.angle(), dir = g.rng.sign(), n = e.shards.length ? 4 : 5;
      for (let i = 0; i < n; i++) g.addLaser({ x: e.x, y: e.y, ang: a0 + (i / n) * TAU, len: 560, w: 22, warn: 1.0, dur: 2.2, owner: e, spin: dir * 0.85 });
      g.fx.text(e.x, e.y - e.r - 24, 'SHATTER STORM', COL.ice, 13, 0.9);
      g.audio.play('charge');
      e.timer = 3.6; return;
    }
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

/** A ring of blasts closes around you with a single gap, plus one on top of you. */
function crystalPrison(g) {
  const p = g.player, n = 9, R = 245, gap = Math.floor(g.rng.next() * n), a0 = g.rng.angle();
  const cx = clamp(p.x + p.vx * 0.2, -ARENA.hw + 60, ARENA.hw - 60), cy = clamp(p.y + p.vy * 0.2, -ARENA.hh + 60, ARENA.hh - 60);
  for (let i = 0; i < n; i++) {
    if (i === gap) continue;
    const a = a0 + (i / n) * TAU;
    g.zones.push({ kind: 'blast', x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, r: 88, t: 0, dur: 1.2, tick: 0, crystal: true });
  }
  const ga = a0 + (gap / n) * TAU;
  g.zones.push({ kind: 'blast', x: cx, y: cy, r: 130, t: 0, dur: 1.2, tick: 0, crystal: true, gapX: cx + Math.cos(ga) * (R + 120), gapY: cy + Math.sin(ga) * (R + 120) });
  g.fx.text(cx, cy - 60, 'PRISON', COL.ice, 13, 0.9);
  g.audio.play('telegraph');
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
      g.ringBullets(core.x, core.y, 12, 230, g.rng.angle(), { r: 7 });
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
    e.lanceT = (e.lanceT ?? g.rng.range(0.8, 1.6)) - dt;
    if (e.lanceT <= 0) {                     // a quick crystal lance at you
      e.lanceT = g.rng.range(2.6, 3.4);
      g.addLaser({ x: e.x, y: e.y, ang: toPlayer(g, e), len: 460, w: 16, warn: 0.75, dur: 0.2, owner: e });
    }
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
  if (e.pz) {                                 // Pounce: hang, then leap onto the marked spot
    const z = e.pz;
    e.vx = e.vy = 0;
    const lead = z.dur - 0.4;
    if (z.t >= lead) {
      const q = Math.min(1, (z.t - lead) / 0.4);
      e.x = e.px + (z.x - e.px) * q; e.y = e.py + (z.y - e.py) * q;
    }
    if (z.dead || z.t >= z.dur) {
      g.zones.push({ kind: 'web', x: z.x, y: z.y, r: 120, t: 0, dur: 6, tick: 0, land: 0.05 });
      g.ringBullets(z.x, z.y, 10, 220, g.rng.angle());
      e.pz = null;
      if (e.chain > 0) {                      // enraged: leap again straight away
        e.chain--;
        const tx = clamp(p.x + p.vx * 0.45, -ARENA.hw + 80, ARENA.hw - 80), ty = clamp(p.y + p.vy * 0.45, -ARENA.hh + 80, ARENA.hh - 80);
        e.pz = { kind: 'blast', x: tx, y: ty, r: 150, t: 0, dur: 0.85, tick: 0 };
        e.px = e.x; e.py = e.y;
        g.zones.push(e.pz);
        g.audio.play('telegraph');
      }
    }
  }
  else if (d > 520) steer(e, p.x, p.y, 150, 2, dt);
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
  e.armor = e.anchors.length >= 4 ? 0.5 : 1;          // the web shields its maker

  e.timer -= dt;
  if (e.timer <= 0 && !e.pz) {
    e.atk = (e.atk + 1) % 4;
    if (e.atk === 2) {                      // pounce
      const tx = clamp(p.x + p.vx * 0.45, -ARENA.hw + 80, ARENA.hw - 80), ty = clamp(p.y + p.vy * 0.45, -ARENA.hh + 80, ARENA.hh - 80);
      e.pz = { kind: 'blast', x: tx, y: ty, r: 150, t: 0, dur: 1.05, tick: 0 };
      e.px = e.x; e.py = e.y;
      e.chain = rage ? 2 : 0;
      g.zones.push(e.pz);
      g.audio.play('telegraph');
      e.timer = rage ? 1.6 : 2.1;
    } else if (e.atk === 3) {               // egg sacs that hatch unless you break them
      const sacs = g.enemies.filter((o) => o.type === 'sac' && !o.dead).length;
      for (let i = sacs; i < 2; i++) {
        const sa = g.rng.angle(), sx = clamp(e.x + Math.cos(sa) * 120, -ARENA.hw + 60, ARENA.hw - 60), sy = clamp(e.y + Math.sin(sa) * 120, -ARENA.hh + 60, ARENA.hh - 60);
        const sc = spawnEnemy(g, 'sac', sx, sy, { spawn: 0.4, hpScale: 1 });
        sc.hp = sc.maxHp = Math.max(60, e.maxHp * 0.035);
        sc.hatch = 5;
      }
      e.timer = 1.2;
    } else if (e.atk === 0) {               // sticky silk where you're heading
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
  if (an.length && !e.pz) {                   // the Weaver lets go of its own thread mid-pounce
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

function aiSac(g, e, dt) {
  e.hatch -= dt;
  e.rot += dt * (1 + 4 * Math.max(0, 1 - e.hatch / 5));
  if (e.hatch <= 0) {
    for (let i = 0; i < 5; i++) spawnEnemy(g, 'mote', e.x + g.rng.range(-20, 20), e.y + g.rng.range(-20, 20), { spawn: 0.15 });
    g.zones.push({ kind: 'web', x: e.x, y: e.y, r: 130, t: 0, dur: 6, tick: 0, land: 0.05 });
    g.fx.burst(e.x, e.y, COL.lime, 20, 300, 0.5, 4);
    g.audio.play('enemyBurst');
    g.killEnemy(e, true);
  }
}

function aiAnchor(g, e, dt) {
  const p = g.player, d = Math.hypot(p.x - e.x, p.y - e.y);
  if (d > 200) steer(e, p.x, p.y, 58, 1.5, dt);      // the cage tightens else { e.vx = damp(e.vx, 0, 3, dt); e.vy = damp(e.vy, 0, 3, dt); }
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
      if (rage) {                                // double pendulum: a second swing behind it
        e.pend2 = g.addLaser({ x: e.x, y: e.y, ang: a + Math.PI, len: 560, w: 26, warn: 2 * BEAT, dur: 8 * BEAT, owner: e });
        e.pend2.pendulum = true;
        e.pend2.base = a + Math.PI; e.pend2.swing = 1.1;
      }
      g.audio.play('charge');
    }
    // Rubato: rings that stand still between beats and lurch forward on each one
    if (cyc === 10 || (rage && cyc === 5)) {
      for (let i = 0; i < 18; i++) {
        const b = g.fireBullet(e.x, e.y, a + (i / 18) * TAU, 0, { life: 9, r: 9, kind: 'rubato' });
        if (b) e.rb.push(b);
      }
      g.audio.play('enemyBurst');
    }
    e.rb = e.rb.filter((b) => !b.dead);
    for (const b of e.rb) b.spd = 880;
    const every = rage ? 3 : 4;
    if (e.beat % every === 2 % every) stampTiles(g, e, rage);
    if (rage && e.beat % 4 === 1) g.ringBullets(e.x, e.y, 14, 210, e.beat * 0.26);
    g.fx.ring(e.x, e.y, COL.amber, e.r, e.r * 1.3, 0.2, 2);
  }
  if (e.pend && !e.pend.dead) {
    e.pendT += dt;
    e.pend.ang = e.pendBase + Math.sin(e.pendT * Math.PI / (4 * BEAT)) * 1.1;   // one swing every 4 beats
    e.pend.base = e.pendBase;
    if (e.pend2 && !e.pend2.dead) { e.pend2.ang = e.pend.ang + Math.PI; e.pend2.base = e.pendBase + Math.PI; }
  }
  for (const b of e.rb) {
    b.spd = damp(b.spd, 0, 9, dt);
    b.vx = Math.cos(b.ang) * b.spd; b.vy = Math.sin(b.ang) * b.spd;
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
  const phase = f > 0.66 ? 1 : f > 0.33 ? 2 : f > 0.1 ? 3 : 4;
  if (phase !== e.phase) {
    e.phase = phase;
    if (phase > 1) {
      for (const b of g.bullets) b.dead = true;
      g.fx.shock(e.x, e.y, 1.8, 1100, 0.9);
      g.fx.burst(e.x, e.y, COL.gold, 70, 800, 1, 7, 1);
      g.fx.shake(14);
      g.audio.play('bossRoar');
      g.ui.banner(['', '', 'TOTALITY', 'DIAMOND RING', 'LAST LIGHT'][phase], phase === 2 ? 'the light wanders: stay inside it' : '', 'warn');
    }
    e.state = 0; e.timer = 1.4;
  }
  const late = phase >= 3, pace = phase === 4 ? 0.55 : 0.8;   // pauses between attacks
  // darkness and the pool of light
  const pulse = late ? 0.5 + 0.5 * Math.cos((g.time / BEAT) * Math.PI * 2) : 0;
  const blk = e.state === 8;
  const target = blk ? 0.97 : phase === 1 ? 0.78 : phase === 2 ? 0.9 : 0.55 + 0.35 * pulse;
  e.darkK = damp(e.darkK, e.spawn > 0 ? 0 : target, blk ? 3 : 1.5, dt);
  const lightR = blk ? 170 : phase === 2 ? 290 : phase === 3 ? 360 : 320;
  e.lightR = damp(e.lightR || 600, lightR, 1.2, dt);
  // from Totality on the light no longer follows you: it wanders, and the dark hurts
  if (e.lx === undefined) { e.lx = p.x; e.ly = p.y; }
  if (phase === 1 || blk) {
    e.lx = damp(e.lx, p.x, blk ? 6 : 10, dt); e.ly = damp(e.ly, p.y, blk ? 6 : 10, dt);
  } else {
    if (!e.wander || Math.hypot(e.wander.x - e.lx, e.wander.y - e.ly) < 30) {
      const a = g.rng.angle(), d = g.rng.range(300, 650);
      e.wander = { x: clamp(e.lx + Math.cos(a) * d, -ARENA.hw + 320, ARENA.hw - 320), y: clamp(e.ly + Math.sin(a) * d, -ARENA.hh + 320, ARENA.hh - 320) };
    }
    const wx = e.wander.x - e.lx, wy = e.wander.y - e.ly, wd = Math.hypot(wx, wy) || 1;
    const ws = (phase === 2 ? 85 : 110) * dt;
    e.lx += (wx / wd) * Math.min(ws, wd); e.ly += (wy / wd) * Math.min(ws, wd);
    const out = Math.hypot(p.x - e.lx, p.y - e.ly) > e.lightR - 10;
    if (out && !p.dead) {
      e.darkT = (e.darkT || 0) + dt;
      if (e.darkT > 0.4 && !e.darkWarn) { e.darkWarn = true; g.fx.text(p.x, p.y - 50, 'THE DARK BURNS', COL.red, 12, 0.8); }
      if (e.darkT >= 1.5) { e.darkT = 0.6; g.hurtPlayer(1, e.lx, e.ly); }
    } else { e.darkT = Math.max(0, (e.darkT || 0) - dt * 2); e.darkWarn = false; }
  }
  g.dark = { x: e.lx, y: e.ly, r: e.lightR, k: e.darkK };
  e.reveal = Math.max(0, (e.reveal || 0) - dt * 1.2);
  e.rot += dt * 0.4;

  if (e.state !== 2 && e.state !== 3) {           // stalk at the edge of the light
    e.oa = (e.oa ?? Math.atan2(e.y - e.ly, e.x - e.lx)) + dt * 0.45 * e.odir;
    const R = e.lightR + 150;
    steer(e, e.lx + Math.cos(e.oa) * R, e.ly + Math.sin(e.oa) * R, 260, 2.2, dt);
  }

  e.timer -= dt;
  switch (e.state) {
    case 0: {                                   // choose
      if (e.timer > 0) break;
      const opts = phase === 1 ? [1, 2, 1, 11] : phase === 2 ? [1, 2, 4, 5, 8, 9, 11] : [1, 6, 7, 2, 4, 8, 9, 10, 10, 11];
      let pick = g.rng.pick(opts);
      if (pick === e.last) pick = g.rng.pick(opts);
      e.last = pick;
      if (pick === 1) { e.state = 2; e.timer = 0.75; e.count = phase + 1; g.audio.play('telegraph'); twinLunge(g, e); }
      else if (pick === 2) { e.state = 4; e.count = phase + 1; e.timer = 0.1; }
      else if (pick === 4) { e.state = 5; e.count = 4 + phase; e.timer = 0.1; }
      else if (pick === 5) {
        const decoys = g.enemies.filter((o) => o.type === 'umbra' && !o.dead && !o.twin).length;
        for (let i = decoys; i < 2; i++) {
          const a = g.rng.angle(), u = spawnEnemy(g, 'umbra', p.x + Math.cos(a) * (e.lightR + 160), p.y + Math.sin(a) * (e.lightR + 160), { spawn: 0.6, hpScale: 1 });
          u.odir = g.rng.sign();
        }
        e.state = 0; e.timer = 1.2 * pace;
      } else if (pick === 6) {                    // rotating corona lasers
        const a0 = g.rng.angle(), dir = g.rng.sign(), n = phase === 4 ? 6 : 4;
        for (let i = 0; i < n; i++) g.addLaser({ x: e.x, y: e.y, ang: a0 + (i / n) * TAU, len: 1300, w: 26, warn: 1.2, dur: 3, owner: e, spin: dir * 0.42 });
        e.reveal = 1; g.audio.play('charge');
        e.state = 0; e.timer = 4.2 * pace;
      } else if (pick === 8) {                    // Blackout: the light all but goes out
        e.state = 8; e.timer = 3.8; e.eyeT = 0.6;
        g.ui.banner('BLACKOUT', '', 'warn');
        g.audio.play('bossRoar');
      } else if (pick === 9) {                    // coronal mass ejection: walls of fire with a gap
        wallBullets(g);
        if (phase >= 2) g.delayed.push({ t: 1.6, fn: () => { if (!e.dead) wallBullets(g); } });
        if (phase === 4) g.delayed.push({ t: 3.2, fn: () => { if (!e.dead) wallBullets(g); } });
        e.reveal = 1;
        g.audio.play('enemyBurst');
        e.state = 0; e.timer = (phase >= 2 ? 3 : 2.4) * pace;
      } else if (pick === 10) {                   // Baily's Beads: beads around the light fire chords in turn
        bailysBeads(g, e);
        e.state = 0; e.timer = 3.6 * pace;
      } else if (pick === 11) {                   // Penumbra: rings with a turning gap
        e.state = 11; e.count = phase === 1 ? 2 : 3 + (phase === 4 ? 1 : 0); e.timer = 0.2;
        e.gapA = toPlayer(g, e) + g.rng.range(-0.6, 0.6); e.gapDir = g.rng.sign();
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
        if (e.count > 0) { e.state = 2; e.timer = 0.6; g.audio.play('telegraph'); twinLunge(g, e); }
        else { e.state = 0; e.timer = (late ? 0.8 : 1.1) * pace; e.odir = g.rng.sign(); }
      }
      break;
    case 4:                                     // corona flares
      if (e.timer <= 0) {
        g.ringBullets(e.x, e.y, phase === 1 ? 18 : 22, 230, g.rng.angle());
        g.fx.ring(e.x, e.y, COL.gold, e.r, e.r * 2.6, 0.4, 5);
        e.reveal = 1;
        g.audio.play('enemyBurst');
        e.count--; e.timer = 0.6;
        if (e.count <= 0) { e.state = 0; e.timer = 1 * pace; }
      }
      break;
    case 5:                                     // slams from the dark
      if (e.timer <= 0) {
        slam(g, 115, 0.45, 0.8, 60);
        e.count--; e.timer = 0.38;
        if (e.count <= 0) { e.state = 0; e.timer = 0.9 * pace; }
      }
      break;
    case 8: {                                   // eyes open in the dark around you, then fire
      e.eyeT -= dt;
      if (e.eyeT <= 0) {
        e.eyeT = late ? 0.42 : 0.55;
        const a = g.rng.angle();
        e.eyes.push({ x: p.x + Math.cos(a) * 330, y: p.y + Math.sin(a) * 330, t: 0 });
        g.audio.play('telegraph');
      }
      if (e.timer <= 0) { e.state = 0; e.timer = 1.2 * pace; }
      break;
    }
    case 11:                                    // Penumbra
      if (e.timer <= 0) {
        const n = 30, gapN = 5;
        for (let i = 0; i < n; i++) {
          const da = (i / n) * TAU;
          let off = (da - e.gapA) % TAU;
          if (off > Math.PI) off -= TAU; else if (off < -Math.PI) off += TAU;
          if (Math.abs(off) < (gapN / n) * Math.PI) continue;
          g.fireBullet(e.x, e.y, da, 210, { r: 8, life: 7 });
        }
        g.fx.ring(e.x, e.y, COL.gold, e.r, e.r * 3, 0.4, 4);
        e.reveal = 1;
        g.audio.play('enemyBurst');
        e.gapA += e.gapDir * 0.75;
        e.count--; e.timer = 0.55;
        if (e.count <= 0) { e.state = 0; e.timer = 1.1 * pace; }
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
      if (e.timer <= 0) { e.state = 0; e.timer = 1.2 * pace; }
      break;
    }
  }
  if (e.state !== 2) e.flare = Math.max(0, (e.flare || 0) - dt * 3);
  for (const ey of e.eyes) {
    ey.t += dt;
    if (ey.t >= 0.6 && !ey.done && !ey.bead) {
      ey.done = true;
      const a = Math.atan2(p.y - ey.y, p.x - ey.x);
      for (let i = -1; i <= 1; i++) g.fireBullet(ey.x, ey.y, a + i * 0.16, 310);
    }
  }
  e.eyes = e.eyes.filter((ey) => ey.t < 0.9);
}

/** From Totality on, a shadow twin lunges from the opposite side at the same moment. */
function twinLunge(g, e) {
  if (e.phase < 2) return;
  const p = g.player, dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
  const R = clamp(d, 380, 620);
  const x = clamp(p.x + (dx / d) * R, -ARENA.hw + 60, ARENA.hw - 60), y = clamp(p.y + (dy / d) * R, -ARENA.hh + 60, ARENA.hh - 60);
  const u = spawnEnemy(g, 'umbra', x, y, { spawn: 0.05, hpScale: 1 });
  u.twin = true; u.state = 1; u.timer = e.timer; u.flare = 1; u.da = Math.atan2(p.y - y, p.x - x);
  g.fx.ring(x, y, COL.gold, 20, 90, 0.4, 3);
}

/** Baily's Beads: eight beads ring the light and, one after another, fire a chord across it. */
function bailysBeads(g, e) {
  const R = e.lightR * 0.92, a0 = g.rng.angle(), dir = g.rng.sign(), n = 8, skip = 3;
  for (let i = 0; i < n; i++) {
    const a = a0 + dir * (i / n) * TAU, b = a + dir * (skip / n) * TAU;
    const x1 = e.lx + Math.cos(a) * R, y1 = e.ly + Math.sin(a) * R;
    const x2 = e.lx + Math.cos(b) * R, y2 = e.ly + Math.sin(b) * R;
    const ang = Math.atan2(y2 - y1, x2 - x1), len = Math.hypot(x2 - x1, y2 - y1);
    g.addLaser({ x: x1 - Math.cos(ang) * 200, y: y1 - Math.sin(ang) * 200, ang, len: len + 400, w: 24, warn: 0.9 + i * 0.28, dur: 0.3 });
    e.eyes.push({ x: x1, y: y1, t: -(0.3 + i * 0.28), bead: true });
  }
  e.reveal = 1;
  g.audio.play('charge');
}

/** A wall of bullets from the roomiest side of the arena, with one gap near the player. */
function wallBullets(g) {
  const p = g.player;
  const room = [ARENA.hw - p.x, ARENA.hw + p.x, ARENA.hh - p.y, ARENA.hh + p.y];   // +x, -x, +y, -y
  let k = 0;
  for (let i = 1; i < 4; i++) if (room[i] > room[k]) k = i;
  const horiz = k < 2, sgn = k % 2 === 0 ? 1 : -1;
  const dist = Math.min(900, room[k] - 30);
  const ang = horiz ? (sgn > 0 ? Math.PI : 0) : (sgn > 0 ? -Math.PI / 2 : Math.PI / 2);
  const span = horiz ? ARENA.hh : ARENA.hw, along = horiz ? p.y : p.x;
  const gap = clamp(along + g.rng.range(-240, 240), -span + 150, span - 150);
  for (let s = -span + 30; s <= span - 30; s += 62) {
    if (Math.abs(s - gap) < 115) continue;
    const x = horiz ? p.x + sgn * dist : s, y = horiz ? s : p.y + sgn * dist;
    g.fireBullet(x, y, ang, 235, { life: 10, r: 9 });
  }
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
    if (e.timer <= 0) {
      if (e.twin) { g.killEnemy(e, true); return; }    // a twin is only a shadow of one lunge
      e.state = 0; e.timer = g.rng.range(2.5, 4); e.flare = 0;
    }
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
    ...bossBase, name: 'BINARY', hp: 11500, speed: 0, r: 52, xp: 90, col: 'amber', score: 4000, ai: aiBinary, noMove: true,
    init(g, e, o) {
      e.idx = o.idx || 0;
      e.ctl = o.ctl || { x: e.x, y: e.y, ang: 0, rad: 250, t: 0, frame: -1, beam: null };
      e.timer = 2.5 + e.idx * 0.6;
    },
  },
  ouroboros: {
    ...bossBase, name: 'OUROBOROS', hp: 57000, speed: 330, r: 44, xp: 220, col: 'teal', score: 6000, ai: aiOuroboros, noMove: true,
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
    ...bossBase, name: 'THE HOLLOW HEART', hp: 115000, speed: 110, r: 70, xp: 400, col: 'hot', score: 12000, ai: aiHollow, noMove: true,
    init(g, e) { e.phase = 1; e.timer = 2.5; e.last = 0; },
  },

  shatter: {
    ...bossBase, name: 'SHATTERHEART', hp: 3900, speed: 120, r: 64, xp: 130, col: 'ice', score: 4000, ai: aiShatter,
    init(g, e) { e.shards = []; e.broken = 0; e.atk = -1; e.timer = 2; e.armor = 1; },
    onDeath(g, e) { for (const s of e.shards) if (!s.dead) g.killEnemy(s, true); },
  },
  shard: { hp: 100, speed: 330, r: 22, xp: 6, threat: 0, col: 'ice', ai: aiShard, noCharm: true, noElite: true, heavy: true, noSep: true, score: 300 },
  weaver: {
    ...bossBase, name: 'THE WEAVER', hp: 21500, speed: 150, r: 56, xp: 100, col: 'lime', score: 4000, ai: aiWeaver,
    init(g, e) { e.anchors = []; e.anchorT = 1.2; e.weave = 0; e.reweaveT = 0; e.armor = 1; e.threads = new Map(); e.atk = -1; e.timer = 2.5; },
    onDeath(g, e) {
      for (const a of e.anchors) if (!a.dead) g.killEnemy(a, true);
      for (const l of e.threads.values()) l.dead = true;
      for (const z of g.zones) if (z.kind === 'web') z.dead = true;
      for (const o of g.enemies) if (o.type === 'sac' && !o.dead) g.killEnemy(o, true);
    },
  },
  sac: { hp: 60, speed: 0, r: 20, xp: 3, threat: 0, col: 'lime', ai: aiSac, noMove: true, noCharm: true, noElite: true, heavy: true, noSep: true, contact: false, score: 80 },
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
    ...bossBase, name: 'THE METRONOME', hp: 50000, speed: 110, r: 62, xp: 220, col: 'amber', score: 6000, ai: aiMetronome,
    init(g, e) { e.beat = -1; e.bar = 0; e.pend = null; e.pend2 = null; e.rb = []; e.timer = 1; },
  },
  eclipse: {
    ...bossBase, name: 'THE ECLIPSE', hp: 240000, speed: 260, r: 66, xp: 500, col: 'gold', score: 15000, ai: aiEclipse,
    init(g, e) { e.phase = 0; e.timer = 2.5; e.darkK = 0; e.odir = 1; e.last = 0; e.eyes = []; },
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
