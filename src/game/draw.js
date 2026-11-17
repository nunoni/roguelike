// Turns simulation state into shape instances. Read-only with respect to the game.

import { COL, PLAYER, BPM } from '../config.js';
import { TAU, clamp } from '../core/math.js';

const S = [0, 0, 0];
function tint(c, w, k) {
  S[0] = c[0] + (w[0] - c[0]) * k; S[1] = c[1] + (w[1] - c[1]) * k; S[2] = c[2] + (w[2] - c[2]) * k;
  return S;
}
const ENVY = [0.45, 1.0, 0.35];
const BUTTERFLY = [0.55, 0.3, 1.0];
const ELITE_COL = { swift: COL.white, armored: COL.blue, volatile: COL.red, regen: COL.lime };

export function drawGame(g, B, glyphs) {
  const t = g.time, cam = g.cam;
  const vx = g.viewHalf.x + 160, vy = g.viewHalf.y + 160;
  const vis = (x, y, m = 0) => Math.abs(x - cam.x) < vx + m && Math.abs(y - cam.y) < vy + m;
  const beat = Math.exp(-((t * BPM / 60) % 1) * 5);

  drawZones(g, B, t, vis);
  drawLasers(g, B, t);
  drawPickups(g, B, t, vis);
  drawStrings(g, B, t);
  for (const e of g.enemies) if (!e.dead && vis(e.x, e.y, e.r + 700)) drawEnemy(g, B, e, t, beat);
  drawProjectiles(g, B, t, vis);
  drawBullets(g, B, t, vis);
  drawAllies(g, B, t);
  drawPlayer(g, B, t, beat);

  const b = g.bombRing;
  if (b) {
    const a = 1 - b.r / b.max;
    B.push(2, b.x, b.y, b.r, b.r, -Math.PI / 2, COL.pink, a * 1.5 + 0.2, 7, 0, 1);
    B.ring(b.x, b.y, b.r * 0.86, COL.white, a, 2.5, 1);
  }
  drawPointers(g, B, t);
}

// ------------------------------------------------------------------ floor effects
function drawZones(g, B, t, vis) {
  for (const z of g.zones) {
    if (z.dead || !vis(z.x, z.y, z.r)) continue;
    const k = clamp(z.t / z.dur, 0, 1);
    switch (z.kind) {
      case 'blast': {
        const fl = 0.5 + 0.5 * Math.sin(t * 30);
        B.ring(z.x, z.y, z.r, COL.red, 0.7 + 0.3 * fl, 2.5, 1);
        B.push(0, z.x, z.y, z.r * k, z.r * k, 0, COL.red, 0.5, 0, 0.35 + 0.25 * fl, 0);
        break;
      }
      case 'meteor': {
        if (z.t < 0) break;                       // queued (Singularity)
        B.ring(z.x, z.y, z.r * (1 - k * 0.6), COL.gold, 0.5 + k * 0.5, 2, 0.6);
        const sx = z.x - 260 * (1 - k), sy = z.y - 520 * (1 - k);
        B.star(sx, sy, 20, 5, t * 9, COL.gold, 1, 2.5, 0.9, 1, 0);
        B.glow(sx - 26, sy - 52, 90, 12, Math.atan2(520, 260), COL.gold, 0.9);
        break;
      }
      case 'well': {
        const fade = Math.min(1, z.t * 4) * Math.min(1, (z.dur - z.t) * 3);
        B.circle(z.x, z.y, 24 + 6 * Math.sin(t * 9), COL.violet, fade, 3, 0, 1, 1);
        for (let i = 0; i < 4; i++) {
          const rr = z.r * (1 - ((t * 0.7 + i / 4) % 1));
          B.ring(z.x, z.y, rr, COL.violet, fade * 0.55 * (1 - rr / z.r), 2, 0.7);
        }
        for (let i = 0; i < 3; i++) B.arc(z.x, z.y, z.r * 0.55, t * 2.6 + (i / 3) * TAU, 0.6, 2.5, COL.pink, fade * 0.7, 1);
        break;
      }
      case 'fire': {
        const fade = Math.min(1, (z.dur - z.t) * 2);
        const fl = 0.75 + 0.25 * Math.sin(t * 17 + z.x);
        B.glow(z.x, z.y, z.r * 1.25, z.r * 1.25, 0, COL.orange, 0.5 * fade * fl);
        B.ring(z.x, z.y, z.r * (0.85 + 0.1 * fl), COL.amber, 0.45 * fade, 1.5, 0.5);
        break;
      }
      case 'trail': {
        const fade = 1 - k;
        B.glow(z.x, z.y, z.r * 1.3, z.r * 1.3, 0, COL.gold, 0.5 * fade);
        if ((z.x * 7 + z.y * 3 | 0) % 3 === 0) B.star(z.x, z.y, 7 * fade + 2, 4, t * 3 + z.x, COL.gold, fade, 1, 0.8, 0, 0);
        break;
      }
      case 'after': {
        const fade = 1 - k;
        B.heart(z.x, z.y, 22 * (0.8 + 0.2 * fade), z.ang, COL.pink, fade * 0.8, 2, 0.25, 1, 0);
        break;
      }
    }
  }
}

function drawLasers(g, B, t) {
  for (const l of g.lasers) {
    if (l.dead) continue;
    const x2 = l.x + Math.cos(l.ang) * l.len, y2 = l.y + Math.sin(l.ang) * l.len;
    if (l.t < l.warn) {
      const k = l.t / l.warn;
      const fl = 0.5 + 0.5 * Math.sin(t * (14 + k * 40));
      B.line(l.x, l.y, x2, y2, 1.2 + k * 2, COL.red, (0.25 + 0.5 * k) * (0.6 + 0.4 * fl), 0.5);
    } else {
      const fl = 0.85 + 0.15 * Math.sin(t * 60);
      B.line(l.x, l.y, x2, y2, l.w * 0.5 * fl, COL.red, 1.3, 1);
      B.line(l.x, l.y, x2, y2, l.w * 0.2, COL.white, 1.2, 0);
    }
  }
}

function drawPickups(g, B, t, vis) {
  for (const k of g.pickups) {
    if (k.dead || !vis(k.x, k.y)) continue;
    if (k.kind === 'xp') {
      const s = 4.5 + Math.min(4, k.val);
      B.box(k.x, k.y, s, s, t * 3 + k.x * 0.01, COL.teal, 1, 1.4, 0.7, 1, 0, 1);
    } else if (k.kind === 'heart') {
      B.heart(k.x, k.y, 13 + Math.sin(t * 6) * 2, -Math.PI / 2, COL.rose, 1, 2, 0.7, 1);
    } else {
      const s = 26 + Math.sin(t * 5) * 3;
      B.ring(k.x, k.y, 44 + Math.sin(t * 3) * 4, COL.gold, 0.7, 2, 1);
      B.heart(k.x, k.y, s, -Math.PI / 2, COL.rose, 1, 3, 0.8, 1);
      B.star(k.x, k.y - 4, 9, 4, t * 2, COL.white, 1, 0, 1, 0, 0);
    }
  }
}

// ------------------------------------------------------------------ enemies
function drawEnemy(g, B, e, t, beat) {
  const def = e.def;
  let base = COL[def.col] || COL.cyan;
  if (e.spawn > 0) {                         // warp-in portal
    const k = clamp(1 - e.spawn / (e.boss ? 2 : 0.8), 0, 1);
    B.ring(e.x, e.y, e.r * (2.6 - 1.6 * k), base, 0.35 + 0.5 * k, 2, 1);
    B.push(0, e.x, e.y, e.r * k, e.r * k, 0, base, 0.5 * k, 0, 0.6, 1);
    if (e.boss) for (let i = 0; i < 3; i++) B.arc(e.x, e.y, e.r * (3.4 - 1.6 * k), t * 3 + (i / 3) * TAU, 0.7, 3, base, 0.8, 1);
    return;
  }
  let a = 1;
  if (e.faded) a = 0.13 + 0.05 * Math.sin(t * 8 + e.seed * 10);
  // status tinting
  let c = base;
  if (e.charm > 0) c = COL.rose;
  else if (e.frozen > 0) c = COL.ice;
  else if (e.chill > 0.05) c = tint(base, COL.ice, Math.min(1, e.chill * 1.3)).slice();
  if (e.flash > 0) c = tint(c, COL.white, e.flash).slice();
  const x = e.x, y = e.y, r = e.r, rot = e.rot;

  switch (e.type) {
    case 'drifter':
      B.ngon(x, y, r * 1.15, 3, rot, c, a, 2, 0.3);
      B.ngon(x, y, r * 0.45, 3, rot + Math.PI, c, a, 0, 0.9, 0, 0);
      break;
    case 'mote':
      B.box(x, y, r * 0.85, r * 0.85, rot, c, a, 1.6, 0.6, 1, 0.6, 1);
      break;
    case 'lancer':
      if (e.state === 1) {
        const k = 1 - e.timer / 0.7;
        B.line(x, y, x + Math.cos(rot) * 560, y + Math.sin(rot) * 560, 1 + k * 2.5, COL.orange, 0.25 + 0.6 * k, 0.4);
      }
      if (e.state === 2) B.glow(x - Math.cos(rot) * 34, y - Math.sin(rot) * 34, 60, 12, rot, COL.orange, 1);
      B.chevron(x, y, r * 1.25, rot, e.state === 1 ? tint(c, COL.white, 0.5 + 0.5 * Math.sin(t * 40)) : c, a, 2.2, 0.35);
      break;
    case 'spitter':
      B.ngon(x, y, r * 1.1, 5, rot, c, a, 2, 0.25);
      B.circle(x + Math.cos(rot) * r * 0.45, y + Math.sin(rot) * r * 0.45, r * 0.3, c, a, 0, 1, e.timer < 0.4 ? 1 : 0, 0);
      break;
    case 'splitter':
      B.ngon(x, y, r * 1.08, 6, rot, c, a, 2.4, 0.2);
      if (e.gen < 2) B.ngon(x, y, r * 0.6, 6, -rot * 1.5, c, a, 1.6, 0.15, 0, 0);
      if (e.gen < 1) B.ngon(x, y, r * 0.28, 6, rot * 2, c, a, 0, 0.9, 0, 0);
      break;
    case 'bomber': {
      const arming = e.state === 1;
      const pul = arming ? 0.5 + 0.5 * Math.sin(t * 50) : 0.5 + 0.5 * Math.sin(t * 8 + e.seed * 9);
      B.circle(x, y, r * (1 + 0.08 * pul), arming ? tint(c, COL.white, pul) : c, a, 2.2, 0.25 + 0.3 * pul);
      B.plus(x, y, r * 0.5, rot, c, a, 0, 1, 0, 0);
      break;
    }
    case 'warden': {
      B.box(x, y, r * 0.9, r * 0.9, rot + Math.PI / 4, c, a, 2.4, 0.25, 1, 0.8, 5);
      B.circle(x, y, r * 0.3, c, a, 0, 1, 0, 0);
      const sh = def.shieldArc, hit = Math.max(0, e.shieldHit || 0);
      if (e.shieldHp <= 0) {
        const k = (e.shieldDown || 0) / 4;
        B.arc(x, y, sh.r, rot, sh.half * k, 1.2, COL.blue, a * 0.4, 0);
        break;
      }
      B.arc(x, y, sh.r, rot, sh.half, 3.5 + hit * 3, tint(COL.blue, COL.white, hit), a * (0.85 + hit), 1);
      B.arc(x, y, sh.r - 8, rot, sh.half * 0.8, 1.2, COL.cyan, a * 0.5, 0);
      break;
    }
    case 'pinwheel': {
      const firing = e.state === 1;
      B.star(x, y, r * 1.35, 3, rot, firing ? tint(c, COL.white, 0.35) : c, a, 2.4, firing ? 0.5 : 0.25, 1, 0.8, 0.3);
      B.circle(x, y, r * 0.32, c, a, 1.6, firing ? 1 : 0.4, 0, 0.9);
      break;
    }
    case 'phantom': {
      if (e.state === 1) a = 0.4 + 0.6 * Math.abs(Math.sin(t * 28));
      B.crescent(x, y, r * 1.2, rot, c, a, 2.2, 0.25, e.faded ? 0 : 1, e.faded ? 0 : 0.6);
      if (e.state === 1) B.line(x, y, x + Math.cos(rot) * 330, y + Math.sin(rot) * 330, 1.5, COL.ghost, 0.4, 0.3);
      if (!e.faded) B.circle(x - Math.cos(rot) * r * 0.2, y - Math.sin(rot) * r * 0.2, r * 0.2, c, a, 0, 1, 0, 0);
      break;
    }
    case 'ray': {
      B.box(x, y, r * 1.5, r * 0.55, rot, c, a, 2, 0.3, 1, 0.8, 3);
      const ch = e.state === 1 ? clamp(1 - (e.timer - 0.4) / 1.35, 0, 1) : 0;
      B.circle(x + Math.cos(rot) * r, y + Math.sin(rot) * r, r * (0.28 + 0.4 * ch), tint(c, COL.white, ch), a, 0, 1, ch > 0 ? 1 : 0, 0);
      break;
    }
    case 'leech': {
      B.ring(x, y, r * 1.1, c, a, 2.2, 1);
      B.star(x, y, r * 0.8, 6, rot, c, a, 1.6, 0.4, 0, 0.8, 0.55);
      if (e.tether && !e.charm) {
        const p = g.player, k = ((e.drainT || 0) / 4);
        B.line(x, y, p.x, p.y, 1.4 + k * 1.6, COL.violet, 0.45 + 0.4 * Math.sin(t * 12), 0.5);
        const f = (t * 1.6) % 1;
        B.glow(x + (p.x - x) * (1 - f), y + (p.y - y) * (1 - f), 9, 9, 0, COL.violet, 1);
        if (k > 0.7) B.ring(p.x, p.y, 38 - 10 * Math.sin(t * 25), COL.violet, 0.8, 2, 1);
      }
      break;
    }
    case 'hive': {
      const pul = 0.5 + 0.5 * Math.sin(t * 3 + e.seed * 6);
      B.ngon(x, y, r * 1.05, 8, rot, c, a, 3, 0.18);
      for (let i = 0; i < 3; i++) {
        const an = rot * -2 + (i / 3) * TAU;
        B.ngon(x + Math.cos(an) * r * 0.42, y + Math.sin(an) * r * 0.42, r * 0.26, 6, an, COL.lime, a, 1.4, 0.3 + 0.5 * pul, 0, 0);
      }
      break;
    }
    case 'wyrm':
      B.chevron(x, y, r * 1.35, rot, c, a, 2.6, 0.4);
      B.circle(x + Math.cos(rot) * r * 0.2, y + Math.sin(rot) * r * 0.2, r * 0.22, COL.white, a, 0, 1, 0, 0);
      break;
    case 'wyrmseg':
      B.circle(x, y, r * (0.95 - e.idx * 0.035), c, a, 2, 0.15);
      B.box(x, y, r * 0.3, r * 0.3, rot, c, a, 0, 0.7, 0, 0);
      break;
    case 'ouroseg': {
      const s = r * (1 - e.idx * 0.018);
      B.circle(x, y, s, c, a, 3, 0.15);
      B.ngon(x, y, s * 0.5, 4, rot, c, a, 1.6, 0.5, 0, 0);
      break;
    }
    case 'ouroboros': {
      if (e.state === 1) B.line(x, y, x + Math.cos(rot) * 1300, y + Math.sin(rot) * 1300, 2 + (1 - e.timer / 0.95) * 5, COL.red, 0.5, 0.5);
      B.ngon(x, y, r * 1.25, 5, rot, c, a, 3.5, 0.3);
      B.chevron(x + Math.cos(rot) * r * 0.2, y + Math.sin(rot) * r * 0.2, r * 0.6, rot, COL.white, a, 0, 0.9, 0, 0);
      break;
    }
    case 'plate':
      B.box(x, y, 9, 27, rot, c, a, 2.2, 0.4, 1, 0.9, 4);
      break;
    case 'monolith': {
      const rage = e.hp < e.maxHp * 0.5;
      const cc = rage ? tint(c, COL.hot, 0.6).slice() : c;
      B.ngon(x, y, r * 1.12, 6, rot, cc, a, 4, 0.16);
      B.ngon(x, y, r * 0.72, 6, -rot * 1.6, cc, a, 2.5, 0.12, 0, 0);
      B.ngon(x, y, r * 0.36 * (1 + 0.15 * beat), 6, rot * 2.5, rage ? COL.hot : COL.white, a, 0, 0.95, 1, 0);
      break;
    }
    case 'binary': {
      const cc = e.idx === 1 ? (e.flash > 0 ? tint(COL.cyan, COL.white, e.flash).slice() : COL.cyan) : c;
      if (e.enraged && e.state === 1) B.line(x, y, x + Math.cos(e.da) * 1100, y + Math.sin(e.da) * 1100, 2 + (1 - e.timer / 0.75) * 4, COL.red, 0.55, 0.5);
      B.star(x, y, r * 1.3, 8, rot, cc, a, 3, 0.25, 1, 0.8, 0.72);
      B.circle(x, y, r * 0.5 * (1 + 0.12 * beat), e.enraged ? COL.white : cc, a, 0, 1, 1, 0);
      if (e.enraged) B.ring(x, y, r * 1.6 + 6 * Math.sin(t * 20), COL.red, 0.7, 2, 1);
      break;
    }
    case 'hollow': {
      const thump = Math.exp(-(e.pulse || 0) * 4);
      const s = r * (1.15 + 0.14 * thump + 0.04 * beat);
      if (e.state === 4 && e.sub === 0) B.line(x, y, x + Math.cos(e.da) * 1200, y + Math.sin(e.da) * 1200, 2 + (1 - e.timer / 0.7) * 5, COL.red, 0.55, 0.5);
      B.ring(x, y, s * 1.55, COL.dark, 0.6, 2, 1);
      B.broken(x, y, s, rot, e.flash > 0 ? tint(COL.hot, COL.white, e.flash) : COL.hot, a, 4, 0.1, 1, 1);
      B.heart(x, y, s * 0.42, rot, COL.violet, a, 2, 0.6 + 0.4 * thump, 1, 0);
      if (e.state === 3) for (let i = 0; i < 3; i++) B.ring(x, y, 520 * (1 - ((t * 0.9 + i / 3) % 1)), COL.violet, 0.3, 2, 0.6);
      break;
    }
    default:
      B.circle(x, y, r, c, a);
  }

  if (e.elite) {
    const ec = ELITE_COL[e.elite];
    B.ring(x, y, r * 1.55 + 2 * Math.sin(t * 6 + e.seed * 5), ec, 0.75, 1.6, 1);
    for (let i = 0; i < 3; i++) {
      const an = t * 2.2 + (i / 3) * TAU;
      B.star(x + Math.cos(an) * r * 1.55, y + Math.sin(an) * r * 1.55, 5, 4, an, ec, 1, 0, 1, 0, 0);
    }
  }
  if (e.frozen > 0) B.ngon(x, y, r * 1.35, 6, e.seed * 6, COL.ice, 0.9, 1.8, 0.18, 1, 0);
  if (e.charm > 0) B.heart(x, y - r - 14 - 3 * Math.sin(t * 6), 7, -Math.PI / 2, COL.rose, 1, 0, 1, 1, 0);
  else if (e.envy > 0) {                       // Jealousy: green broken heart with stack ticks
    const my = y - r - 13, fa = Math.min(1, e.envyT * 2);
    B.broken(x, my, 6 + e.envy * 0.4, -Math.PI / 2, ENVY, fa, 1.4, 0.6, 1, 0);
    for (let k = 0; k < e.envy; k++) B.box(x - 12.5 + k * 5, my - 10, 1.6, 1.6, 0, ENVY, fa, 0, 1, 1, 0);
  }
  // health bar on anything sturdy that has been hurt
  if (!e.boss && !e.transfer && e.maxHp > 80 && e.hp < e.maxHp && e.type !== 'plate') {
    const w = r * 1.1, f = clamp(e.hp / e.maxHp, 0, 1);
    B.line(x - w, y + r + 12, x - w + 2 * w * f, y + r + 12, 1.6, f > 0.4 ? COL.white : COL.red, 0.8, 0);
  }
}

// ------------------------------------------------------------------ shots
function drawProjectiles(g, B, t, vis) {
  for (const p of g.projs) {
    if (p.dead || !vis(p.x, p.y)) continue;
    const c = Math.cos(p.ang), s = Math.sin(p.ang);
    const a = Math.min(1, p.life * 8);
    if (p.kind === 'heart' && p.beat) {         // On the Beat
      B.glow(p.x - c * 24, p.y - s * 24, 40, 11, p.ang, COL.gold, 0.9 * a);
      B.heart(p.x, p.y, p.r + 3, p.ang, COL.gold, a, 2.4, 0.8, 1.3, 0);
    } else if (p.kind === 'heart') {
      B.glow(p.x - c * 20, p.y - s * 20, 30, 8, p.ang, COL.hot, 0.8 * a);
      B.heart(p.x, p.y, p.r + 2, p.ang, COL.pink, a, 2, 0.75, 1, 0);
    } else if (p.kind === 'half') {
      B.glow(p.x - c * 12, p.y - s * 12, 18, 5, p.ang, COL.rose, 0.7 * a);
      B.broken(p.x, p.y, p.r + 1, p.ang, COL.rose, a, 1.5, 0.8, 0, 0);
    } else if (p.kind === 'shard') {
      B.box(p.x, p.y, 11, 3.2, p.ang, COL.ice, a, 0, 1, 1, 0, 1);
    } else {
      B.glow(p.x - c * 12, p.y - s * 12, 18, 5, p.ang, COL.pink, 0.7 * a);
      B.heart(p.x, p.y, p.r + 1, p.ang, COL.white, a, 0, 1, 1, 0);
    }
  }
  for (const b of g.beams) {
    const fl = 0.8 + 0.2 * Math.sin(t * 50 + b.x1);
    B.line(b.x1, b.y1, b.x2, b.y2, 7 * fl, COL.pink, 1.2, 1);
    B.line(b.x1, b.y1, b.x2, b.y2, 2.6, COL.white, 1.1, 0);
    const k = (t * 2.5) % 1;
    for (let i = 0; i < 3; i++) {
      const f = (k + i / 3) % 1;
      B.heart(b.x1 + (b.x2 - b.x1) * f, b.y1 + (b.y2 - b.y1) * f, 9, Math.atan2(b.y2 - b.y1, b.x2 - b.x1), COL.white, 1 - f, 0, 1, 0, 0);
    }
  }
  for (const b of g.flashBeams) {
    const a = b.t / b.max;
    B.line(b.x1, b.y1, b.x2, b.y2, 8 * a + 1, COL.rose, a * 1.4, 1);
    B.line(b.x1, b.y1, b.x2, b.y2, 2.5 * a, COL.white, a * 1.3, 0);
  }
}

function drawBullets(g, B, t, vis) {
  for (const b of g.bullets) {
    if (b.dead || !vis(b.x, b.y)) continue;
    const a = Math.min(1, b.t * 10) * Math.min(1, b.life * 3);
    if (b.kind === 'bheart') {
      B.broken(b.x, b.y, b.r + 3, b.ang, COL.hot, a, 2, 0.5, 1, 0.8);
    } else if (b.kind === 'mine') {
      const pul = 0.5 + 0.5 * Math.sin(t * 7 + b.x);
      B.star(b.x, b.y, b.r + 3, 4, t * 1.5, COL.amber, a, 1.8, 0.3 + 0.5 * pul, 1, 0.8, 0.5);
    } else {
      B.circle(b.x, b.y, b.r + 1, COL.bullet, a, 1.8, 0.22, 1, 1);
      B.push(0, b.x, b.y, b.r * 0.34, b.r * 0.34, 0, COL.white, a, 0, 0.9, 0);
    }
  }
}

function drawStrings(g, B, t) {
  const live = g.stats.fus.livewire;
  for (const e of g.enemies) {
    if (!(e.tieT > 0) || !e.tie || e.tie.dead || e.dead) continue;
    const o = e.tie;
    if (o.tie === e && o.id < e.id && o.tieT > 0) continue;   // draw each pair once
    const fa = Math.min(1, e.tieT * 2);
    B.line(e.x, e.y, o.x, o.y, 2.2, COL.rose, 0.55 * fa, 1);
    if (live) B.line(e.x, e.y, o.x, o.y, 1.2, COL.ice, (0.4 + 0.6 * Math.abs(Math.sin(t * 31 + e.id))) * fa, 1);
    const k = (t * 0.8 + e.id * 0.37) % 1;      // a heart slides along the string
    B.heart(e.x + (o.x - e.x) * k, e.y + (o.y - e.y) * k, 4.5, -Math.PI / 2, COL.rose, 0.8 * fa, 0, 1, 1, 0);
  }
}

function drawAllies(g, B, t) {
  for (const b of g.butterflies) {
    const c = b.swoop ? COL.gold : BUTTERFLY;
    const f = Math.abs(Math.sin(t * 15 + b.ph * 3));          // wing beat
    const fx = Math.cos(b.ang), fy = Math.sin(b.ang);          // forward
    const nx = -fy, ny = fx;                                     // sideways
    for (const sd of [-1, 1]) {
      const o = 5 + 8 * f;
      // upper wing (big, slightly forward) and lower wing (small, behind)
      B.heart(b.x + nx * sd * o + fx * 3, b.y + ny * sd * o + fy * 3, 9, b.ang + sd * Math.PI / 2 + Math.PI, c, 0.85, 1.6, 0.18, 0.55, 0);
      B.heart(b.x + nx * sd * o * 0.7 - fx * 5, b.y + ny * sd * o * 0.7 - fy * 5, 6, b.ang + sd * Math.PI / 2 + Math.PI, c, 0.8, 1.4, 0.15, 0.5, 0);
    }
    B.line(b.x - fx * 6, b.y - fy * 6, b.x + fx * 6, b.y + fy * 6, 1.8, COL.white, 0.7, 0.2);
    if (b.dart) B.glow(b.x - Math.cos(b.ang) * 14, b.y - Math.sin(b.ang) * 14, 24, 5, b.ang, c, 0.6);
  }
  for (const o of g.orbitals) {
    if (!o) continue;
    B.glow(o.x - Math.cos(o.a + Math.PI / 2) * 12, o.y - Math.sin(o.a + Math.PI / 2) * 12, 22, 7, o.a + Math.PI / 2, COL.rose, 0.7);
    B.heart(o.x, o.y, o.r, o.a + Math.PI / 2, COL.rose, 1, 2, 0.8, 1);
  }
  for (const d of g.drones) {
    const bob = Math.sin(t * 5 + d.slot) * 3;
    const c = d.ghost ? COL.ghost : COL.gold;
    const flap = 0.5 + 0.35 * Math.sin(t * 16 + d.slot * 2);
    // little wings
    B.push(9, d.x - 11, d.y + bob - 3, 9, 5 * flap + 2, -0.5, c, 0.9, 0, 0, 0);
    B.push(9, d.x + 11, d.y + bob - 3, 9, 5 * flap + 2, 0.5, c, 0.9, 0, 0, 0);
    B.heart(d.x, d.y + bob, 9, d.ang, c, d.ghost ? 0.7 : 1, 1.6, 0.6, 1, d.ghost ? 0 : 0.8);
  }
}

function drawPlayer(g, B, t, beat) {
  const p = g.player, st = g.stats;
  if (p.dead) return;
  const R = PLAYER.drawR * (1 + 0.07 * beat);
  let a = 1;
  if (p.invuln > 0 && p.dashT <= 0) a = 0.45 + 0.4 * Math.abs(Math.sin(t * 22));
  const c = Math.cos(p.ang), s = Math.sin(p.ang);

  // aim reticle
  if (!g.attract) {
    B.ring(p.aimX, p.aimY, 11, COL.white, 0.75, 1.3, 0.4);
    B.push(0, p.aimX, p.aimY, 2.2, 2.2, 0, COL.white, 0.9, 0, 1, 0);
  }
  if (p.shield) {
    B.ring(p.x, p.y, R * 1.75 + Math.sin(t * 4) * 1.5, COL.cyan, 0.75, 2, 1);
    for (let i = 0; i < 3; i++) B.arc(p.x, p.y, R * 1.75, t * 1.8 + (i / 3) * TAU, 0.4, 2.6, COL.white, 0.6, 0);
  } else if (st.shield > 0) {
    const k = p.shieldT / (17 - 2.5 * st.shield);
    B.arc(p.x, p.y, R * 1.75, -Math.PI / 2 + Math.PI * k, Math.PI * clamp(k, 0.02, 1), 1.2, COL.cyan, 0.35, 0);
  }
  if (p.dashT > 0) B.glow(p.x - p.dashDx * 46, p.y - p.dashDy * 46, 90, 22, Math.atan2(p.dashDy, p.dashDx), g.stats.fus.comet ? COL.gold : COL.pink, 1.2);
  B.glow(p.x - c * R * 0.9, p.y - s * R * 0.9, 16 + 8 * beat, 9, p.ang, COL.hot, 0.9 * a);
  const hurt = Math.max(0, p.hurtT);
  B.heart(p.x, p.y, R, p.ang, hurt > 0 ? tint(COL.pink, COL.white, hurt) : COL.pink, a, 2.8, 0.35 + 0.25 * beat, 1, 0.9);
  B.heart(p.x + c * 2, p.y + s * 2, R * 0.42, p.ang, COL.white, a, 0, 0.95, 0, 0);
  // dash pips trailing the ship
  for (let i = 0; i < st.dashCharges; i++) {
    const on = i < p.dashCharges;
    const an = p.ang + Math.PI + (i - (st.dashCharges - 1) / 2) * 0.5;
    B.push(0, p.x + Math.cos(an) * (R + 14), p.y + Math.sin(an) * (R + 14), 3, 3, 0, on ? COL.cyan : COL.blue, on ? 1 : 0.35, on ? 0 : 1, on ? 1 : 0, on ? 1 : 0);
  }
}

/** Edge-of-screen pointers toward bosses and the last few stragglers. */
function drawPointers(g, B, t) {
  const cam = g.cam, hx = g.viewHalf.x - 46, hy = g.viewHalf.y - 46;
  let alive = 0;
  for (const e of g.enemies) if (!e.dead && !e.def.untargetable) alive++;
  for (const e of g.enemies) {
    if (e.dead || e.def.untargetable || (!e.boss && alive > 6)) continue;
    const dx = e.x - cam.x, dy = e.y - cam.y;
    if (Math.abs(dx) < hx + 30 && Math.abs(dy) < hy + 30) continue;
    const k = Math.min(hx / Math.abs(dx || 1), hy / Math.abs(dy || 1));
    const col = e.boss ? COL.red : COL[e.def.col] || COL.cyan;
    B.chevron(cam.x + dx * k, cam.y + dy * k, e.boss ? 20 : 12, Math.atan2(dy, dx), col, 0.6 + 0.4 * Math.sin(t * 8), 2, 0.6, 1, 0);
  }
  for (const k of g.pickups) {
    if (k.kind !== 'container' || k.dead) continue;
    const dx = k.x - cam.x, dy = k.y - cam.y;
    if (Math.abs(dx) < hx + 30 && Math.abs(dy) < hy + 30) continue;
    const s = Math.min(hx / Math.abs(dx || 1), hy / Math.abs(dy || 1));
    B.heart(cam.x + dx * s, cam.y + dy * s, 12, -Math.PI / 2, COL.rose, 0.6 + 0.4 * Math.sin(t * 8), 2, 0.8, 1, 0);
  }
}
