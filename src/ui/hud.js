// In-run HUD. Polls the game each frame and only touches the DOM when a value changes.

import { SKILLS, FUSIONS, usedSkills } from '../game/upgrades.js';
import { WAVES_PER_SECTOR } from '../config.js';
import { icon, heartSvg } from './icons.js';

const $ = (id) => document.getElementById(id);

/** Small skill tiles; shared by the HUD and the results screen. */
export function buildTiles(g) {
  let html = '';
  const used = usedSkills(g.fusions);
  for (const f of FUSIONS) {
    if (g.fusions[f.id]) html += `<div class="skill cat-fusion" title="${f.name}">${icon(f.id)}</div>`;
  }
  for (const s of SKILLS) {
    const lv = g.levels[s.id] || 0;
    if (!lv) continue;
    if (used.has(s.id)) continue;                // folded into its fusion
    let pips = '';
    for (let i = 0; i < s.max; i++) pips += `<i class="${i < lv ? 'on' : ''}"></i>`;
    html += `<div class="skill cat-${s.cat}${lv >= s.max ? ' maxed' : ''}" title="${s.name}">${icon(s.id)}<div class="lv">${pips}</div></div>`;
  }
  return html;
}

export class Hud {
  constructor() {
    this.el = $('hud');
    this.cache = {};
    this.bannerT = null;
  }

  show(on) { this.el.classList.toggle('hidden', !on); }
  reset() { this.cache = {}; $('banner').className = ''; }

  set(key, value, fn) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    fn(value);
  }

  banner(title, sub = '', kind = 'wave') {
    const b = $('banner');
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub;
    b.className = '';
    void b.offsetWidth;                         // restart the CSS animation
    b.className = 'show ' + kind;
  }

  update(g) {
    const p = g.player, st = g.stats;

    this.set('hp', `${p.hp}/${st.maxHp}/${p.shield}`, () => {
      let html = '';
      for (let i = 0; i < st.maxHp; i++) html += heartSvg(i < p.hp ? (p.hp === 1 ? 'last' : '') : 'empty');
      if (p.shield) html += heartSvg('shield');
      $('hearts').innerHTML = html;
    });
    this.set('xp', Math.round((g.xp / g.xpNeed) * 200), (v) => { $('xpfill').style.width = v / 2 + '%'; });
    this.set('level', g.level, (v) => { $('level').textContent = v; });

    const sec = Math.floor((Math.max(1, g.wave) - 1) / WAVES_PER_SECTOR) + 1;
    this.set('wave', `${g.wave}/${g.endless}`, () => {
      $('wave').textContent = g.wave < 1 ? 'GET READY' : `SECTOR ${sec} · WAVE ${g.wave}${g.endless ? ' · ENDLESS' : ''}`;
    });
    this.set('prog', Math.round(g.waves.progress * 100), (v) => { $('wavefill').style.width = v + '%'; });

    let bossHp = 0, bossMax = 0;
    for (const e of g.enemies) if (e.boss && !e.dead) { bossHp += Math.max(0, e.hp); bossMax += e.maxHp; }
    const hasBoss = bossMax > 0;
    this.set('boss', hasBoss, (v) => { $('boss').classList.toggle('hidden', !v); $('waveprog').classList.toggle('hidden', v); });
    if (hasBoss) {
      // a dead twin still counts toward the bar's full length
      if (!this.bossMax || bossMax > this.bossMax) this.bossMax = bossMax;
      this.set('bossname', g.bossName, (v) => { $('bossname').textContent = v; });
      this.set('bosshp', Math.round((bossHp / this.bossMax) * 300), (v) => { $('bossfill').style.width = v / 3 + '%'; });
    } else this.bossMax = 0;

    this.set('score', g.score, (v) => { $('score').textContent = v.toLocaleString('en-US'); });
    this.set('combo', g.combo >= 5 ? g.combo : 0, (v) => { $('combo').textContent = v ? `COMBO x${(1 + Math.min(v, 100) / 25).toFixed(1)}` : ''; });
    this.set('clock', Math.floor(g.time), (v) => { $('clock').textContent = `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; });

    const dashFrac = p.dashCharges < st.dashCharges ? Math.round((p.dashCdT / st.dashCd) * 10) : 0;
    this.set('dash', `${p.dashCharges}/${st.dashCharges}/${dashFrac}`, () => {
      let html = '';
      for (let i = 0; i < st.dashCharges; i++) {
        if (i < p.dashCharges) html += '<div class="pip on"></div>';
        else if (i === p.dashCharges) html += `<div class="pip"><i style="height:${dashFrac * 10}%"></i></div>`;
        else html += '<div class="pip"></div>';
      }
      $('dashpips').innerHTML = html;
    });
    this.set('bomb', Math.round(g.bomb * 100), (v) => {
      $('bombfill').style.width = v + '%';
      $('ab-bomb').classList.toggle('ready', v >= 100);
    });

    let sig = '';
    for (const id in g.levels) sig += id + g.levels[id];
    for (const id in g.fusions) sig += id;
    this.set('skills', sig, () => { $('skills').innerHTML = buildTiles(g); });
  }
}

