// Wave director: spends a per-wave threat budget on a mix of unlocked enemy
// types, runs boss waves, and paces the breathers in between.

import { ARENA, WAVES_PER_SECTOR, FINAL_WAVE, SECTORS } from '../config.js';
import { clamp } from '../core/math.js';
import { DEFS, spawnEnemy } from './enemies.js';
import { spawnBoss } from './bosses.js';

export const UNLOCK = [
  ['drifter', 1], ['mote', 2], ['lancer', 3], ['spitter', 4], ['splitter', 6], ['bomber', 7], ['warden', 8],
  ['pinwheel', 9], ['phantom', 11], ['ray', 12], ['leech', 13], ['hive', 14], ['wyrm', 16],
];
const ELITES = ['swift', 'armored', 'volatile', 'regen'];

export class Waves {
  constructor(g) {
    this.g = g;
    this.n = 0;
    this.state = 'inter';
    this.timer = 2.2;
    this.budget = 0;
    this.total = 1;
    this.cap = 10;
    this.spawnT = 0;
    this.elapsed = 0;
    this.vacuum = false;
    this.boss = false;
    this.hpScale = 1;
    this.spdScale = 1;
    this.bossScale = 1;
    this.mix = [];
    this.aliveThreat = 0;
    this.count = {};
  }

  /** 0..1 progress of the current wave, for the HUD. */
  get progress() {
    if (this.state !== 'active' || this.boss) return 0;
    return clamp(1 - (this.budget + this.aliveThreat) / this.total, 0, 1);
  }

  start(n) {
    const g = this.g, rng = g.rng;
    this.n = n;
    this.state = 'active';
    this.elapsed = 0;
    this.vacuum = false;
    this.spawnT = 0.6;
    const w = n - 1;
    this.hpScale = (1 + 0.22 * w + 0.056 * w * w) * (n > FINAL_WAVE ? Math.pow(1.25, n - FINAL_WAVE) : 1);
    this.spdScale = 1 + Math.min(0.35, 0.012 * w) + (n > FINAL_WAVE ? Math.min(0.4, 0.02 * (n - FINAL_WAVE)) : 0);
    this.boss = n % WAVES_PER_SECTOR === 0;
    const sector = SECTORS[Math.floor((n - 1) / WAVES_PER_SECTOR) % SECTORS.length];

    if (this.boss) {
      const idx = n / WAVES_PER_SECTOR - 1;
      this.bossScale = Math.pow(2.6, Math.floor(idx / SECTORS.length));
      const b = spawnBoss(g, idx);
      this.budget = 0;
      this.cap = 6 + n * 0.8;
      this.mix = [['drifter', 3], ['mote', 2]];
      g.ui.banner('WARNING', b.def.name, 'boss');
      g.audio.play('bossWarn');
      g.audio.setIntensity(3);
      return;
    }

    this.budget = this.total = (20 + 11 * n + 0.9 * n * n) * 0.9;
    this.cap = 14 + 6.5 * n;
    const unlocked = UNLOCK.filter(([, at]) => at <= n).map(([t]) => t);
    const fresh = UNLOCK.find(([, at]) => at === n);
    const mix = [[n >= 2 && rng.chance(0.4) ? 'mote' : 'drifter', 4]];
    if (fresh) mix.push([fresh[0], 3.5]);
    const others = unlocked.filter((t) => !mix.some((m) => m[0] === t));
    const extra = Math.min(others.length, n < 4 ? 1 : n < 10 ? 2 : 3);
    for (let i = 0; i < extra; i++) {
      const t = others.splice(Math.floor(rng.next() * others.length), 1)[0];
      mix.push([t, 2]);
    }
    this.mix = mix;
    const first = (n - 1) % WAVES_PER_SECTOR === 0;
    g.ui.banner(`WAVE ${n}`, first ? sector.name : '', first ? 'sector' : 'wave');
    g.audio.play('waveStart');
    g.audio.setIntensity(n < 4 ? 1 : 2);
  }

  spawnGroup() {
    const g = this.g, rng = g.rng, p = g.player;
    let type = rng.weighted(this.mix, (m) => m[1])[0];
    if (DEFS[type].maxAlive && (this.count[type] || 0) >= DEFS[type].maxAlive) type = this.mix[0][0];
    const def = DEFS[type];
    let count = def.pack ? rng.int(def.pack[0], def.pack[1]) : def.threat <= 1 ? rng.int(2, 5) : def.threat <= 2.5 ? rng.int(1, 3) : 1;
    const a = rng.angle(), d = rng.range(540, 820);
    const cx = clamp(p.x + Math.cos(a) * d, -ARENA.hw + 80, ARENA.hw - 80);
    const cy = clamp(p.y + Math.sin(a) * d * 0.75, -ARENA.hh + 80, ARENA.hh - 80);
    // clamped spawns can land on the player near walls: push them back out
    let sx = cx, sy = cy;
    if (Math.hypot(sx - p.x, sy - p.y) < 380) { sx = clamp(p.x - Math.cos(a) * d, -ARENA.hw + 80, ARENA.hw - 80); sy = clamp(p.y - Math.sin(a) * d * 0.75, -ARENA.hh + 80, ARENA.hh - 80); }
    const eliteChance = this.n >= 6 ? Math.min(0.16, 0.03 + 0.008 * (this.n - 6)) : 0;
    let cost = 0;
    for (let i = 0; i < count; i++) {
      const x = clamp(sx + rng.range(-70, 70), -ARENA.hw + 40, ARENA.hw - 40);
      const y = clamp(sy + rng.range(-70, 70), -ARENA.hh + 40, ARENA.hh - 40);
      const elite = !this.boss && rng.chance(eliteChance) ? rng.pick(ELITES) : null;
      spawnEnemy(g, type, x, y, { elite, spawn: 0.75 + i * 0.05 });
      cost += def.threat * (elite ? 2.5 : 1);
    }
    return cost;
  }

  update(dt) {
    const g = this.g;
    if (g.player.dead) return;
    if (this.state === 'inter') {
      this.timer -= dt;
      if (this.timer <= 0) this.start(this.n + 1);
      return;
    }
    this.elapsed += dt;
    let threat = 0, alive = 0;
    const count = (this.count = {});
    for (const e of g.enemies) {
      if (e.dead) continue;
      count[e.type] = (count[e.type] || 0) + 1;
      if (!e.boss) threat += e.def.threat || 0;
      if (!e.def.untargetable) alive++;
    }
    this.aliveThreat = threat;

    this.spawnT -= dt;
    if (this.boss) {                       // a trickle of adds keeps XP flowing in boss fights
      if (this.spawnT <= 0) {
        this.spawnT = 2.6;
        if (threat < this.cap && g.enemies.length < 240) this.spawnGroup();
      }
      return;
    }
    if (this.spawnT <= 0 && this.budget > 0) {
      if (threat < this.cap && g.enemies.length < 280) {
        this.budget -= this.spawnGroup();
        this.spawnT = Math.max(0.3, 1.4 - this.n * 0.05);
      } else this.spawnT = 0.25;
    }
    if (this.budget < 1 && threat < this.cap) this.budget = 0;          // leftovers too small to buy a group
    const late = this.elapsed > 90 + this.n * 4;                          // never let a wave drag on forever
    if ((this.budget <= 0 && (alive === 0 || this.elapsed > 75 + this.n * 3)) || late) this.clear(false);
  }

  clear(boss) {
    const g = this.g;
    this.state = 'inter';
    this.vacuum = true;
    this.timer = boss ? 6.5 : 3.2;
    g.score += 250 * this.n;
    if (boss) {
      const done = this.n >= FINAL_WAVE && !g.endless && this.n === FINAL_WAVE;
      g.ui.banner(done ? 'THE VOID IS SILENT' : 'SECTOR CLEAR', done ? '' : 'Heart container dropped', 'clear');
    } else g.audio.play('waveClear');
    g.audio.setIntensity(1);
  }

  bossDefeated() { this.clear(true); }
}
