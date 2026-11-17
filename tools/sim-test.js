// Headless checks: plays seeded bot runs with stubbed visuals/audio and asserts the
// simulation stays sane.   node tools/sim-test.js [--balance N] [--verbose]

import { Game } from '../src/game/game.js';
import { botInput, botChoose } from '../src/game/bot.js';
import { SKILLS, FUSIONS, rollChoices, describeChoice, computeStats } from '../src/game/upgrades.js';
import { DEFS } from '../src/game/enemies.js';
import { UNLOCK } from '../src/game/waves.js';
import { BOSS_ORDER } from '../src/game/bosses.js';

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
  const used = new Set();
  for (const f of FUSIONS) for (const id of f.from) {
    check(ids.has(id), `fusion ${f.id} parent ${id} exists`);
    check(!used.has(id), `skill ${id} belongs to a single fusion`);
    used.add(id);
  }
  check(used.size === SKILLS.length, 'every skill has a fusion partner');
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
}

// ---------------------------------------------------------------- 2. full run, invulnerable
console.log('full run (god mode, bot-chosen build)');
{
  const g = newGame({ seed: 7, god: true });
  const t0 = Date.now();
  const r = run(g, { until: (g) => g.wave >= 22, maxSeconds: 3000 });
  const ms = Date.now() - t0;
  check(!r.err, 'no NaN / infinite values' + (r.err ? ': ' + r.err : ''));
  check(r.victory, 'reached victory after wave 20');
  check(g.wave >= 22, `endless continues past the final wave (wave ${g.wave})`);
  for (const [t] of UNLOCK) check(g.stat.seen[t] > 0, `spawned ${t}`);
  for (const b of BOSS_ORDER) check(g.stat.seen[b] > 0, `spawned boss ${b}`);
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
      until: (g) => g.wave >= 21, maxSeconds: 2400,
      onFrame: (g, f) => { if (f % 600 === 0) { g.bomb = 1; if (g.useBomb()) bombs++; g.heal(3); g.player.hp = 2; } },
    });
    check(!r.err, `no NaN with everything active (beam=${beam})` + (r.err ? ': ' + r.err : ''));
    check(g.wave >= 21, `maxed build clears all 20 waves (beam=${beam}, wave ${g.wave}, ${Math.round(r.seconds)}s)`);
    check(bombs > 0, 'love bomb fires');
    check(r.peak.projs <= 1400 && r.peak.zones <= 400, `counts bounded when maxed (${JSON.stringify(r.peak)})`);
  }
}

// ---------------------------------------------------------------- 4. each boss in isolation
console.log('bosses');
for (let i = 0; i < 4; i++) {
  const g = newGame({ seed: 20 + i, god: true });
  for (const s of SKILLS) g.levels[s.id] = Math.ceil(s.max / 2);
  g.setStats();
  g.waves.n = (i + 1) * 5 - 1;
  g.waves.timer = 0.1;
  const r = run(g, { until: (g) => g.wave > (i + 1) * 5, maxSeconds: 900 });
  check(!r.err, `${BOSS_ORDER[i]}: no NaN` + (r.err ? ': ' + r.err : ''));
  check(g.wave > (i + 1) * 5 || r.victory, `${BOSS_ORDER[i]} can be defeated (${Math.round(r.seconds)}s, bullets peak ${r.peak.bullets})`);
}

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
