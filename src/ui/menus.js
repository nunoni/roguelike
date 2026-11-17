// Screens: title, level-up cards, pause, results, codex, settings.

import { SKILLS, FUSIONS, SKILL_BY_ID, FUSION_OF, describeChoice } from '../game/upgrades.js';
import { icon } from './icons.js';
import { buildTiles } from './hud.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['title', 'levelup', 'pause', 'over', 'how', 'codex', 'settings'];

export class Menus {
  /**
   * app: { save, persist(), audio, applySettings(), onPlay(), onResume(), onRestart(),
   *        onQuit(), onEndless(), onChoose(i), onReroll() }
   */
  constructor(app) {
    this.app = app;
    this.modalBack = null;
    const click = (id, fn) => $(id).addEventListener('click', () => { app.audio.unlock(); app.audio.play('pick'); fn(); });

    click('btn-play', () => app.onPlay());
    click('btn-how', () => this.modal('how'));
    click('btn-codex', () => this.modal('codex'));
    click('btn-settings', () => this.modal('settings'));
    click('btn-pause-codex', () => this.modal('codex'));
    click('btn-resume', () => app.onResume());
    click('btn-restart', () => app.onRestart());
    click('btn-quit', () => app.onQuit());
    click('btn-again', () => app.onRestart());
    click('btn-title', () => app.onQuit());
    click('btn-endless', () => app.onEndless());
    click('btn-reroll', () => app.onReroll());
    for (const b of document.querySelectorAll('.screen.modal .close')) {
      b.addEventListener('click', () => { app.audio.play('pick'); this.closeModal(); });
    }
    for (const b of document.querySelectorAll('.btn')) b.addEventListener('mouseenter', () => app.audio.play('hover'));

    this.buildSettings();
  }

  // ---- screen switching -----------------------------------------------------
  show(name) {
    for (const s of SCREENS) $('screen-' + s).classList.toggle('hidden', s !== name);
    this.current = name;
    this.modalOpen = null;
    if (name === 'title') this.renderBest();
  }
  hideAll() { this.show(null); }

  modal(name) {
    if (name === 'codex') this.renderCodex();
    $('screen-' + name).classList.remove('hidden');
    this.modalOpen = name;
  }
  closeModal() {
    if (!this.modalOpen) return false;
    $('screen-' + this.modalOpen).classList.add('hidden');
    this.modalOpen = null;
    return true;
  }

  // ---- title ----------------------------------------------------------------
  renderBest() {
    const b = this.app.save.best;
    $('best').textContent = b.score > 0
      ? `BEST ${b.score.toLocaleString('en-US')} · WAVE ${b.wave} · ${this.app.save.wins} WIN${this.app.save.wins === 1 ? '' : 'S'}`
      : 'WASD move · mouse aim · space dash';
  }

  // ---- level up -------------------------------------------------------------
  levelUp(g) {
    this.show('levelup');
    const fusion = g.choices.some((c) => c.kind === 'fusion');
    $('lu-title').textContent = fusion ? 'FUSION READY' : 'LEVEL UP';
    $('lu-sub').textContent = g.pending > 1 ? `Choose an upgrade · ${g.pending} pending` : 'Choose an upgrade';
    const wrap = $('cards');
    wrap.innerHTML = '';
    g.choices.forEach((c, i) => {
      const d = describeChoice(g, c);
      const el = document.createElement('button');
      el.className = `card cat-${d.cat}`;
      let pips = '';
      for (let k = 0; k < d.max; k++) pips += `<i class="${k < d.level ? 'on' : ''}"></i>`;
      const fuse = d.fuse
        ? `<div class="fuse${d.fuse.ready ? ' ready' : ''}">+ ${d.fuse.partner} → ${d.fuse.result}</div>`
        : '<div class="fuse"></div>';
      el.innerHTML = `<div class="num">${i + 1}</div><div class="tag">${d.tag}</div>${icon(d.icon, 74)}
        <div class="name">${d.title}</div><div class="desc">${d.desc}</div><div class="detail">${d.detail}</div>
        <div class="pips">${pips}</div>${d.cat === 'fusion' ? '<div class="fuse"></div>' : fuse}`;
      el.addEventListener('mouseenter', () => this.app.audio.play('hover'));
      el.addEventListener('click', () => this.app.onChoose(i));
      wrap.appendChild(el);
    });
    const rr = $('btn-reroll');
    rr.disabled = g.rerolls <= 0 || fusion;
    rr.innerHTML = `REROLL <kbd>R</kbd>`;
  }

  // ---- pause ----------------------------------------------------------------
  pause(g) {
    this.show('pause');
    let html = '';
    for (const f of FUSIONS) {
      if (g.fusions[f.id]) html += `<div class="buildline cat-fusion">${icon(f.id, 20)}<span>${f.name}</span><em>FUSED</em></div>`;
    }
    for (const s of SKILLS) {
      const lv = g.levels[s.id] || 0;
      const f = FUSION_OF[s.id];
      if (!lv || (f && g.fusions[f.id])) continue;
      html += `<div class="buildline cat-${s.cat}">${icon(s.id, 20)}<span>${s.name}</span><em>${lv}/${s.max}</em></div>`;
    }
    $('build').innerHTML = html || '<div class="empty-note">No upgrades yet.</div>';
  }

  // ---- results --------------------------------------------------------------
  results(g, won, records) {
    this.show('over');
    const t = $('over-title');
    t.textContent = won ? 'THE VOID IS SILENT' : 'HEARTBROKEN';
    t.classList.toggle('win', won);
    $('over-sub').textContent = won ? 'You mended the Hollow Heart' : `Fell in sector ${g.sectorIndex + 1}, wave ${g.wave}`;
    const time = `${Math.floor(g.time / 60)}:${String(Math.floor(g.time) % 60).padStart(2, '0')}`;
    const cell = (v, label, isNew) => `<div class="stat${isNew ? ' new' : ''}"><b>${v}</b><span>${label}${isNew ? ' · best' : ''}</span></div>`;
    $('over-stats').innerHTML =
      cell(g.score.toLocaleString('en-US'), 'score', records.score) + cell(g.wave, 'wave', records.wave) +
      cell(g.level, 'level', false) + cell(g.kills.toLocaleString('en-US'), 'kills', false) + cell(time, 'time', false);
    $('over-build').innerHTML = buildTiles(g);
    $('btn-endless').classList.toggle('hidden', !won);
    $('btn-again').textContent = won ? 'NEW RUN' : 'TRY AGAIN';
  }

  // ---- codex ----------------------------------------------------------------
  renderCodex() {
    const found = new Set(this.app.save.codex);
    let html = '';
    for (const f of FUSIONS) {
      const [a, b] = f.from.map((id) => SKILL_BY_ID[id]);
      const ok = found.has(f.id);
      html += `<div class="recipe ${ok ? 'found' : 'locked'}">
        <div class="row"><span class="cat-${a.cat}">${icon(a.id, 20)}</span>${a.name}<span class="plus">+</span><span class="cat-${b.cat}">${icon(b.id, 20)}</span>${b.name}</div>
        <div class="res">${ok ? `<span class="cat-fusion">${icon(f.id, 28)}</span>${f.name}` : '? ? ?'}</div>
        <div class="rdesc">${ok ? f.desc : 'Max out both skills in one run to discover this fusion.'}</div>
      </div>`;
    }
    $('codex').innerHTML = html;
  }

  // ---- settings -------------------------------------------------------------
  buildSettings() {
    const s = this.app.save.settings;
    const rows = [
      ['master', 'Volume', 'range'], ['music', 'Music', 'range'], ['sfx', 'Effects', 'range'],
      ['shake', 'Screen shake', 'range'], ['quality', 'Quality', 'select'], ['autoFire', 'Auto-fire', 'check'],
    ];
    for (const slot of document.querySelectorAll('.settings-slot')) {
      slot.innerHTML = rows.map(([key, label, type]) => {
        if (type === 'range') return `<label class="setting"><span>${label}</span><input type="range" min="0" max="100" data-key="${key}" value="${Math.round(s[key] * 100)}"><output>${Math.round(s[key] * 100)}</output></label>`;
        if (type === 'select') return `<label class="setting"><span>${label}</span><select data-key="${key}">${['low', 'medium', 'high'].map((q) => `<option value="${q}"${s[key] === q ? ' selected' : ''}>${q.toUpperCase()}</option>`).join('')}</select><output></output></label>`;
        return `<label class="setting"><span>${label}</span><span><input type="checkbox" data-key="${key}"${s[key] ? ' checked' : ''}></span><output></output></label>`;
      }).join('');
      slot.addEventListener('input', (e) => {
        const el = e.target, key = el.dataset.key;
        if (!key) return;
        if (el.type === 'range') { s[key] = el.value / 100; el.nextElementSibling.textContent = el.value; }
        else if (el.type === 'checkbox') s[key] = el.checked;
        else s[key] = el.value;
        this.syncSettings(el);
        this.app.applySettings();
        this.app.persist();
      });
    }
  }

  /** Keep the duplicate settings panels (title modal + pause) in step. */
  syncSettings(src) {
    const s = this.app.save.settings;
    for (const el of document.querySelectorAll('.settings-slot [data-key]')) {
      if (el === src) continue;
      const key = el.dataset.key;
      if (el.type === 'range') { el.value = Math.round(s[key] * 100); el.nextElementSibling.textContent = el.value; }
      else if (el.type === 'checkbox') el.checked = !!s[key];
      else el.value = s[key];
    }
  }
}
