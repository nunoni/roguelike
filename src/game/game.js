// One run of the game. Owns all simulation state; knows nothing about WebGL or
// the DOM. Visuals and sound go through the injected ctx ({ fx, audio, ui }).

import { ARENA, COL, PLAYER, FINAL_WAVE, WAVES_PER_SECTOR, SECTOR_BY_ID, ROUTE_TIERS, BPM, xpForLevel } from '../config.js';
import { Rng } from '../core/rng.js';
import { Grid } from '../core/spatial.js';
import { clamp, compact, damp, segDist2, TAU } from '../core/math.js';
import { computeStats, rollChoices, FUSION_BY_ID } from './upgrades.js';
import { makePlayer, updatePlayer } from './player.js';
import { updateEnemies } from './enemies.js';
import { rollBossPlan } from './bosses.js';
import { updateProjectiles, spawnProj, chainFrom } from './weapons.js';
import { updateSpells } from './spells.js';
import { igniteEnemy, envyEnemy, tiedTo } from './status.js';
import { Waves } from './waves.js';
import { updateHazards, clearHazards } from './hazards.js';
import { updateArsenal, dropDecoy, goldStream, goldCollect } from './arsenal.js';
import { updateLoot } from './loot.js';

const CRIT = { crit: true };
const QUIET = { quiet: true };
const SHARED = { quiet: true, shared: true };
export { CRIT, QUIET };

export class Game {
  constructor(ctx, opts = {}) {
    this.fx = ctx.fx;
    this.audio = ctx.audio;
    this.ui = ctx.ui;
    this.rng = new Rng(opts.seed ?? (Date.now() & 0x7fffffff));
    this.god = !!opts.god;
    this.attract = !!opts.attract;

    this.time = 0;
    this.frame = 0;
    this.state = 'playing';      // playing | levelup | dead | victory
    this.endless = false;
    this.viewHalf = { x: 960, y: 540 };

    this.levels = {};
    this.fusions = {};
    this.bonusHp = 0;            // heart containers dropped by bosses
    this.stats = computeStats(this.levels, this.fusions, 0);
    this.player = makePlayer(this.stats);

    this.enemies = [];
    this.projs = [];
    this.bullets = [];
    this.pickups = [];
    this.zones = [];
    this.lasers = [];
    this.drones = [];
    this.butterflies = [];
    this.rangs = [];        // The Ex boomerangs
    this.lashes = [];       // Rose Whip swings (visual)
    this.letters = [];      // Love Letters in flight
    this.tags = [];         // Laser Tag lines
    this.mirror = null;     // Mirror Ball
    this.decoy = null;      // Heart of Gold decoy
    this.lastHit = null;    // Heartstrings ties new hits to this enemy
    this.beatN = 0;         // beat clock, shared with the ship's pulse and the music tempo
    this.onBeat = false;    // true on the frame a new beat starts
    this.beams = [];        // player's continuous beams, rebuilt each frame
    this.flashBeams = [];   // short-lived player beam flashes (Pulsar)
    this.orbitals = [];
    this.wardens = [];
    this.delayed = [];
    this.grid = new Grid(110);
    this.eid = 0;
    this._q = [];

    this.cam = { x: 0, y: 0 };
    this.level = 1;
    this.xp = 0;
    this.xpNeed = xpForLevel(1);
    this.pending = 0;
    this.choices = null;
    this.rerolls = 1;

    this.score = 0;
    this.kills = 0;
    this.combo = 0;
    this.comboT = 0;
    this.bomb = 0.35;
    this.bombRing = null;
    this.hitstop = 0;
    this.timeScale = 1;
    this.deathT = 0;
    this.victoryT = 0;
    this.dmgMul = 1;
    this.ringArena = null;
    this.dark = null;          // the Eclipse's darkness: { x, y, r, k }
    this.bossName = '';
    this.stat = { dmg: 0, hits: 0, seen: {}, skillsTaken: 0 };

    this.waves = new Waves(this);
    this.bossPlan = rollBossPlan(this.rng);   // which boss guards each sector this run
    this.route = [ROUTE_TIERS[0][0]];         // sector ids, one per tier, picked at the warp gates
    this.gates = null;                        // [{ x, y, r, id, t }] while a route choice is open
    this.hz = {};                             // stage hazard state, reset every wave
  }

  get wave() { return this.waves.n; }
  get sectorIndex() { return Math.floor((Math.max(1, this.waves.n) - 1) / WAVES_PER_SECTOR); }
  get sector() { return SECTOR_BY_ID[this.sectorId(this.sectorIndex)]; }
  /** The sector id for a tier index; endless loops through the tiers again. */
  sectorId(i) {
    return this.route[i] || this.route[this.route.length - 1];
  }

  /** Open the warp gates for the next tier, or pick it outright if there is only one option. */
  openGates() {
    if (this.route.length > this.sectorIndex + 1) return;     // already decided (dev ?route=)
    const tier = ROUTE_TIERS[(this.route.length) % ROUTE_TIERS.length];
    if (tier.length === 1) { this.route.push(tier[0]); return; }
    const p = this.player, opts = [...tier];
    if (this.rng.chance(0.5)) opts.reverse();
    this.gates = opts.map((id, i) => {
      const side = i ? 1 : -1;
      return { id, x: clamp(p.x + side * 430, -ARENA.hw + 200, ARENA.hw - 200), y: clamp(p.y - 40, -ARENA.hh + 220, ARENA.hh - 220), r: 95, t: 0 };
    });
    // keep both gates apart even when clamped against a wall
    if (Math.abs(this.gates[0].x - this.gates[1].x) < 500) {
      const mid = clamp((this.gates[0].x + this.gates[1].x) / 2, -ARENA.hw + 460, ARENA.hw - 460);
      this.gates[0].x = mid - 430; this.gates[1].x = mid + 430;
    }
    this.ui.banner('CHOOSE YOUR ROUTE', 'Fly into a warp gate', 'sector');
    this.audio.play('fusion');
  }

  updateGates(dt) {
    const p = this.player;
    for (const gt of this.gates) {
      gt.t += dt;
      if (p.dead || gt.t < 0.8) continue;
      if (Math.hypot(p.x - gt.x, p.y - gt.y) < gt.r + p.r) {
        this.route.push(gt.id);
        for (const o of this.gates) {
          this.fx.shock(o.x, o.y, 1, 600, 0.6);
          this.fx.burst(o.x, o.y, SECTOR_BY_ID[o.id].c3, 40, 600, 0.8, 6, 1);
        }
        this.fx.white(0.35); this.fx.shake(10);
        this.audio.play('bomb');
        this.gates = null;
        this.waves.timer = Math.min(this.waves.timer, 1.5);
        p.invuln = Math.max(p.invuln, 1);
        return;
      }
    }
  }

  // ------------------------------------------------------------------ frame
  update(realDt, input) {
    if (this.state !== 'playing') return;
    if (this.hitstop > 0) { this.hitstop -= realDt; return; }
    if (this.timeScale < 1) this.timeScale = Math.min(1, this.timeScale + realDt * 0.45);
    const dt = realDt * this.timeScale;
    this.time += dt;
    this.frame++;
    const bn = Math.floor(this.time * BPM / 60);
    this.onBeat = bn !== this.beatN;
    this.beatN = bn;
    if (this.onBeat) this.player.beatReady = true;

    const grid = this.grid;
    grid.clear();
    for (const e of this.enemies) if (!e.dead && e.spawn <= 0) grid.insert(e);

    updatePlayer(this, input, dt);
    updateSpells(this, input, dt);
    updateArsenal(this, dt);
    this.waves.update(dt);
    updateEnemies(this, dt);
    updateProjectiles(this, dt);
    this.updateBullets(dt);
    this.updateZones(dt);
    this.updateLasers(dt);
    this.updatePickups(dt);
    this.updateBombRing(dt);
    updateHazards(this, dt);
    updateLoot(this, dt);
    if (this.gates) this.updateGates(dt);

    for (let i = this.delayed.length - 1; i >= 0; i--) {
      const d = this.delayed[i];
      d.t -= dt;
      if (d.t <= 0) { this.delayed.splice(i, 1); d.fn(); }
    }

    compact(this.enemies);
    compact(this.projs);
    compact(this.bullets);
    compact(this.pickups);
    compact(this.zones);
    compact(this.lasers);

    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    // every level makes you a little stronger, so no build is a dead end
    this.dmgMul = (1 + 0.02 * (this.level - 1)) *
      (this.stats.fus.bleedingheart ? 1 + 0.12 * Math.max(0, this.stats.maxHp - this.player.hp) : 1);

    // camera leads slightly toward the cursor
    const p = this.player;
    const tx = p.x + clamp(input.ax - p.x, -500, 500) * 0.14;
    const ty = p.y + clamp(input.ay - p.y, -400, 400) * 0.14;
    const mx = Math.max(0, ARENA.hw + 220 - this.viewHalf.x), my = Math.max(0, ARENA.hh + 220 - this.viewHalf.y);
    this.cam.x = damp(this.cam.x, clamp(tx, -mx, mx), 7, dt);
    this.cam.y = damp(this.cam.y, clamp(ty, -my, my), 7, dt);

    if (p.dead) {
      this.deathT -= realDt;
      if (this.deathT <= 0) { this.state = 'dead'; this.ui.gameOver(this); }
      return;
    }
    if (this.victoryT > 0) {
      this.victoryT -= realDt;
      if (this.victoryT <= 0) { this.state = 'victory'; this.ui.victory(this); return; }
    }
    if (this.pending > 0) this.openLevelUp();
  }

  // ------------------------------------------------------------------ progression
  addXp(v) {
    this.xp += v * this.stats.xpMul;
    while (this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed;
      this.level++;
      this.xpNeed = xpForLevel(this.level);
      this.pending++;
      if (this.stats.fus.glowup) this.delayed.push({ t: 0, fn: () => this.glowUp() });
    }
  }

  /** Glow Up: every level-up releases a nova and calls in all the XP. */
  glowUp() {
    const p = this.player, st = this.stats, fx = this.fx;
    if (p.dead) return;
    this.stat.glowups = (this.stat.glowups || 0) + 1;
    const R = 430;
    for (const b of this.bullets) {
      const dx = b.x - p.x, dy = b.y - p.y;
      if (!b.dead && dx * dx + dy * dy < R * R) { b.dead = true; fx.mote(b.x, b.y, COL.gold, 1, 5, 0.4, 200); }
    }
    this.explode(p.x, p.y, R, st.damage * (5 + 0.12 * this.level), { col: COL.gold, knock: 380 });
    for (const k of this.pickups) if (k.kind === 'xp') k.pull = true;
    fx.shock(p.x, p.y, 1.6, 1100, 0.8);
    fx.ring(p.x, p.y, COL.white, 30, R, 0.45, 5);
    fx.text(p.x, p.y - 56, 'GLOW UP', COL.gold, 15, 1);
    p.invuln = Math.max(p.invuln, 0.6);
  }

  openLevelUp() {
    this.state = 'levelup';
    this.choices = rollChoices(this);
    this.rerolls = 1;
    this.audio.play('levelup');
    this.ui.levelUp(this);
  }

  reroll() {
    if (this.state !== 'levelup' || this.rerolls <= 0) return false;
    this.rerolls--;
    this.choices = rollChoices(this);
    return true;
  }

  choose(i) {
    if (this.state !== 'levelup') return;
    const c = this.choices[i];
    if (!c) return;
    this.applyChoice(c);
    this.pending--;
    if (this.pending > 0) {
      this.choices = rollChoices(this);
      this.rerolls = 1;
      this.ui.levelUp(this);
    } else {
      this.choices = null;
      this.state = 'playing';
      this.player.invuln = Math.max(this.player.invuln, 0.6);
    }
  }

  applyChoice(c) {
    const p = this.player;
    if (c.kind === 'skill') {
      this.levels[c.id] = (this.levels[c.id] || 0) + 1;
      this.stat.skillsTaken++;
    } else if (c.kind === 'fusion') {
      this.fusions[c.id] = true;
      this.ui.fusion(FUSION_BY_ID[c.id]);
      this.audio.play('fusion');
      this.fx.shock(p.x, p.y, 1.6, 900, 0.9);
      this.fx.burst(p.x, p.y, COL.gold, 80, 700, 1.1, 7, 1);
      this.fx.white(0.35);
    } else if (c.kind === 'heal') {
      this.heal(2);
    } else if (c.kind === 'score') {
      this.score += 2500 * Math.max(1, this.wave);
      this.bomb = 1;
    }
    const oldMax = this.stats.maxHp;
    this.setStats();
    if (this.stats.maxHp > oldMax) p.hp = Math.min(this.stats.maxHp, p.hp + (this.stats.maxHp - oldMax));
  }

  setStats() {
    this.stats = computeStats(this.levels, this.fusions, this.bonusHp);
    const p = this.player;
    if (this.stats.shield > 0 && !p.shieldInit) { p.shieldInit = true; p.shield = true; }
  }

  // ------------------------------------------------------------------ queries
  /** Nearest hittable enemy within range, ignoring ids in `skip`. */
  findTarget(x, y, range, skip) {
    let best = null, bd = range * range;
    const list = range <= 500 ? this.grid.query(x, y, range, this._q) : this.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead || e.spawn > 0 || e.faded || e.charm > 0 || e.def.untargetable) continue;
      if (skip && skip.indexOf(e.id) >= 0) continue;
      const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  hittable(e) { return !e.dead && e.spawn <= 0 && !e.faded && !(e.charm > 0); }

  // ------------------------------------------------------------------ combat
  damageEnemy(e, dmg, o) {
    if (e.dead || e.spawn > 0 || e.faded) return 0;
    if (e.transfer) {                       // body segments forward part of the hit to the head
      e.flash = 1;
      return e.transfer.dead ? 0 : this.damageEnemy(e.transfer, dmg * 0.3, o);
    }
    const st = this.stats;
    const base = dmg;
    let crit = false;
    if (o && o.crit && (o.sure || this.rng.chance(st.crit))) {
      dmg *= st.critMul;
      crit = true;
      if (st.fus.heartache && e.envy > 0) dmg *= 1.25;
    }
    if (e.frozen > 0 && st.fus.absolutezero) dmg *= 1.5;
    if (e.envy > 0) dmg *= 1 + st.envy * e.envy;
    if (e.armor) dmg *= e.armor;              // Shatterheart while its shards live
    dmg *= this.dmgMul;
    e.hp -= dmg;
    e.flash = 1;
    this.stat.dmg += dmg;
    if (!(o && o.quiet) && dmg >= 1) {
      this.fx.text(e.x, e.y - e.r - 6, String(Math.round(dmg)) + (crit ? '!' : ''), crit ? COL.gold : COL.white, crit ? 17 : 11, crit ? 0.7 : 0.45);
    }
    if (crit && st.fus.heartstopper && !e.boss && e.hp > 0 && e.hp < e.maxHp * 0.25) {
      e.hp = 0;
      this.fx.text(e.x, e.y - e.r - 26, 'STOPPED', COL.gold, 13, 0.8);
      const x = e.x, y = e.y;
      this.delayed.push({ t: 0.05, fn: () => this.explode(x, y, 95, st.damage * 1.5, { col: COL.gold }) });
    }
    if (crit && !e.dead) {
      if (st.fus.heartache) envyEnemy(this, e, 3);
      if (st.fus.thunderstruck) chainFrom(this, e, base);
    }
    // Heartstrings: the tied partner feels part of every hit (never passed on again)
    const tie = st.strings > 0 && !(o && o.shared) ? tiedTo(e) : null;
    if (e.hp <= 0) this.killEnemy(e);
    if (tie) this.damageEnemy(tie, base * (crit ? st.critMul : 1) * st.strings * (tie.boss ? 0.5 : 1), SHARED);
    return dmg;
  }

  killEnemy(e, silent = false) {
    if (e.dead) return;
    e.dead = true;
    const def = e.def, st = this.stats, fx = this.fx;
    const col = COL[def.col] || COL.cyan;
    fx.burst(e.x, e.y, col, 8 + e.r * 0.5, 260 + e.r * 6, 0.55, 3 + e.r * 0.12);
    fx.ring(e.x, e.y, col, e.r * 0.6, e.r * 2.6, 0.3, 3);
    if (e.r >= 28) { fx.shock(e.x, e.y, 0.45, e.r * 7, 0.45); fx.shake(4); }
    if (silent) return;

    this.kills++;
    this.combo++;
    this.comboT = 2.5;
    this.score += Math.round((def.score || def.xp * 10) * (1 + Math.min(this.combo, 100) / 25) * (e.elite ? 3 : 1));
    this.bomb = Math.min(1, this.bomb + (def.threat || 0.5) * 0.011);
    this.audio.play(e.r >= 28 ? 'killBig' : 'kill');
    if (e.xp > 0) this.dropXp(e.x, e.y, e.xp);
    if (st.steal > 0 && this.rng.chance(st.steal)) this.pickups.push(this.makePickup(e.x, e.y, 'heart', 1));

    if (def.onDeath) def.onDeath(this, e);
    if (e.elite === 'volatile') this.zones.push({ kind: 'blast', x: e.x, y: e.y, r: 150, t: 0, dur: 0.85, tick: 0 });

    const x = e.x, y = e.y;
    const mate = st.fus.soulmates ? tiedTo(e) : null;
    if (mate) {                                   // Soulmates: heartbreak for the one left behind
      const m = mate;
      this.fx.lightning(x, y, m.x, m.y, COL.rose);
      this.delayed.push({ t: 0.06, fn: () => {
        if (m.dead) return;
        this.fx.burst(m.x, m.y, COL.rose, 14, 300, 0.5, 5, 1);
        this.damageEnemy(m, st.damage * 5, SHARED);
      } });
    }
    if (st.fus.supernova && e.burnT > 0) {
      const stacks = e.burnStacks || 1;           // hotter fires, bigger bangs
      this.delayed.push({
        t: 0.09, fn: () => {
          this.explode(x, y, 125 + 4 * stacks, st.damage * (2.2 + 0.2 * stacks), { col: COL.orange, burn: true });
          if (this.zones.length < 90) this.zones.push({ kind: 'fire', x, y, r: 70, t: 0, dur: 2.4, tick: 0 });
        },
      });
    }
    if (st.fus.absolutezero && (e.frozen > 0 || e.chill > 0.5)) {
      fx.burst(x, y, COL.ice, 14, 420, 0.5, 4);
      const a0 = this.rng.angle();
      for (let i = 0; i < 6; i++) {
        spawnProj(this, x, y, a0 + (i / 6) * TAU, { dmg: st.damage * 0.8, kind: 'shard', pierce: 2, bounce: 0, homing: 0, canSplit: false, coef: 0.3, chill: 0.35, life: 0.5, spd: 850, r: 7 });
      }
    }
    if (st.fus.entourage && e.charm > 0) {
      const ghosts = this.drones.filter((d) => d.ghost).length;
      if (ghosts < 6) {
        this.drones.push({ x, y, cd: 0.5, ang: 0, ghost: true, slot: ghosts });
        fx.text(x, y - 20, 'JOINED', COL.rose, 12, 0.9);
      }
    }
    if (e.boss) this.onBossDeath(e);
  }

  /** Area damage against enemies. */
  explode(x, y, r, dmg, o = {}) {
    const fx = this.fx, col = o.col || COL.orange;
    fx.ring(x, y, col, r * 0.25, r, 0.32, 4);
    fx.burst(x, y, col, o.small ? 5 : 14, r * 4, 0.4, 4);
    if (!o.small) { fx.shock(x, y, 0.5, r * 2.4, 0.45); fx.shake(Math.min(9, r * 0.035)); this.audio.play('explode'); }
    const list = this.grid.query(x, y, r, []);
    for (const e of list) {
      if (!this.hittable(e) || e === o.skip) continue;
      const dx = e.x - x, dy = e.y - y, rr = r + e.r;
      if (dx * dx + dy * dy > rr * rr) continue;
      this.damageEnemy(e, dmg, o.small ? QUIET : null);
      if (o.burn && !e.dead) igniteEnemy(this, e, this.stats.damage * Math.max(0.5, this.stats.burn));
      if (o.knock && !e.dead && !e.boss) {
        const d = Math.hypot(dx, dy) || 1;
        e.vx += (dx / d) * o.knock; e.vy += (dy / d) * o.knock;
      }
    }
  }

  hurtPlayer(n, sx, sy) {
    const p = this.player;
    if (p.decoy) return false;                 // something aimed at the Heart of Gold decoy
    if (p.dead || p.invuln > 0 || p.dashT > 0 || this.victoryT > 0) return false;
    const fx = this.fx;
    this.stat.hits++;
    if (p.shield) {
      p.shield = false;
      if (this.stats.fus.heartofgold) dropDecoy(this);
      p.shieldT = 0;
      p.invuln = 0.7;
      fx.ring(p.x, p.y, COL.cyan, 30, 160, 0.4, 5);
      fx.burst(p.x, p.y, COL.cyan, 26, 480, 0.5, 4);
      fx.shake(6);
      this.audio.play('shieldBreak');
      this.repel(p.x, p.y, 170, 420);
      return true;
    }
    if (this.wave > 20) n += Math.floor((this.wave - 21) / 10);   // endless hits harder
    if (!this.god) p.hp -= n;
    p.invuln = PLAYER.invuln;
    p.hurtT = 1;
    this.combo = 0;
    fx.shake(16); fx.flash(1); fx.shock(p.x, p.y, 1.2, 600, 0.6);
    fx.burst(p.x, p.y, COL.red, 30, 520, 0.7, 5, 1);
    this.hitstop = 0.09;
    this.audio.play('hurt');
    this.repel(p.x, p.y, 230, 520);
    // mercy: nearby bullets vanish so one mistake is not a chain of hits
    for (const b of this.bullets) {
      const dx = b.x - p.x, dy = b.y - p.y;
      if (dx * dx + dy * dy < 240 * 240) { b.dead = true; fx.mote(b.x, b.y, COL.bullet, 1, 4, 0.3, 120); }
    }
    if (p.hp <= 0) {
      p.dead = true;
      this.deathT = 2.0;
      this.timeScale = 0.25;
      fx.shock(p.x, p.y, 2.2, 1300, 1.2);
      fx.burst(p.x, p.y, COL.pink, 120, 900, 1.4, 7, 1);
      fx.burst(p.x, p.y, COL.white, 60, 600, 1.0, 5);
      fx.shake(30); fx.white(0.5);
      this.audio.play('death');
    }
    return true;
  }

  /** Push non-boss enemies away from a point. */
  repel(x, y, r, force) {
    for (const e of this.grid.query(x, y, r, [])) {
      if (e.dead || e.boss || e.def.heavy) continue;
      const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy) || 1;
      if (d < r + e.r) { e.vx += (dx / d) * force; e.vy += (dy / d) * force; }
    }
  }

  heal(n) {
    const p = this.player, st = this.stats;
    const before = p.hp;
    p.hp = Math.min(st.maxHp, p.hp + n);
    const over = n - (p.hp - before);
    this.fx.burst(p.x, p.y, COL.rose, 16, 300, 0.7, 6, 1);
    this.audio.play('heal');
    if (over > 0 && st.fus.bleedingheart) {
      for (let k = 0; k < over; k++) {
        const a0 = this.rng.angle();
        for (let i = 0; i < 8; i++) {
          spawnProj(this, p.x, p.y, a0 + (i / 8) * TAU, { dmg: st.damage * 1.2, kind: 'mini', homing: 9, r: 7, spd: 760, life: 1.6, pierce: 1, bounce: 0, canSplit: false, coef: 0.5 });
        }
      }
    }
  }

  // ------------------------------------------------------------------ enemy weapons
  fireBullet(x, y, ang, speed, o = {}) {
    if (this.bullets.length > 900) return null;
    const b = { x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: o.r || 7, life: o.life || 5, kind: o.kind || 0, turn: o.turn || 0, spd: speed, ang, dead: false, t: 0, accel: o.accel || 0 };
    this.bullets.push(b);
    return b;
  }

  ringBullets(x, y, n, speed, offset = 0, o) {
    for (let i = 0; i < n; i++) this.fireBullet(x, y, offset + (i / n) * TAU, speed, o);
  }

  addLaser(o) {
    const l = { x: o.x, y: o.y, ang: o.ang, len: o.len || 1500, w: o.w || 22, warn: o.warn ?? 1, dur: o.dur ?? 0.3, t: 0, owner: o.owner || null, spin: o.spin || 0, perm: !!o.perm, dead: false, hitT: 0 };
    if (o.hurts) { l.hurts = o.hurts; l.hit = new Set(); l.col = o.col; }     // hazards: also strikes enemies
    if (o.kind) l.kind = o.kind;
    this.lasers.push(l);
    return l;
  }

  updateBullets(dt) {
    const p = this.player, pr = p.r * 0.62;
    const hw = ARENA.hw + 80, hh = ARENA.hh + 80;
    for (const b of this.bullets) {
      if (b.dead) continue;
      b.t += dt;
      b.life -= dt;
      if (b.turn > 0 && !p.dead) {
        const want = Math.atan2(p.y - b.y, p.x - b.x);
        let d = (want - b.ang) % TAU;
        if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
        b.ang += clamp(d, -b.turn * dt, b.turn * dt);
        b.vx = Math.cos(b.ang) * b.spd; b.vy = Math.sin(b.ang) * b.spd;
      }
      if (b.accel) { b.spd += b.accel * dt; b.vx = Math.cos(b.ang) * b.spd; b.vy = Math.sin(b.ang) * b.spd; }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.life <= 0 || b.x < -hw || b.x > hw || b.y < -hh || b.y > hh) { b.dead = true; continue; }
      const dx = b.x - p.x, dy = b.y - p.y, rr = b.r + pr;
      if (dx * dx + dy * dy < rr * rr && !p.dead) {
        if (this.hurtPlayer(1, b.x, b.y)) b.dead = true;
      }
    }
  }

  updateLasers(dt) {
    const p = this.player;
    for (const l of this.lasers) {
      if (l.dead) continue;
      l.t += dt;
      if (l.owner) {
        if (l.owner.dead) { l.dead = true; continue; }
        if (!l.free) { l.x = l.owner.x; l.y = l.owner.y; }
      }
      l.ang += l.spin * dt;
      if (!l.perm && l.t >= l.warn + l.dur) { l.dead = true; continue; }
      if (l.t >= l.warn && !p.dead) {
        const x2 = l.x + Math.cos(l.ang) * l.len, y2 = l.y + Math.sin(l.ang) * l.len;
        const rr = l.w * 0.5 + p.r * 0.6;
        if (segDist2(p.x, p.y, l.x, l.y, x2, y2) < rr * rr) this.hurtPlayer(1, p.x, p.y);
        if (l.hurts) {
          for (const e of this.enemies) {
            if (!this.hittable(e) || l.hit.has(e.id)) continue;
            const er = l.w * 0.5 + e.r;
            if (segDist2(e.x, e.y, l.x, l.y, x2, y2) < er * er) {
              l.hit.add(e.id);
              this.damageEnemy(e, this.stats.damage * l.hurts, null);
              if (l.kind === 'arc') this.fx.lightning(e.x, e.y, e.x + this.rng.range(-40, 40), e.y + this.rng.range(-40, 40), l.col || COL.cyan);
            }
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ zones
  updateZones(dt) {
    const p = this.player, st = this.stats;
    for (const z of this.zones) {
      if (z.dead) continue;
      z.t += dt;
      switch (z.kind) {
        case 'blast':                      // enemy telegraphed explosion
          if (z.src && z.src.dead && !z.armed) { z.dead = true; break; }
          if (z.t >= z.dur) {
            z.dead = true;
            const zc = z.crystal ? COL.ice : z.fall ? COL.violet : COL.red;
            this.fx.ring(z.x, z.y, zc, z.r * 0.3, z.r, 0.35, 5);
            this.fx.burst(z.x, z.y, z.crystal ? COL.white : COL.orange, 30, z.r * 4.5, 0.5, 5);
            this.fx.shock(z.x, z.y, 0.8, z.r * 2.6, 0.5);
            this.fx.shake(8);
            this.audio.play('explode');
            const dx = p.x - z.x, dy = p.y - z.y;
            if (dx * dx + dy * dy < (z.r + p.r * 0.5) ** 2) this.hurtPlayer(z.dmg || 1, z.x, z.y);
            if (z.src && !z.src.dead) this.killEnemy(z.src, true);
            if (z.harm) {                  // hazard blasts (solar flares) hit enemies too
              this.explode(z.x, z.y, z.r, st.damage * z.harm, { col: COL.orange });
              if (z.burn) this.zones.push({ kind: 'fire', x: z.x, y: z.y, r: z.r * 0.85, t: 0, dur: z.burn, tick: 0 });
            }
          }
          break;
        case 'meteor':
          if (z.t >= z.dur) {
            z.dead = true;
            this.explode(z.x, z.y, z.r, z.dmg, { col: COL.gold });
            if (st.fus.starburst) {                // Starburst: a ring of hearts
              const a0 = this.rng.angle();
              for (let k = 0; k < 8; k++) {
                spawnProj(this, z.x, z.y, a0 + (k / 8) * TAU, { dmg: st.damage * 0.8, kind: 'mini', r: 7, spd: 820, life: 0.55, pierce: 1, bounce: 0, canSplit: false, coef: 0.5, homing: 0 });
              }
            }
          }
          break;
        case 'well': {
          z.tick -= dt;
          const tick = z.tick <= 0;
          if (tick) z.tick += 0.25;
          for (const e of this.grid.query(z.x, z.y, z.r, [])) {
            if (!this.hittable(e)) continue;
            const dx = z.x - e.x, dy = z.y - e.y, d = Math.hypot(dx, dy) || 1;
            if (d > z.r + e.r) continue;
            if (!e.boss && !e.def.heavy) {
              const pull = 520 * (1 - d / (z.r + e.r) * 0.6) * dt;
              e.x += (dx / d) * Math.min(pull, d); e.y += (dy / d) * Math.min(pull, d);
            }
            if (tick) this.damageEnemy(e, z.dmg, QUIET);
          }
          if (st.fus.eventhorizon) {
            const br = z.r * 0.7;
            for (const b of this.bullets) {
              const dx = z.x - b.x, dy = z.y - b.y;
              if (!b.dead && dx * dx + dy * dy < br * br) { b.dead = true; this.addXp(0.5); this.fx.mote(b.x, b.y, COL.violet, 1, 4, 0.4, 60); }
            }
            for (const k of this.pickups) {
              const dx = z.x - k.x, dy = z.y - k.y;
              if (dx * dx + dy * dy < z.r * z.r * 2.2) k.pull = true;
            }
          }
          if (z.t >= z.dur) {
            z.dead = true;
            if (st.fus.singularity) {              // Singularity: stars rain into the collapse
              for (let k = 0; k < 5; k++) {
                const a = this.rng.angle(), d = this.rng.range(0, z.r * 0.45);
                this.zones.push({ kind: 'meteor', x: z.x + Math.cos(a) * d, y: z.y + Math.sin(a) * d, r: st.starR, t: -k * 0.12, dur: 0.45, tick: 0, dmg: st.damage * (2 + 0.6 * st.stars) });
              }
            }
            if (st.fus.eventhorizon) {
              this.explode(z.x, z.y, z.r * 0.95, st.damage * 7, { col: COL.violet, knock: 300 });
              this.fx.shock(z.x, z.y, 1.4, z.r * 3.5, 0.7);
            } else this.fx.ring(z.x, z.y, COL.violet, z.r * 0.2, z.r, 0.35, 3);
          }
          break;
        }
        case 'tile':                       // Metronome floor tile: square, lands on the beat
          if (z.t >= z.dur) {
            z.dead = true;
            this.fx.burst(z.x, z.y, COL.amber, 6, 260, 0.35, 4);
            this.fx.ring(z.x, z.y, COL.amber, z.r * 0.4, z.r * 1.1, 0.25, 3);
            if (z.lead) { this.fx.shake(6); this.fx.shock(z.x, z.y, 0.5, 700, 0.4); this.audio.play('explode'); }
            if (Math.abs(p.x - z.x) < z.r + p.r * 0.4 && Math.abs(p.y - z.y) < z.r + p.r * 0.4) this.hurtPlayer(1, z.x, z.y);
          }
          break;
        case 'web':                        // Weaver silk: lands, then slows you while you stand in it
          if (z.t >= z.land) {
            const dx = p.x - z.x, dy = p.y - z.y;
            if (dx * dx + dy * dy < z.r * z.r) p.slowNext = Math.max(p.slowNext, 0.4);
          }
          if (z.t >= z.dur) z.dead = true;
          break;
        case 'fire':
        case 'trail':
        case 'after':
          z.tick -= dt;
          if (z.tick <= 0) {
            z.tick += z.kind === 'after' ? 0.15 : 0.3;
            const dmg = z.kind === 'fire' ? st.damage * 0.7 : z.kind === 'trail' ? st.damage * 0.45 : z.dmg;
            for (const e of this.grid.query(z.x, z.y, z.r, [])) {
              if (!this.hittable(e)) continue;
              const dx = z.x - e.x, dy = z.y - e.y, rr = z.r + e.r;
              if (dx * dx + dy * dy > rr * rr) continue;
              this.damageEnemy(e, dmg, QUIET);
              if (z.kind !== 'after' && !e.dead) igniteEnemy(this, e, st.damage * Math.max(0.4, st.burn));
            }
          }
          if (z.t >= z.dur) z.dead = true;
          break;
        default:
          if (z.t >= z.dur) z.dead = true;
      }
    }
  }

  // ------------------------------------------------------------------ pickups
  makePickup(x, y, kind, val) {
    const a = this.rng.angle(), s = this.rng.range(60, 260);
    return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, kind, val, t: 0, pull: false, dead: false };
  }

  dropXp(x, y, v) {
    if (this.pickups.length > 520) { this.addXp(v); return; }
    const n = clamp(Math.ceil(v / 4), 1, 14);
    for (let i = 0; i < n; i++) this.pickups.push(this.makePickup(x, y, 'xp', v / n));
  }

  updatePickups(dt) {
    const p = this.player, st = this.stats, mag = st.magnet, vac = this.waves.vacuum, gold = st.fus.goldrush;
    const hw = ARENA.hw - 12, hh = ARENA.hh - 12;
    for (const k of this.pickups) {
      if (k.dead) continue;
      k.t += dt;
      const dx = p.x - k.x, dy = p.y - k.y, d = Math.hypot(dx, dy) || 1;
      if (!p.dead && (k.pull || vac || d < mag) && k.t > 0.25) {
        k.pull = true;
        const sp = Math.min(1500, 520 + k.t * 900);
        k.vx = damp(k.vx, (dx / d) * sp, 12, dt);
        k.vy = damp(k.vy, (dy / d) * sp, 12, dt);
        if (gold && k.kind === 'xp' && (this.frame + (k.t * 60 | 0)) % 2 === 0) goldStream(this, k);
      } else {
        const f = Math.max(0, 1 - 3.2 * dt);
        k.vx *= f; k.vy *= f;
      }
      k.x = clamp(k.x + k.vx * dt, -hw, hw);
      k.y = clamp(k.y + k.vy * dt, -hh, hh);
      if (!p.dead && d < 30 && k.t > 0.25) {
        k.dead = true;
        if (k.kind === 'xp') {
          this.addXp(k.val);
          if (st.fus.goldrush) goldCollect(this, k.val);
          this.audio.play('xp');
          this.fx.mote(p.x, p.y, COL.teal, 0.5, 4, 0.3, 160);
        } else if (k.kind === 'heart') {
          this.heal(k.val);
          this.fx.text(p.x, p.y - 34, '+♥', COL.rose, 16, 0.9);
        } else if (k.kind === 'container') {
          this.bonusHp++;
          this.setStats();
          p.hp = this.stats.maxHp;
          this.fx.text(p.x, p.y - 40, 'MAX ♥ UP', COL.rose, 18, 1.4);
          this.fx.burst(p.x, p.y, COL.rose, 50, 560, 1, 7, 1);
          this.audio.play('fusion');
        }
      }
    }
  }

  // ------------------------------------------------------------------ Love Bomb
  useBomb() {
    const p = this.player;
    if (this.bomb < 1 || p.dead || this.bombRing) return false;
    this.bomb = 0;
    this.bombRing = { x: p.x, y: p.y, r: 0, max: 780, hit: new Set() };
    p.invuln = Math.max(p.invuln, 1.2);
    this.fx.shock(p.x, p.y, 2.4, 1500, 1.0);
    this.fx.shake(22); this.fx.white(0.4); this.fx.flash(0.8);
    this.fx.burst(p.x, p.y, COL.pink, 90, 1100, 1.0, 7, 1);
    this.hitstop = 0.06;
    this.audio.play('bomb');
    return true;
  }

  updateBombRing(dt) {
    const b = this.bombRing;
    if (!b) return;
    b.r += 1900 * dt;
    const dmg = this.stats.damage * 14;
    for (const e of this.enemies) {
      if (!this.hittable(e) || b.hit.has(e.id)) continue;
      const dx = e.x - b.x, dy = e.y - b.y, d = Math.hypot(dx, dy) || 1;
      if (d < b.r + e.r) {
        b.hit.add(e.id);
        this.damageEnemy(e, dmg, null);
        if (!e.dead && !e.boss && !e.def.heavy) { e.vx += (dx / d) * 700; e.vy += (dy / d) * 700; }
      }
    }
    for (const bl of this.bullets) {
      const dx = bl.x - b.x, dy = bl.y - b.y;
      if (!bl.dead && dx * dx + dy * dy < b.r * b.r) { bl.dead = true; this.fx.mote(bl.x, bl.y, COL.pink, 1, 5, 0.4, 200); }
    }
    if (b.r >= b.max) this.bombRing = null;
  }

  // ------------------------------------------------------------------ bosses / run flow
  onBossDeath(e) {
    if (this.enemies.some((o) => o.boss && !o.dead && o !== e)) return;   // twin still alive
    const fx = this.fx;
    for (const b of this.bullets) { b.dead = true; fx.mote(b.x, b.y, COL.bullet, 0.6, 5, 0.5, 200); }
    for (const l of this.lasers) l.dead = true;
    for (const z of this.zones) if (z.kind === 'blast' || z.kind === 'tile' || z.kind === 'web') z.dead = true;
    clearHazards(this);
    for (const o of this.enemies) if (!o.dead && !o.boss) { if (o.xp > 0) this.dropXp(o.x, o.y, o.xp); this.killEnemy(o, true); }
    fx.shock(e.x, e.y, 2.6, 1600, 1.3);
    fx.burst(e.x, e.y, COL.white, 120, 1200, 1.4, 8);
    fx.burst(e.x, e.y, COL[e.def.col] || COL.violet, 140, 900, 1.6, 7);
    fx.shake(30); fx.white(0.6);
    this.timeScale = 0.2;
    this.hitstop = 0.12;
    this.ringArena = null;
    this.dark = null;
    this.bossName = '';
    this.audio.play('bossDeath');
    this.score += 5000 * this.wave;
    this.pickups.push({ ...this.makePickup(e.x, e.y, 'container', 1), vx: 0, vy: 0 });
    this.pending++;
    this.waves.bossDefeated();
    if (this.wave === FINAL_WAVE && !this.endless) this.victoryT = 4.5;
  }

  continueEndless() {
    this.endless = true;
    this.state = 'playing';
    if (this.route.length <= this.sectorIndex + 1) this.openGates();
  }
}
