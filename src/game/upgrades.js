// Skill catalogue, fusion recipes, and the pure function that turns owned levels
// into the stat block every other system reads.

import { PLAYER } from '../config.js';

// cat: 'stat' | 'tech' (changes how hearts behave) | 'spell' (acts on its own)
export const SKILLS = [
  { id: 'twin', name: 'Twin Flame', cat: 'stat', max: 5, desc: '+1 heart per volley.', lv: (l) => `${l + 1} hearts per volley` },
  { id: 'homing', name: "Cupid's Aim", cat: 'tech', max: 4, desc: 'Hearts curve toward enemies.', lv: (l) => `Seek strength ${l}` },
  { id: 'rate', name: 'Racing Pulse', cat: 'stat', max: 5, desc: '+18% fire rate. Spells cast 9% faster.', lv: (l) => `+${l * 18}% fire rate, +${l * 9}% spell speed` },
  { id: 'pierce', name: 'Piercing Gaze', cat: 'tech', max: 4, desc: 'Hearts pass through one more enemy.', lv: (l) => `Pierce ${l}` },
  { id: 'burst', name: 'Heartburst', cat: 'tech', max: 4, desc: 'Hearts explode on impact.', lv: (l) => `Blast radius ${55 + 15 * l}` },
  { id: 'burn', name: 'Heartburn', cat: 'tech', max: 4, desc: 'Hits set enemies ablaze. Each hit adds a burn stack and rekindles the flames.', lv: (l) => `${23 * l}% damage/s per stack, up to ${2 + l} stacks` },
  { id: 'chill', name: 'Cold Shoulder', cat: 'tech', max: 4, desc: 'Hits chill; enough chill freezes solid.', lv: (l) => `Chill ${Math.round((0.1 + 0.06 * l) * 100)}% per hit` },
  { id: 'chain', name: 'Sparks Fly', cat: 'tech', max: 4, desc: 'Hits can arc lightning to nearby enemies.', lv: (l) => `${Math.round((0.2 + 0.08 * l) * 100)}% chance, ${1 + l} arcs` },
  { id: 'bounce', name: 'Rebound', cat: 'tech', max: 4, desc: 'Hearts ricochet to another enemy.', lv: (l) => `${l} ricochet${l > 1 ? 's' : ''}` },
  { id: 'split', name: 'Heartbreak', cat: 'tech', max: 4, desc: 'Hearts break into two halves on hit.', lv: (l) => `Halves deal ${30 + 10 * l}%` },
  { id: 'pulse', name: 'Heartbeat', cat: 'spell', max: 4, desc: 'Your ship emits a damaging pulse.', lv: (l) => `Every ${(2.6 - 0.25 * l).toFixed(1)}s, radius ${170 + 35 * l}` },
  { id: 'orbit', name: 'Guardian Hearts', cat: 'spell', max: 4, desc: 'Hearts orbit you, hitting enemies and blocking shots.', lv: (l) => `${l + 1} guardians` },
  { id: 'charm', name: 'Lovestruck', cat: 'tech', max: 4, desc: 'Hits may charm enemies to fight for you.', lv: (l) => `${3 * l}% charm chance` },
  { id: 'drones', name: 'Cherubs', cat: 'spell', max: 4, desc: 'Winged helpers that shoot on their own, sharing your extra hearts, fire rate and heart effects.', lv: (l) => `${[0, 1, 2, 2, 3][l]} cherub${l > 1 ? 's' : ''}${l === 3 ? ', faster' : ''}` },
  { id: 'well', name: 'Irresistible', cat: 'spell', max: 4, desc: 'Casts a gravity well that drags enemies in.', lv: (l) => `Every ${9 - l}s, radius ${230 + 25 * l}` },
  { id: 'magnet', name: 'Attraction', cat: 'stat', max: 5, desc: 'Wider pickup range and more XP.', lv: (l) => `+${40 * l}% range, +${8 * l}% XP` },
  { id: 'shield', name: 'Guarded Heart', cat: 'spell', max: 4, desc: 'A barrier absorbs one hit, then recharges.', lv: (l) => `Recharge ${(17 - 2.5 * l).toFixed(1)}s` },
  { id: 'dash', name: 'Skip a Beat', cat: 'spell', max: 4, desc: 'More dashes that leave harmful afterimages.', lv: (l) => `${1 + (l >= 1) + (l >= 4)} charges, -${7 * l}% cooldown` },
  { id: 'hp', name: 'Big Heart', cat: 'stat', max: 5, desc: '+1 max health and heal 1.', lv: (l) => `${PLAYER.hp + l} max health` },
  { id: 'steal', name: 'Stolen Heart', cat: 'tech', max: 4, desc: 'Kills may drop a healing heart.', lv: (l) => `${(1.2 * l).toFixed(1)}% per kill` },
  { id: 'crit', name: 'Crush', cat: 'stat', max: 5, desc: '+8% critical chance, harder crits.', lv: (l) => `${5 + 8 * l}% crit, x${(2 + 0.15 * l).toFixed(2)}` },
  { id: 'dmg', name: 'Passion', cat: 'stat', max: 5, desc: '+20% damage.', lv: (l) => `+${20 * l}% damage` },
  { id: 'speed', name: 'Lighthearted', cat: 'stat', max: 5, desc: '+8% move speed, faster dash recharge.', lv: (l) => `+${8 * l}% speed` },
  { id: 'stars', name: 'Shooting Stars', cat: 'spell', max: 4, desc: 'Stars fall on random enemies. Higher levels call more and bigger stars.', lv: (l) => `${STAR_N[l]} star${STAR_N[l] > 1 ? 's' : ''} every ${(1.7 - 0.1 * l).toFixed(1)}s, radius ${95 + 15 * l}` },
  { id: 'beat', name: 'On the Beat', cat: 'tech', max: 4, desc: 'On every beat of the music your next volley always crits and hits harder.', lv: (l) => `Beat volleys +${20 * l}% damage${l >= 3 ? ', +1 heart' : ''}` },
  { id: 'flutter', name: 'Butterflies', cat: 'spell', max: 4, desc: 'Butterflies flutter around you and dart at enemies.', lv: (l) => `${FLUTTER_N[l]} butterflies` },
  { id: 'envy', name: 'Jealousy', cat: 'tech', max: 4, desc: 'Hits stack Jealousy: the enemy takes more damage from everything.', lv: (l) => `+${(1.8 * l).toFixed(1)}% damage taken per stack, up to 5` },
  { id: 'strings', name: 'Heartstrings', cat: 'tech', max: 4, desc: 'Hits tie enemies together; damage to one also hurts the other.', lv: (l) => `${25 + 10 * (l - 1)}% of damage shared` },
  { id: 'ex', name: 'The Ex', cat: 'spell', max: 4, desc: 'Throws a big boomerang heart that always comes back, piercing on the way out and on the way home.', lv: (l) => `${l >= 3 ? 2 : 1} boomerang${l >= 3 ? 's' : ''} every ${(2.4 - 0.2 * l).toFixed(1)}s, ${Math.round((1.6 + 0.5 * l) * 100)}% damage` },
  { id: 'whip', name: 'Rose Whip', cat: 'spell', max: 4, desc: 'A thorny whip lashes at nearby enemies, cutting bullets out of the air and pulling enemies in.', lv: (l) => `Every ${(2 - 0.2 * l).toFixed(1)}s, reach ${200 + 30 * l}, ${Math.round((2 + 0.6 * l) * 100)}% damage` },
  { id: 'mirror', name: 'Mirror Ball', cat: 'spell', max: 4, desc: 'A disco ball floats ahead of you. Hearts fired through it scatter into light beams, and on the beat it spotlights enemies.', lv: (l) => `${MIRROR_N[l]} beam${MIRROR_N[l] > 1 ? 's' : ''} per heart, ${l} spotlight${l > 1 ? 's' : ''} every other beat` },
  { id: 'xp', name: 'Sweetheart', cat: 'stat', max: 5, solo: true, desc: 'Everyone wants to be near you: +15% XP from everything.', lv: (l) => `+${15 * l}% XP` },
  { id: 'letter', name: 'Love Letter', cat: 'spell', max: 4, desc: 'A sealed letter drifts into the thickest crowd and bursts open into a spiral of hearts.', lv: (l) => `Every ${(4.6 - 0.5 * l).toFixed(1)}s, ${10 + 4 * l} hearts` },
];

const FLUTTER_N = [0, 2, 3, 4, 6];
const STAR_N = [0, 1, 2, 2, 3];
const MIRROR_N = [0, 1, 2, 2, 3];

// type 'pair': each skill's signature fusion. type 'cross': mixes skills from
// different pairs. A skill can only ever be spent on one fusion per run.
export const FUSIONS = [
  { id: 'heartstorm', name: 'Heartstorm', from: ['twin', 'homing'], desc: 'Every volley also releases a swarm of mini seeker hearts.' },
  { id: 'lovebeam', name: 'Love Beam', from: ['rate', 'pierce'], desc: 'Your hearts merge into a continuous beam that pierces everything.' },
  { id: 'supernova', name: 'Supernova', from: ['burst', 'burn'], desc: 'Burning enemies detonate on death, spreading fire and leaving flames.' },
  { id: 'absolutezero', name: 'Absolute Zero', from: ['chill', 'chain'], desc: 'Frozen enemies take +50% damage and shatter into ice shards; arcs chill hard.' },
  { id: 'kaleidoscope', name: 'Kaleidoscope', from: ['bounce', 'split'], desc: 'Every ricochet splits the heart, and the halves ricochet too.' },
  { id: 'pulsar', name: 'Pulsar', from: ['pulse', 'orbit'], desc: 'On every Heartbeat each guardian fires a beam outward.' },
  { id: 'entourage', name: 'Entourage', from: ['charm', 'drones'], desc: 'Charm lasts twice as long; charmed enemies that die return as ghost cherubs.' },
  { id: 'eventhorizon', name: 'Event Horizon', from: ['well', 'magnet'], desc: 'Gravity wells swallow bullets into XP, then implode violently.' },
  { id: 'comet', name: 'Comet Heart', from: ['shield', 'dash'], desc: 'Dashing turns you into a comet: it smashes enemies and reflects bullets.' },
  { id: 'bleedingheart', name: 'Bleeding Heart', from: ['hp', 'steal'], desc: 'Healing at full health fires seeker hearts; each missing heart adds +12% damage.' },
  { id: 'heartstopper', name: 'Heartstopper', from: ['crit', 'dmg'], desc: 'Crits execute enemies below 25% health with a shockwave.' },
  { id: 'stardust', name: 'Stardust Waltz', from: ['speed', 'stars'], desc: 'Moving leaves a burning stardust trail and doubles the starfall.' },
  { id: 'ballroom', name: 'Ballroom', from: ['beat', 'flutter'], desc: 'Twice the butterflies. On every beat they all swoop on one enemy for triple damage.' },
  { id: 'soulmates', name: 'Soulmates', from: ['envy', 'strings'], desc: 'Tied enemies share burns, chill and Jealousy. When one dies, its partner takes a heartbreak burst.' },
  { id: 'whiplash', name: 'Whiplash', from: ['ex', 'whip'], desc: 'Catching your boomerang whips it into a buzzsaw that spins around you, shredding enemies and bullets.' },
  { id: 'fanmail', name: 'Fan Mail', from: ['mirror', 'letter'], desc: 'On every beat the Mirror Ball mails a homing letter to each enemy in its light. Letters burst into hearts.' },

  { id: 'thermal', type: 'cross', name: 'Thermal Shock', from: ['burn', 'chill'], desc: 'Freezing a burning enemy, or igniting a frozen one, sets off a steam blast fuelled by its burn stacks.' },
  { id: 'wildfire', type: 'cross', name: 'Wildfire', from: ['burn', 'chain'], desc: 'Lightning arcs carry the flames: each arc adds 2 burn stacks.' },
  { id: 'fever', type: 'cross', name: 'Fever Pitch', from: ['burn', 'pulse'], desc: 'Every Heartbeat adds 3 burn stacks to everything it touches.' },
  { id: 'starburst', type: 'cross', name: 'Starburst', from: ['burst', 'stars'], desc: 'Falling stars burst into a ring of 8 hearts.' },
  { id: 'singularity', type: 'cross', name: 'Singularity', from: ['well', 'stars'], desc: 'When a gravity well collapses, 5 stars rain onto its center.' },
  { id: 'halo', type: 'cross', name: 'Halo', from: ['drones', 'orbit'], desc: '+1 cherub. Cherubs block bullets and hurt enemies they touch.' },
  { id: 'thunderstruck', type: 'cross', name: 'Thunderstruck', from: ['crit', 'chain'], desc: 'Every crit arcs lightning.' },
  { id: 'skipping', type: 'cross', name: 'Skipping Heart', from: ['dash', 'pulse'], desc: 'Every dash ends with a Heartbeat.' },
  { id: 'serenade', type: 'cross', name: 'Serenade', from: ['charm', 'pulse'], desc: 'Heartbeat has a 25% chance to charm each enemy it hits.' },
  { id: 'choir', type: 'cross', name: 'Choir', from: ['twin', 'drones'], desc: '+1 cherub. Cherubs fire as many hearts as you do.' },
  { id: 'encore', type: 'cross', name: 'Encore', from: ['beat', 'rate'], desc: 'Beat volleys fire twice.' },
  { id: 'kiss', type: 'cross', name: 'Butterfly Kiss', from: ['flutter', 'charm'], desc: 'Butterfly strikes have a 15% chance to charm.' },
  { id: 'livewire', type: 'cross', name: 'Live Wire', from: ['strings', 'chain'], desc: 'Heartstrings crackle, zapping both tied enemies twice a second.' },
  { id: 'heartache', type: 'cross', name: 'Heartache', from: ['envy', 'crit'], desc: 'Crits add 3 Jealousy stacks, and jealous enemies take +25% crit damage.' },
  { id: 'quiver', type: 'cross', name: "Cupid's Quiver", from: ['homing', 'split'], desc: 'Broken halves seek and stick into enemies like arrows. A second later they all rip out at once; the more arrows, the bigger the burst.' },
  { id: 'lasertag', type: 'cross', name: 'Laser Tag', from: ['pierce', 'bounce'], desc: 'Every pierce and ricochet draws a burning laser between the heart\'s last two hit points.' },
  { id: 'goldrush', type: 'cross', name: 'Gold Rush', from: ['magnet', 'steal'], desc: 'XP you pull in becomes a golden stream that hurts every enemy it flies through. Every 150 XP drops a healing heart.' },
  { id: 'heartofgold', type: 'cross', name: 'Heart of Gold', from: ['shield', 'hp'], desc: 'When your barrier breaks it leaves a golden decoy. Enemies chase and shoot it instead of you, then it explodes.' },
  { id: 'glowup', type: 'cross', name: 'Glow Up', from: ['xp', 'magnet'], desc: 'Every level-up releases a nova that wipes nearby bullets, blasts enemies around you and pulls in all XP on the map.' },
  { id: 'runningwild', type: 'cross', name: 'Running Wild', from: ['dmg', 'speed'], desc: 'Moving builds heat. When it is full your next dash becomes a flaming ram that bulldozes enemies and bullets.' },
];
for (const f of FUSIONS) f.type ||= 'pair';

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
export const FUSION_BY_ID = Object.fromEntries(FUSIONS.map((f) => [f.id, f]));
/** skill id -> its signature fusion */
export const PAIR_OF = {};
/** skill id -> every fusion it can be part of, signature first */
export const RECIPES_OF = {};
for (const f of FUSIONS) {
  for (const id of f.from) {
    if (f.type === 'pair') PAIR_OF[id] = f;
    (RECIPES_OF[id] ||= []).push(f);
  }
}
for (const id in RECIPES_OF) RECIPES_OF[id].sort((a, b) => (a.type === 'pair' ? 0 : 1) - (b.type === 'pair' ? 0 : 1));
export const otherOf = (f, id) => (f.from[0] === id ? f.from[1] : f.from[0]);
/** The signature partner skill. */
export const partnerOf = (id) => {
  const f = PAIR_OF[id];
  return f ? SKILL_BY_ID[otherOf(f, id)] : null;
};
/** Skills already spent on an owned fusion. */
export function usedSkills(F) {
  const out = new Set();
  for (const f of FUSIONS) if (F[f.id]) for (const id of f.from) out.add(id);
  return out;
}
/** Fusions whose two skills are maxed and still free. */
export function readyFusions(L, F) {
  const used = usedSkills(F);
  return FUSIONS.filter((f) => !F[f.id] && f.from.every((id) => !used.has(id) && (L[id] || 0) >= SKILL_BY_ID[id].max));
}

export function computeStats(L, F, bonusHp = 0) {
  const l = (id) => L[id] || 0;
  const s = {
    maxHp: PLAYER.hp + l('hp') + bonusHp,
    speed: PLAYER.speed * (1 + 0.08 * l('speed')),
    damage: PLAYER.damage * (1 + 0.2 * l('dmg')),
    fireRate: PLAYER.fireRate * (1 + 0.18 * l('rate')),
    multishot: 1 + l('twin'),
    shotMul: Math.pow(0.9, l('twin')),
    projSpeed: PLAYER.projSpeed,
    projLife: PLAYER.projLife,
    homing: [0, 2.2, 3.6, 5, 7][l('homing')],
    pierce: l('pierce'),
    bounce: l('bounce'),
    split: l('split'),
    splitMul: 0.3 + 0.1 * l('split'),
    explodeR: l('burst') ? 55 + 15 * l('burst') : 0,
    explodeMul: 0.35 + 0.1 * l('burst'),
    burn: 0.23 * l('burn'),
    burnMax: l('burn') ? 2 + l('burn') : 3,   // fire from fusions still stacks a little
    chill: l('chill') ? 0.1 + 0.06 * l('chill') : 0,
    chainChance: l('chain') ? 0.2 + 0.08 * l('chain') : 0,
    chainN: 1 + l('chain'),
    charm: 0.03 * l('charm'),
    charmDur: 5,
    crit: 0.05 + 0.08 * l('crit'),
    critMul: 2 + 0.15 * l('crit'),
    magnet: PLAYER.magnet * (1 + 0.4 * l('magnet')),
    xpMul: 1 + 0.08 * l('magnet') + 0.15 * l('xp'),
    steal: 0.012 * l('steal'),
    pulse: l('pulse'),
    orbit: l('orbit'),
    drones: [0, 1, 2, 2, 3][l('drones')] + (F.halo ? 1 : 0) + (F.choir ? 1 : 0),
    droneLvl: l('drones'),
    well: l('well'),
    shield: l('shield'),
    dash: l('dash'),
    stars: l('stars'),
    starN: STAR_N[l('stars')],
    starR: 95 + 15 * l('stars'),
    spellRate: 1 + 0.09 * l('rate'),
    beat: l('beat'),
    flutter: FLUTTER_N[l('flutter')] * (F.ballroom ? 2 : 1),
    envy: 0.018 * l('envy'),
    strings: l('strings') ? 0.25 + 0.1 * (l('strings') - 1) : 0,
    ex: l('ex'),
    whip: l('whip'),
    mirror: l('mirror'),
    mirrorN: MIRROR_N[l('mirror')],
    letter: l('letter'),
    dashCharges: 1 + (l('dash') >= 1 ? 1 : 0) + (l('dash') >= 4 ? 1 : 0),
    dashCd: PLAYER.dashCd * (1 - 0.07 * l('dash')) * (1 - 0.04 * l('speed')),
    fus: { ...F },
  };
  if (F.heartstopper) s.critMul += 0.5;
  if (F.bleedingheart) s.steal *= 2;
  if (F.entourage) s.charmDur *= 2;
  return s;
}

/**
 * Build the level-up offer. Ready fusions are always offered first; the rest is
 * a weighted draw that favours skills you already own and their fusion partners,
 * so builds converge instead of spreading thin.
 */
export function rollChoices(game, n = 3) {
  const { levels: L, fusions: F, rng } = game;
  const out = [];
  // ready fusions first: signature ones, then cross-fusions, each in random order
  const ready = readyFusions(L, F).map((f) => ({ f, k: (f.type === 'pair' ? 0 : 1) + rng.next() }));
  ready.sort((a, b) => a.k - b.k);
  for (const { f } of ready) {
    if (out.length >= n) return out;
    out.push({ kind: 'fusion', id: f.id });
  }
  const used = usedSkills(F);
  const pool = SKILLS.filter((s) => (L[s.id] || 0) < s.max);
  const owned = Object.keys(L).filter((id) => L[id] > 0).length;
  while (out.length < n && pool.length) {
    const pick = rng.weighted(pool, (s) => {
      let w = 1;
      const lv = L[s.id] || 0;
      if (lv > 0) w *= 4;
      else if (owned >= 7) w *= 0.35;          // late on, new skills get rarer
      // lean toward skills that complete a fusion with something you own
      let best = 1;
      for (const f of RECIPES_OF[s.id] || []) {
        if (F[f.id]) continue;
        const o = otherOf(f, s.id);
        const ol = L[o] || 0;
        if (!ol || used.has(o)) continue;
        let b = f.type === 'pair' ? 2.2 : 1.6;
        if (ol >= SKILL_BY_ID[o].max) b *= 1.6;
        if (b > best) best = b;
      }
      return w * best;
    });
    pool.splice(pool.indexOf(pick), 1);
    out.push({ kind: 'skill', id: pick.id });
  }
  while (out.length < n) out.push({ kind: out.length % 2 ? 'score' : 'heal', id: out.length % 2 ? 'score' : 'heal' });
  return out;
}

/** Human-readable card content for a choice. */
export function describeChoice(game, c) {
  if (c.kind === 'fusion') {
    const f = FUSION_BY_ID[c.id];
    return { title: f.name, cat: 'fusion', tag: f.type === 'pair' ? 'FUSION' : 'CROSS FUSION', desc: f.desc, detail: `${SKILL_BY_ID[f.from[0]].name} + ${SKILL_BY_ID[f.from[1]].name}`, level: 0, max: 0, icon: f.id };
  }
  if (c.kind === 'heal') return { title: 'Second Wind', cat: 'stat', tag: 'BONUS', desc: 'Restore 2 health.', detail: '', level: 0, max: 0, icon: 'hp' };
  if (c.kind === 'score') return { title: 'Sweet Nothings', cat: 'stat', tag: 'BONUS', desc: 'Gain a burst of score and a full Love Bomb.', detail: '', level: 0, max: 0, icon: 'magnet' };
  const s = SKILL_BY_ID[c.id];
  const L = game.levels, F = game.fusions;
  const lv = L[s.id] || 0;
  const used = usedSkills(F);
  const p = partnerOf(s.id);
  const f = PAIR_OF[s.id];
  const free = (o) => !used.has(o);
  const also = (RECIPES_OF[s.id] || [])
    .filter((r) => r.type === 'cross' && !F[r.id] && free(otherOf(r, s.id)))
    .map((r) => SKILL_BY_ID[otherOf(r, s.id)].name);
  return {
    title: s.name, cat: s.cat, tag: lv === 0 ? 'NEW' : `LV ${lv + 1}`, desc: s.desc, detail: s.lv(lv + 1),
    level: lv + 1, max: s.max, icon: s.id,
    fuse: p && f && !F[f.id] && free(p.id) ? { partner: p.name, result: f.name, ready: (L[p.id] || 0) >= p.max } : null,
    also,
  };
}
