// Love Jars: breakable loot that turns up at random during normal waves.
// Break one for a weighted roll: a pile of XP, a heal, an instant level-up,
// or (rarely) the jackpot.

import { ARENA, COL } from '../config.js';
import { clamp } from '../core/math.js';
import { DEFS, spawnEnemy } from './enemies.js';

const LIFE = 22;             // seconds before an unbroken jar fades away

/** Odds: [weight, reward]. Heals turn into XP when you are already at full health. */
const REWARDS = [
  [55, 'xp'],
  [30, 'heal'],
  [12, 'level'],
  [3, 'jackpot'],
];

export function updateLoot(g, dt) {
  const W = g.waves;
  if (W.state !== 'active' || W.boss || g.player.dead) return;
  if (g.jarT === undefined || g.jarWave !== W.n) {          // a fresh timer every wave
    g.jarWave = W.n;
    g.jarT = g.rng.chance(W.n >= 10 ? 0.75 : 0.6) ? g.rng.range(8, 30) : Infinity;
  }
  g.jarT -= dt;
  if (g.jarT > 0) return;
  g.jarT = g.rng.range(45, 70);                             // sometimes a second one in a long wave
  if (g.enemies.some((e) => e.type === 'jar' && !e.dead)) return;
  const p = g.player;
  for (let k = 0; k < 10; k++) {
    const a = g.rng.angle(), d = g.rng.range(320, 650);
    const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
    if (Math.abs(x) > ARENA.hw - 120 || Math.abs(y) > ARENA.hh - 120) continue;
    spawnEnemy(g, 'jar', x, y, { spawn: 0.9 });
    g.fx.text(x, y - 46, 'LOVE JAR', COL.gold, 12, 1.2);
    g.audio.play('shieldUp');
    return;
  }
}

function aiJar(g, e, dt) {
  e.life -= dt;
  e.rot = Math.sin(e.t * 2.2) * 0.12;                      // a little wobble
  if (e.life <= 0) {
    g.fx.burst(e.x, e.y, COL.gold, 10, 160, 0.5, 3);
    g.killEnemy(e, true);
  }
}

function breakJar(g, e) {
  const p = g.player, st = g.stats, fx = g.fx;
  let reward = g.rng.weighted(REWARDS, (r) => r[0])[1];
  if (reward === 'heal' && p.hp >= st.maxHp) reward = 'xp';
  fx.burst(e.x, e.y, COL.gold, 40, 520, 0.8, 6, 1);
  fx.burst(e.x, e.y, COL.white, 16, 300, 0.5, 4);
  fx.ring(e.x, e.y, COL.gold, 20, 140, 0.35, 4);
  g.audio.play('fusion');
  const drop = (kind, n, v) => {
    for (let i = 0; i < n; i++) g.pickups.push(g.makePickup(e.x, e.y, kind, v));
  };
  const xpPile = () => g.dropXp(e.x, e.y, g.xpNeed * 0.4);               // close to half a level
  switch (reward) {
    case 'xp':
      xpPile();
      fx.text(e.x, e.y - 40, '+XP', COL.teal, 16, 1.1);
      break;
    case 'heal':
      drop('heart', 2, 1);
      fx.text(e.x, e.y - 40, '+♥♥', COL.rose, 16, 1.1);
      break;
    case 'level':
      g.pending++;
      fx.text(e.x, e.y - 40, 'LEVEL UP!', COL.gold, 18, 1.3);
      break;
    case 'jackpot':
      g.pending++;
      xpPile();
      drop('heart', 2, 1);
      g.bomb = 1;
      fx.text(e.x, e.y - 40, 'JACKPOT!', COL.gold, 22, 1.6);
      fx.shock(e.x, e.y, 1.2, 800, 0.6);
      fx.white(0.25);
      break;
  }
  g.stat.jars = (g.stat.jars || 0) + 1;
}

Object.assign(DEFS, {
  jar: {
    hp: 30, speed: 0, r: 22, xp: 0, threat: 0, col: 'gold', ai: aiJar, loot: true, contact: false,
    noMove: true, noSep: true, noCharm: true, noElite: true, heavy: true, statusImmune: true, score: 500,
    init(g, e) { e.life = LIFE; },
    onDeath: breakJar,
  },
});

export const jarLife = (e) => clamp(e.life / LIFE, 0, 1);
