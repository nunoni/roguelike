// Headless checks: plays seeded bot runs with stubbed visuals/audio and asserts the
// simulation stays sane.   node tools/sim-test.js [--balance N] [--verbose]

import { Game } from '../src/game/game.js';
import { botInput, botChoose } from '../src/game/bot.js';
import { SKILLS, FUSIONS, rollChoices, describeChoice, computeStats, readyFusions } from '../src/game/upgrades.js';
import { DEFS } from '../src/game/enemies.js';
import { UNLOCK } from '../src/game/waves.js';
import { BOSS_ORDER, BOSS_POOLS } from '../src/game/bosses.js';
import { FINAL_WAVE, WAVES_PER_SECTOR, ROUTE_TIERS, SECTORS } from '../src/config.js';

const noop = () => {};
const stub = () => new Proxy({}, { get: () => noop });
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const balanceN = args.includes('--balance') ? Number(args[args.indexOf('--balance') + 1]) || 6 : 0;

let failures = 0;
function check(cond, msg) {
  if (cond) { if (verbose) console.log('  ok   ' + msg); }
  else { failures++; console.log('  FAIL ' + msg); }
}

function sane(g) {
  const bad = (v) => !Number.isFinite(v);
  const p = g.player;
  if (bad(p.x) || bad(p.y) || bad(p.hp)) return 'player ' + JSON.stringify({ x: p.x, y: p.y, hp: p.hp });
  for (const e of g.enemies) if (bad(e.x) || bad(e.y) || bad(e.hp)) return `enemy ${e.type} x=${e.x} y=${e.y} hp=${e.hp}`;
  for (const b of g.projs) if (bad(b.x) || bad(b.y)) return 'projectile';
  for (const b of g.bullets) if (bad(b.x) || bad(b.y)) return 'bullet';
  if (bad(g.xp) || bad(g.score) || bad(g.cam.x)) return 'progress';
  return null;
}

/** Run until `until(g)` or death or the frame limit. Returns stats. */
function run(g, { until, maxSeconds = 3600, onFrame }) {
  const dt = 1 / 60;
  let frames = 0, peak = { enemies: 0, projs: 0, bullets: 0, pickups: 0, zones: 0 };
  let victory = false, err = null;
  const max = maxSeconds * 60;
  while (frames < max) {
    frames++;
    if (g.state === 'levelup') { g.choose(botChoose(g)); continue; }
    if (g.state === 'victory') { victory = true; g.continueEndless(); continue; }
    if (g.state === 'dead') break;
    g.update(dt, botInput(g));
    if (onFrame) onFrame(g, frames);
    if (frames % 30 === 0) {
      err = sane(g);
      if (err) break;
      peak.enemies = Math.max(peak.enemies, g.enemies.length);
      peak.projs = Math.max(peak.projs, g.projs.length);
      peak.bullets = Math.max(peak.bullets, g.bullets.length);
      peak.pickups = Math.max(peak.pickups, g.pickups.length);
      peak.zones = Math.max(peak.zones, g.zones.length);
    }
    if (until && until(g)) break;
  }
  return { frames, peak, victory, err, seconds: frames / 60 };
}

const newGame = (opts) => new Game({ fx: stub(), audio: stub(), ui: stub() }, opts);

// ---------------------------------------------------------------- 1. catalogue
console.log('catalogue');
{
  const ids = new Set(SKILLS.map((s) => s.id));
  check(ids.size === SKILLS.length, 'skill ids are unique');
  check(new Set(FUSIONS.map((f) => f.id)).size === FUSIONS.length, 'fusion ids are unique');
  const sig = new Set(), recipes = new Set();
  for (const f of FUSIONS) {
    check(f.type === 'pair' || f.type === 'cross', `${f.id} has a type`);
    check(f.from[0] !== f.from[1], `${f.id} mixes two different skills`);
    const key = [...f.from].sort().join('+');
    check(!recipes.has(key), `${f.id} is the only recipe for ${key}`);
    recipes.add(key);
    for (const id of f.from) {
      check(ids.has(id), `fusion ${f.id} parent ${id} exists`);
      if (f.type === 'pair') { check(!sig.has(id), `skill ${id} has a single signature fusion`); sig.add(id); }
    }
  }
  const RECIPES_OF_T = {};
  for (const f of FUSIONS) for (const id of f.from) RECIPES_OF_T[id] = (RECIPES_OF_T[id] || 0) + 1;
  check(sig.size === SKILLS.filter((s) => !s.solo).length, 'every skill has a signature partner (except solo skills)');
  for (const s of SKILLS) check((RECIPES_OF_T[s.id] || 0) >= 1, `${s.id} can fuse into something`);
  const g = newGame({ seed: 1 });
  for (const s of SKILLS) for (let l = 1; l <= s.max; l++) check(typeof s.lv(l) === 'string', `${s.id} lv${l} text`);
  for (const s of SKILLS) {
    for (let l = 1; l <= s.max; l++) {
      const st = computeStats({ [s.id]: l }, {});
      check(Object.values(st).every((v) => typeof v !== 'number' || Number.isFinite(v)), `${s.id} lv${l} stats finite`);
    }
  }
  // fusion offered exactly when both parents are maxed
  for (const f of FUSIONS) {
    const g2 = newGame({ seed: 2 });
    const [a, b] = f.from;
    g2.levels[a] = SKILLS.find((s) => s.id === a).max;
    g2.levels[b] = SKILLS.find((s) => s.id === b).max - 1;
    check(!rollChoices(g2).some((c) => c.kind === 'fusion'), `${f.id} not offered early`);
    g2.levels[b]++;
    const ch = rollChoices(g2);
    check(ch[0].kind === 'fusion' && ch[0].id === f.id, `${f.id} offered when ready`);
    check(describeChoice(g2, ch[0]).title === f.name, `${f.id} card text`);
  }
  for (const c of rollChoices(g)) check(!!describeChoice(g, c).title, 'card describes');

  // a skill can only be spent once: Supernova uses up Heartburn, so Thermal Shock is gone
  {
    const g3 = newGame({ seed: 4 });
    for (const id of ['burn', 'burst', 'chill']) g3.levels[id] = SKILLS.find((s) => s.id === id).max;
    const ready = readyFusions(g3.levels, g3.fusions).map((f) => f.id).sort().join(',');
    check(ready === 'supernova,thermal', `competing fusions both ready (${ready})`);
    const ch = rollChoices(g3).filter((c) => c.kind === 'fusion').map((c) => c.id);
    check(ch.length === 2 && ch[0] === 'supernova', `both offered, signature first (${ch})`);
    g3.fusions.supernova = true;
    check(!readyFusions(g3.levels, g3.fusions).length, 'spent skill blocks its other recipes');
    check(!describeChoice(g3, { kind: 'skill', id: 'chain' }).also.includes('Heartburn'), 'cards hide recipes with spent skills');
  }
}

// ---------------------------------------------------------------- 2. full run, invulnerable
console.log('full run (god mode, bot-chosen build)');
{
  const g = newGame({ seed: 7, god: true });
  const t0 = Date.now();
  const plan = [...g.bossPlan];
  let gates = 0, routeAt21 = null;
  const caster = { guarded: 0, ghost: 0, song: 0 };
  const r = run(g, {
    until: (g) => g.wave >= FINAL_WAVE + 2, maxSeconds: 4200,
    onFrame: (g, f) => {
      if (g.gates && g.gates[0].t === 0) gates++;
      if (g.wave === 21 && !routeAt21) routeAt21 = [...g.route];
      if (f % 10 === 0) for (const e of g.enemies) {
        if (e.dead) continue;
        if (e.guardT > 0) caster.guarded++;
        if (e.ghost) caster.ghost++;
        if (e.type === 'siren' && e.state === 1) caster.song++;
      }
    },
  });
  const ms = Date.now() - t0;
  check(!r.err, 'no NaN / infinite values' + (r.err ? ': ' + r.err : ''));
  check(r.victory, `reached victory after wave ${FINAL_WAVE}`);
  check(g.wave >= FINAL_WAVE + 2, `endless continues past the final wave (wave ${g.wave})`);
  for (const [t] of UNLOCK) check(g.stat.seen[t] > 0, `spawned ${t}`);
  for (const b of plan) check(g.stat.seen[b] > 0, `spawned planned boss ${b}`);
  check(plan.every((b, i) => BOSS_POOLS[i].includes(b)), `boss plan drawn from the pools (${plan})`);
  check(gates >= 3, `warp gates opened after the branching bosses (${gates})`);
  check(caster.guarded > 0 && caster.ghost > 0 && caster.song > 0, `chaperones guard, mourners raise ghosts, sirens sing (${JSON.stringify(caster)})`);
  check(g.stat.seen.jar >= 5 && g.stat.jars >= 3, `love jars turn up and get broken (${g.stat.seen.jar} seen, ${g.stat.jars} broken)`);
  check(routeAt21 && routeAt21.length === 5 && routeAt21.every((id, i) => ROUTE_TIERS[i].includes(id)), `route follows the tiers (${routeAt21})`);
  check(g.route.length >= 6, `endless keeps extending the route (${g.route.join(',')})`);
  check(r.peak.enemies <= 420, `enemy count bounded (peak ${r.peak.enemies})`);
  check(r.peak.projs <= 1400, `projectile count bounded (peak ${r.peak.projs})`);
  check(r.peak.bullets <= 900, `bullet count bounded (peak ${r.peak.bullets})`);
  check(r.peak.zones <= 400, `zone count bounded (peak ${r.peak.zones})`);
  console.log(`  ${Math.round(r.seconds)}s simulated in ${ms}ms, level ${g.level}, fusions: ${Object.keys(g.fusions).join(', ') || 'none'}, hits taken ${g.stat.hits}`);
  console.log(`  peaks: ${JSON.stringify(r.peak)}`);
}

// ---------------------------------------------------------------- 3. everything maxed
console.log('all skills maxed + all fusions');
{
  for (const beam of [false, true]) {
    const g = newGame({ seed: 11, god: true });
    for (const s of SKILLS) g.levels[s.id] = s.max;
    for (const f of FUSIONS) if (f.id !== 'lovebeam' || beam) g.fusions[f.id] = true;
    g.setStats();
    g.player.hp = 2;                         // so Bleeding Heart's bonus is active
    let bombs = 0;
    const r = run(g, {
      until: (g) => g.wave >= FINAL_WAVE + 1, maxSeconds: 3600,
      onFrame: (g, f) => { if (f % 600 === 0) { g.bomb = 1; if (g.useBomb()) bombs++; g.heal(3); g.player.hp = 2; } },
    });
    check(!r.err, `no NaN with everything active (beam=${beam})` + (r.err ? ': ' + r.err : ''));
    check(g.wave >= FINAL_WAVE + 1, `maxed build clears all ${FINAL_WAVE} waves (beam=${beam}, wave ${g.wave}, ${Math.round(r.seconds)}s)`);
    check(bombs > 0, 'love bomb fires');
    check(r.peak.projs <= 1400 && r.peak.zones <= 400, `counts bounded when maxed (${JSON.stringify(r.peak)})`);
  }
}

// ---------------------------------------------------------------- 3b. each fusion on its own
console.log('each fusion in combat');
for (const f of FUSIONS) {
  const g = newGame({ seed: 30, god: true });
  for (const id of f.from) g.levels[id] = SKILLS.find((s) => s.id === id).max;
  g.levels.dmg = 2;
  g.fusions[f.id] = true;
  g.setStats();
  g.waves.n = 7; g.waves.timer = 0.1;
  const dmg0 = g.stat.dmg;
  const r = run(g, { maxSeconds: 60 });
  check(!r.err, `${f.id}: no NaN` + (r.err ? ': ' + r.err : ''));
  check(g.stat.dmg > dmg0 && g.kills > 0, `${f.id}: deals damage (${g.kills} kills)`);
  check(r.peak.projs <= 1400 && r.peak.zones <= 400, `${f.id}: counts bounded`);
}

// ---------------------------------------------------------------- 3c. the newer arsenal does its thing
console.log('arsenal mechanics');
{
  const cases = [
    { name: 'The Ex boomerangs', skills: ['ex'], fus: [], probe: (g, s) => { if (g.rangs.some((r) => !r.out)) s.ok = 1; } },
    { name: 'Rose Whip lashes', skills: ['whip'], fus: [], probe: (g, s) => { if (g.lashes.length) s.ok = 1; } },
    { name: 'Mirror Ball beams', skills: ['mirror'], fus: [], probe: (g, s) => { if (g.flashBeams.some((b) => b.col && !b.spot)) s.ok = 1; } },
    { name: 'Love Letter flies', skills: ['letter'], fus: [], probe: (g, s) => { if (g.letters.length) s.ok = 1; } },
    { name: 'Whiplash buzzsaw', skills: ['ex', 'whip'], fus: ['whiplash'], probe: (g, s) => { if (g.rangs.some((r) => r.saw > 0)) s.ok = 1; } },
    { name: 'Fan Mail letters', skills: ['mirror', 'letter'], fus: ['fanmail'], probe: (g, s) => { if (g.projs.some((q) => q.kind === 'letter')) s.ok = 1; } },
    { name: "Cupid's Quiver pins", skills: ['homing', 'split'], fus: ['quiver'], probe: (g, s) => { if (g.enemies.some((e) => e.pins > 1)) s.ok = 1; } },
    { name: 'Laser Tag lines', skills: ['pierce', 'bounce'], fus: ['lasertag'], probe: (g, s) => { if (g.tags.length) s.ok = 1; } },
    { name: 'Gold Rush stream', skills: ['magnet', 'steal'], fus: ['goldrush'], probe: (g, s) => { if (g.pickups.some((k) => k.hit && k.hit.length)) s.ok = 1; } },
    { name: 'Heart of Gold decoy', skills: ['shield', 'hp'], fus: ['heartofgold'], probe: (g, s) => { if (g.decoy) s.ok = 1; else if (g.player.shield && g.player.invuln <= 0) g.hurtPlayer(1, g.player.x, g.player.y); } },
    { name: 'Glow Up nova', skills: ['xp', 'magnet'], fus: ['glowup'], probe: (g, s) => { if (g.stat.glowups > 0) s.ok = 1; } },
    { name: 'Running Wild ram', skills: ['dmg', 'speed'], fus: ['runningwild'], probe: (g, s) => { if (g.player.ram) s.ok = 1; } },
  ];
  for (const c of cases) {
    const g = newGame({ seed: 50, god: true });
    for (const id of c.skills) g.levels[id] = SKILLS.find((k) => k.id === id).max;
    for (const id of c.fus) g.fusions[id] = true;
    g.setStats();
    g.waves.n = 7; g.waves.timer = 0.1;
    const seen = { ok: 0 };
    let err = null;
    for (let f = 0; f < 60 * 50 && !seen.ok && !err; f++) {
      if (g.state === 'levelup') { g.choose(botChoose(g)); continue; }
      const inp = botInput(g);
      if (g.player.hot) inp.dash = true;               // spend Running Wild heat when it is ready
      g.update(1 / 60, inp);
      c.probe(g, seen);
      if (f % 30 === 0) err = sane(g);
    }
    check(!err, `${c.name}: no NaN` + (err ? ': ' + err : ''));
    check(seen.ok, `${c.name}: happens`);
  }
}

// ---------------------------------------------------------------- 3d. every sector's hazard
console.log('sector hazards');
for (const sec of SECTORS) {
  const ti = ROUTE_TIERS.findIndex((t) => t.includes(sec.id));
  const g = newGame({ seed: 40 + ti, god: true });
  for (const sk of SKILLS) g.levels[sk.id] = Math.ceil(sk.max / 2);
  g.setStats();
  g.route = [...ROUTE_TIERS.slice(0, ti).map((t) => t[0]), sec.id];
  const n0 = ti * WAVES_PER_SECTOR + 2;
  g.waves.n = n0 - 1; g.waves.timer = 0.1;
  const seen = { comet: 0, pod: 0, refr: 0, flare: 0, arc: 0, rift: 0, flow: 0, dark: 0 };
  const r = run(g, {
    until: (g) => g.wave > n0 + 1, maxSeconds: 400,
    onFrame: (g) => {
      for (const l of g.lasers) { if (l.kind === 'comet') seen.comet++; if (l.kind === 'arc') seen.arc++; }
      for (const e of g.enemies) if (e.type === 'pod') seen.pod++;
      for (const b of g.bullets) if (b.refr) seen.refr++;
      for (const q of g.projs) if (q.refr) seen.refr++;
      for (const z of g.zones) if (z.flare) seen.flare++;
      if (g.hz.rifts) seen.rift++;
      if (g.hz.fx) seen.flow++;
      if (g.dark && g.dark.hz && g.dark.k > 0.5) seen.dark++;
    },
  });
  const key = { azure: 'comet', verdant: 'pod', crystal: 'refr', ember: 'flare', storm: 'arc', hollow: 'rift', tidal: 'flow', corona: 'dark' }[sec.id];
  check(g.sector.id === sec.id || g.wave > n0, `${sec.id}: plays in its sector`);
  check(!r.err, `${sec.id}: no NaN` + (r.err ? ': ' + r.err : ''));
  check(seen[key] > 0, `${sec.id}: ${sec.hazard.toLowerCase()} happen (${key} ${seen[key]})`);
  check(g.wave > n0 + 1, `${sec.id}: waves still clear (${Math.round(r.seconds)}s)`);
  check(r.peak.bullets <= 900 && r.peak.zones <= 400 && r.peak.projs <= 1400, `${sec.id}: counts bounded (${JSON.stringify(r.peak)})`);
}

// ---------------------------------------------------------------- 4. each boss in isolation
console.log('bosses');
BOSS_POOLS.forEach((pool, i) => {
  for (const type of pool) {
    const g = newGame({ seed: 20 + i, god: true });
    for (const s of SKILLS) g.levels[s.id] = Math.ceil(s.max / 2);
    g.setStats();
    g.bossPlan[i] = type;
    const n = (i + 1) * WAVES_PER_SECTOR;
    g.waves.n = n - 1;
    g.waves.timer = 0.1;
    const r = run(g, { until: (g) => g.wave > n, maxSeconds: 900 });
    check(g.stat.seen[type] > 0, `${type} spawns in sector ${i + 1}`);
    check(!r.err, `${type}: no NaN` + (r.err ? ': ' + r.err : ''));
    check(g.wave > n || r.victory, `${type} can be defeated (${Math.round(r.seconds)}s, bullets peak ${r.peak.bullets}, zones ${r.peak.zones})`);
    check(r.peak.bullets <= 900 && r.peak.zones <= 400, `${type}: counts bounded`);
    check(!g.dark, `${type}: darkness lifts after the fight`);
  }
});

// ---------------------------------------------------------------- 5. mortal run sanity
console.log('mortal run');
{
  const g = newGame({ seed: 3 });
  const r = run(g, { maxSeconds: 3000 });
  check(!r.err, 'no NaN');
  check(g.state === 'dead' || r.victory, `run ends in death or victory (wave ${g.wave}, level ${g.level})`);
}

// ---------------------------------------------------------------- balance survey (optional)
if (balanceN) {
  console.log(`balance survey over ${balanceN} seeds (bot is a weak player)`);
  for (let s = 0; s < balanceN; s++) {
    const g = newGame({ seed: 100 + s * 17 });
    const marks = {};
    const r = run(g, { maxSeconds: 3000, onFrame: (g) => { if (!marks[g.wave]) marks[g.wave] = { t: Math.round(g.time), lvl: g.level }; } });
    const pick = (w) => (marks[w] ? `w${w}@${marks[w].t}s/L${marks[w].lvl}` : '');
    console.log(`  seed ${100 + s * 17}: wave ${g.wave} level ${g.level} ${Math.round(g.time)}s kills ${g.kills} fusions ${Object.keys(g.fusions).length} ${r.victory ? 'WON' : ''}  ${[5, 10, 15, 20].map(pick).join(' ')}`);
  }
}
if (args.includes('--god-pace')) {
  const g = newGame({ seed: 5, god: true });
  const marks = {};
  run(g, { until: (g) => g.wave >= 21, maxSeconds: 3000, onFrame: (g) => { if (!marks[g.wave]) { marks[g.wave] = 1; console.log(`  wave ${g.wave} at ${Math.round(g.time)}s level ${g.level} hits ${g.stat.hits} fusions ${Object.keys(g.fusions).length}`); } } });
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
