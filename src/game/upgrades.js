// Skill catalogue, fusion recipes, and the pure function that turns owned levels
// into the stat block every other system reads.

import { PLAYER } from '../config.js';

// cat: 'stat' | 'tech' (changes how hearts behave) | 'spell' (acts on its own)
export const SKILLS = [
  { id: 'twin', name: 'Twin Flame', cat: 'stat', max: 5, desc: '+1 heart per volley.', lv: (l) => `${l + 1} hearts per volley` },
  { id: 'homing', name: "Cupid's Aim", cat: 'tech', max: 4, desc: 'Hearts curve toward enemies.', lv: (l) => `Seek strength ${l}` },
  { id: 'rate', name: 'Racing Pulse', cat: 'stat', max: 5, desc: '+18% fire rate.', lv: (l) => `+${l * 18}% fire rate` },
  { id: 'pierce', name: 'Piercing Gaze', cat: 'tech', max: 4, desc: 'Hearts pass through one more enemy.', lv: (l) => `Pierce ${l}` },
  { id: 'burst', name: 'Heartburst', cat: 'tech', max: 4, desc: 'Hearts explode on impact.', lv: (l) => `Blast radius ${55 + 15 * l}` },
  { id: 'burn', name: 'Heartburn', cat: 'tech', max: 4, desc: 'Hits set enemies ablaze.', lv: (l) => `Burn ${25 * l}% damage/s` },
  { id: 'chill', name: 'Cold Shoulder', cat: 'tech', max: 4, desc: 'Hits chill; enough chill freezes solid.', lv: (l) => `Chill ${Math.round((0.1 + 0.06 * l) * 100)}% per hit` },
  { id: 'chain', name: 'Sparks Fly', cat: 'tech', max: 4, desc: 'Hits can arc lightning to nearby enemies.', lv: (l) => `${Math.round((0.2 + 0.08 * l) * 100)}% chance, ${1 + l} arcs` },
  { id: 'bounce', name: 'Rebound', cat: 'tech', max: 4, desc: 'Hearts ricochet to another enemy.', lv: (l) => `${l} ricochet${l > 1 ? 's' : ''}` },
  { id: 'split', name: 'Heartbreak', cat: 'tech', max: 4, desc: 'Hearts break into two halves on hit.', lv: (l) => `Halves deal ${30 + 10 * l}%` },
  { id: 'pulse', name: 'Heartbeat', cat: 'spell', max: 4, desc: 'Your ship emits a damaging pulse.', lv: (l) => `Every ${(2.6 - 0.25 * l).toFixed(1)}s, radius ${170 + 35 * l}` },
  { id: 'orbit', name: 'Guardian Hearts', cat: 'spell', max: 4, desc: 'Hearts orbit you, hitting enemies and blocking shots.', lv: (l) => `${l + 1} guardians` },
  { id: 'charm', name: 'Lovestruck', cat: 'tech', max: 4, desc: 'Hits may charm enemies to fight for you.', lv: (l) => `${3 * l}% charm chance` },
  { id: 'drones', name: 'Cherubs', cat: 'spell', max: 4, desc: 'Winged helpers that shoot on their own.', lv: (l) => `${[0, 1, 2, 2, 3][l]} cherub${l > 1 ? 's' : ''}${l === 3 ? ', faster' : ''}` },
  { id: 'well', name: 'Irresistible', cat: 'spell', max: 4, desc: 'Casts a gravity well that drags enemies in.', lv: (l) => `Every ${9 - l}s, radius ${230 + 25 * l}` },
  { id: 'magnet', name: 'Attraction', cat: 'stat', max: 5, desc: 'Wider pickup range and more XP.', lv: (l) => `+${40 * l}% range, +${8 * l}% XP` },
  { id: 'shield', name: 'Guarded Heart', cat: 'spell', max: 4, desc: 'A barrier absorbs one hit, then recharges.', lv: (l) => `Recharge ${(17 - 2.5 * l).toFixed(1)}s` },
  { id: 'dash', name: 'Skip a Beat', cat: 'spell', max: 4, desc: 'More dashes that leave harmful afterimages.', lv: (l) => `${1 + (l >= 1) + (l >= 4)} charges, -${7 * l}% cooldown` },
  { id: 'hp', name: 'Big Heart', cat: 'stat', max: 5, desc: '+1 max health and heal 1.', lv: (l) => `${PLAYER.hp + l} max health` },
  { id: 'steal', name: 'Stolen Heart', cat: 'tech', max: 4, desc: 'Kills may drop a healing heart.', lv: (l) => `${(1.2 * l).toFixed(1)}% per kill` },
  { id: 'crit', name: 'Crush', cat: 'stat', max: 5, desc: '+8% critical chance, harder crits.', lv: (l) => `${5 + 8 * l}% crit, x${(2 + 0.15 * l).toFixed(2)}` },
  { id: 'dmg', name: 'Passion', cat: 'stat', max: 5, desc: '+20% damage.', lv: (l) => `+${20 * l}% damage` },
  { id: 'speed', name: 'Lighthearted', cat: 'stat', max: 5, desc: '+8% move speed, faster dash recharge.', lv: (l) => `+${8 * l}% speed` },
  { id: 'stars', name: 'Shooting Stars', cat: 'spell', max: 4, desc: 'Stars fall on random enemies.', lv: (l) => `Every ${(1.7 - 0.25 * l).toFixed(2)}s` },
];

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
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
export const FUSION_BY_ID = Object.fromEntries(FUSIONS.map((f) => [f.id, f]));
/** skill id -> the fusion it belongs to */
export const FUSION_OF = {};
for (const f of FUSIONS) for (const id of f.from) FUSION_OF[id] = f;
export const partnerOf = (id) => {
  const f = FUSION_OF[id];
  return f ? SKILL_BY_ID[f.from[0] === id ? f.from[1] : f.from[0]] : null;
};

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
    burn: 0.25 * l('burn'),
    chill: l('chill') ? 0.1 + 0.06 * l('chill') : 0,
    chainChance: l('chain') ? 0.2 + 0.08 * l('chain') : 0,
    chainN: 1 + l('chain'),
    charm: 0.03 * l('charm'),
    charmDur: 5,
    crit: 0.05 + 0.08 * l('crit'),
    critMul: 2 + 0.15 * l('crit'),
    magnet: PLAYER.magnet * (1 + 0.4 * l('magnet')),
    xpMul: 1 + 0.08 * l('magnet'),
    steal: 0.012 * l('steal'),
    pulse: l('pulse'),
    orbit: l('orbit'),
    drones: [0, 1, 2, 2, 3][l('drones')],
    droneLvl: l('drones'),
    well: l('well'),
    shield: l('shield'),
    dash: l('dash'),
    stars: l('stars'),
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
  for (const f of FUSIONS) {
    if (F[f.id]) continue;
    const [a, b] = f.from;
    if ((L[a] || 0) >= SKILL_BY_ID[a].max && (L[b] || 0) >= SKILL_BY_ID[b].max) out.push({ kind: 'fusion', id: f.id });
    if (out.length >= n) return out;
  }
  const pool = SKILLS.filter((s) => (L[s.id] || 0) < s.max);
  const owned = Object.keys(L).filter((id) => L[id] > 0).length;
  while (out.length < n && pool.length) {
    const pick = rng.weighted(pool, (s) => {
      let w = 1;
      const lv = L[s.id] || 0;
      if (lv > 0) w *= 3.2;
      else if (owned >= 9) w *= 0.35;          // late on, new skills get rarer
      const p = partnerOf(s.id);
      if (p && (L[p.id] || 0) > 0) w *= 2.2;
      if (p && (L[p.id] || 0) >= p.max) w *= 1.6;
      return w;
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
    return { title: f.name, cat: 'fusion', tag: 'FUSION', desc: f.desc, detail: `${SKILL_BY_ID[f.from[0]].name} + ${SKILL_BY_ID[f.from[1]].name}`, level: 0, max: 0, icon: f.id };
  }
  if (c.kind === 'heal') return { title: 'Second Wind', cat: 'stat', tag: 'BONUS', desc: 'Restore 2 health.', detail: '', level: 0, max: 0, icon: 'hp' };
  if (c.kind === 'score') return { title: 'Love Letter', cat: 'stat', tag: 'BONUS', desc: 'Gain a burst of score and a full Love Bomb.', detail: '', level: 0, max: 0, icon: 'magnet' };
  const s = SKILL_BY_ID[c.id];
  const lv = game.levels[s.id] || 0;
  const p = partnerOf(s.id);
  const f = FUSION_OF[s.id];
  return {
    title: s.name, cat: s.cat, tag: lv === 0 ? 'NEW' : `LV ${lv + 1}`, desc: s.desc, detail: s.lv(lv + 1),
    level: lv + 1, max: s.max, icon: s.id,
    fuse: p && f && !game.fusions[f.id] ? { partner: p.name, result: f.name, ready: (game.levels[p.id] || 0) >= p.max } : null,
  };
}
