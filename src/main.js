// Boot, main loop and the glue between simulation, renderer, audio and UI.

import { ARENA, SECTORS, QUALITY } from './config.js';
import { Renderer } from './gfx/renderer.js';
import { Fx } from './gfx/fx.js';
import { AudioSys, nullAudio } from './audio/audio.js';
import { Input } from './core/input.js';
import { loadSave, writeSave } from './core/save.js';
import { damp } from './core/math.js';
import { Game } from './game/game.js';
import { drawGame } from './game/draw.js';
import { botInput, botChoose } from './game/bot.js';
import { SKILLS, FUSIONS } from './game/upgrades.js';
import { spawnEnemy } from './game/enemies.js';
import { Hud } from './ui/hud.js';
import { Menus } from './ui/menus.js';

const params = new URLSearchParams(location.search);
const dev = { bot: params.has('bot'), ff: Number(params.get('ff') || 0), shot: params.get('shot'), debug: params.has('debug') };
const errBox = document.getElementById('err');

function report(msg) {
  errBox.classList.remove('hidden');
  errBox.textContent += msg + '\n';
  if (dev.shot || params.has('dev')) fetch('/__dev/log?name=' + (dev.shot || 'page'), { method: 'POST', body: msg }).catch(() => {});
}
window.addEventListener('error', (e) => report(`${e.message}\n  at ${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => report(String(e.reason && e.reason.stack || e.reason)));

function boot() {
  const canvas = document.getElementById('game');
  const renderer = new Renderer(canvas, { preserve: !!dev.shot });
  const fx = new Fx();
  const audio = new AudioSys();
  const input = new Input(canvas);
  const save = loadSave();
  const hud = new Hud();
  const noUi = new Proxy({}, { get: () => () => {} });

  let mode = 'title';
  let paused = false;
  let game = null;
  let vtime = 0;
  const pal = { c1: [...SECTORS[0].c1], c2: [...SECTORS[0].c2], c3: [...SECTORS[0].c3], grid: [...SECTORS[0].grid] };

  // ---------------------------------------------------------------- settings
  function applySettings() {
    const s = save.settings;
    audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx });
    renderer.setQuality(s.quality);
    fx.density = (QUALITY[s.quality] || QUALITY.high).particles;
    fx.shakeScale = s.shake;
    input.autoFire = !!s.autoFire;
  }
  const persist = () => writeSave(save);

  // ---------------------------------------------------------------- run control
  const uiHooks = {
    banner: (title, sub, kind) => hud.banner(title, sub, kind),
    levelUp: (g) => { document.body.classList.remove('playing'); menus.levelUp(g); },
    fusion: (f) => {
      hud.banner(f.name, 'FUSION', 'fusion');
      if (!save.codex.includes(f.id)) { save.codex.push(f.id); persist(); }
    },
    gameOver: (g) => finish(g, false),
    victory: (g) => finish(g, true),
  };

  function finish(g, won) {
    const records = { score: g.score > save.best.score, wave: g.wave > save.best.wave };
    if (records.score) save.best.score = g.score;
    if (records.wave) save.best.wave = g.wave;
    save.best.level = Math.max(save.best.level, g.level);
    if (won) save.wins++;
    persist();
    document.body.classList.remove('playing');
    audio.setIntensity(0);
    menus.results(g, won, records);
  }

  function startAttract() {
    mode = 'title';
    paused = false;
    game = new Game({ fx, audio: nullAudio(), ui: noUi }, { attract: true, god: true });
    // a lively demo: a mid-game build from the start
    for (const id of ['twin', 'twin', 'homing', 'burst', 'chain', 'orbit', 'orbit', 'pulse', 'rate', 'rate', 'drones']) game.levels[id] = (game.levels[id] || 0) + 1;
    game.setStats();
    game.waves.n = 2;
    fx.reset();
    hud.show(false);
    document.body.classList.remove('playing');
    audio.setIntensity(0);
    menus.show('title');
  }

  function startRun() {
    audio.unlock();
    audio.startMusic();
    mode = 'run';
    paused = false;
    const seed = params.has('seed') ? Number(params.get('seed')) : undefined;
    game = new Game({ fx, audio, ui: uiHooks }, { seed, god: params.has('god') });
    if (params.has('max')) {                    // dev: everything unlocked
      for (const s of SKILLS) game.levels[s.id] = s.max;
      for (const f of FUSIONS) if (f.id !== 'lovebeam' || params.get('max') === 'beam') game.fusions[f.id] = true;
      game.setStats();
    }
    if (params.has('half')) {                   // dev: a mid-run build
      for (const s of SKILLS) game.levels[s.id] = Math.floor(s.max / 2);
      game.setStats();
    }
    if (params.has('wave')) { game.waves.n = Number(params.get('wave')) - 1; game.waves.timer = 0.5; }
    if (params.has('stress')) {
      for (let i = 0; i < 400; i++) spawnEnemy(game, ['drifter', 'mote', 'spitter', 'splitter'][i % 4], (Math.random() - 0.5) * 3000, (Math.random() - 0.5) * 2000, {});
    }
    fx.reset();
    hud.reset();
    hud.show(true);
    menus.hideAll();
    document.body.classList.add('playing');
    game.viewHalf = renderer.viewHalf;
  }

  function setPaused(p) {
    if (mode !== 'run' || game.state !== 'playing') return;
    paused = p;
    audio.setPaused(p);
    document.body.classList.toggle('playing', !p);
    if (p) menus.pause(game); else menus.hideAll();
  }

  const menus = new Menus({
    save, persist, audio, applySettings,
    onPlay: startRun,
    onResume: () => setPaused(false),
    onRestart: startRun,
    onQuit: startAttract,
    onEndless: () => { game.continueEndless(); menus.hideAll(); document.body.classList.add('playing'); audio.setIntensity(2); },
    onChoose: choose,
    onReroll: () => { if (game.reroll()) { audio.play('pick'); menus.levelUp(game); } },
  });

  function choose(i) {
    if (!game || game.state !== 'levelup' || !game.choices[i]) return;
    audio.play('pick');
    game.choose(i);
    if (game.state === 'playing') { menus.hideAll(); document.body.classList.add('playing'); }
  }

  // ---------------------------------------------------------------- per-frame
  function handleKeys() {
    if (input.take('KeyM')) audio.toggleMute();
    if (mode === 'title') {
      if (input.take('Escape')) menus.closeModal();
      else if (!menus.modalOpen && input.take('Enter')) { audio.unlock(); startRun(); }
      return;
    }
    if (input.take('KeyF')) {
      save.settings.autoFire = input.autoFire = !input.autoFire;
      menus.syncSettings(null);
      persist();
      fx.text(game.player.x, game.player.y - 50, input.autoFire ? 'AUTO FIRE' : 'MANUAL FIRE', [1, 1, 1], 12, 0.9);
    }
    if (game.state === 'levelup') {
      for (let i = 0; i < 3; i++) if (input.take('Digit' + (i + 1)) || input.take('Numpad' + (i + 1))) choose(i);
      if (input.take('KeyR')) { if (game.reroll()) { audio.play('pick'); menus.levelUp(game); } }
      return;
    }
    if (input.take('Escape') || input.take('KeyP')) {
      if (!menus.closeModal()) setPaused(!paused);
    }
  }

  const toWorld = (mx, my) => renderer.toWorld(game.cam, mx, my);

  function step(dt) {
    const g = game;
    g.viewHalf = renderer.viewHalf;
    if (mode === 'title') {
      if (g.state === 'levelup') g.choose(botChoose(g));
      else if (g.state !== 'playing') { startAttract(); return; }
      g.update(dt, botInput(g));
      fx.update(dt * g.timeScale);
    } else if (!paused) {
      if (g.state === 'playing') {
        g.update(dt, dev.bot ? botInput(g) : input.frame(toWorld));
        fx.update(g.hitstop > 0 ? 0 : dt * g.timeScale);
      } else if (g.state === 'levelup') {
        if (dev.bot && params.get('stop') !== 'levelup') choose(botChoose(g));
      } else fx.update(dt);                    // dead / victory: let the debris settle
    }
    vtime += dt;
  }

  function render() {
    const g = game;
    const sec = g.sector;
    for (const k of ['c1', 'c2', 'c3', 'grid']) for (let i = 0; i < 3; i++) pal[k][i] = damp(pal[k][i], sec[k][i], 1.2, 1 / 60);
    const p = g.player;
    let danger = 0;
    if (mode === 'run' && !p.dead && g.stats.maxHp > 1) {
      if (p.hp <= 1) danger = 0.5 + 0.3 * Math.sin(vtime * 6);
      else if (p.hp === 2) danger = 0.16;
    }
    const wells = [];
    for (const z of g.zones) if (z.kind === 'well' && !z.dead) wells.push({ x: z.x, y: z.y, r: z.r, k: 0.55 * Math.min(1, z.t * 3) * Math.min(1, (z.dur - z.t) * 3) });
    renderer.render({
      cam: g.cam, time: vtime, sector: pal, fx, arena: ARENA, wells, ring: g.ringArena, danger,
      fade: mode === 'title' ? 0.3 : 0,
      draw: (B, glyphs) => drawGame(g, B, glyphs),
    });
    if (mode === 'run') hud.update(g);
  }

  let last = performance.now(), acc = 0, frames = 0, worst = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const raw = (now - last) / 1000;
    last = now;
    const dt = Math.min(raw, 1 / 30);
    handleKeys();
    step(dt);
    render();
    input.endFrame();
    if (dev.debug) {
      acc += raw; frames++; worst = Math.max(worst, raw);
      if (acc >= 0.5) {
        const el = document.getElementById('fps');
        el.classList.remove('hidden');
        el.textContent = `${Math.round(frames / acc)} fps  worst ${(worst * 1000).toFixed(1)} ms\nenemies ${game.enemies.length}  hearts ${game.projs.length}  bullets ${game.bullets.length}\ninstances ${renderer.batch.n}  particles ${fx.live}  hdr ${renderer.hdr}`;
        acc = frames = worst = 0;
      }
    }
  }

  window.addEventListener('blur', () => { if (mode === 'run' && !paused && !dev.bot) setPaused(true); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'run' && !paused && !dev.bot) setPaused(true); });

  applySettings();
  startAttract();

  // ---------------------------------------------------------------- dev hooks
  if (dev.bot || dev.ff || dev.shot) {
    if (dev.shot) document.body.classList.add('noanim');
    renderer.resize();
    if (params.get('scene') !== 'title') startRun();
    const stopAt = params.get('stop');
    const t0 = performance.now();
    for (let i = 0; i < dev.ff * 60; i++) {
      step(1 / 60);
      if (stopAt === 'levelup' && game.state === 'levelup') break;
      if (stopAt === 'dead' && game.state === 'dead') break;
      if (stopAt === 'boss' && game.enemies.some((e) => e.boss && e.spawn <= 0 && e.t > Number(params.get('bosst') || 6))) break;
    }
    if (params.has('bench')) {                  // dev: time simulation vs. rendering
      const gl = renderer.gl, px = new Uint8Array(4);
      let tSim = 0, tDraw = 0, peakE = 0, peakI = 0;
      const N = 240;
      for (let i = 0; i < N; i++) {
        const a = performance.now();
        step(1 / 60);
        const b = performance.now();
        render();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);   // wait for the GPU
        tDraw += performance.now() - b; tSim += b - a;
        peakE = Math.max(peakE, game.enemies.length); peakI = Math.max(peakI, renderer.batch.n);
      }
      const msg = `bench sim ${(tSim / N).toFixed(2)}ms render ${(tDraw / N).toFixed(2)}ms enemies<=${peakE} instances<=${peakI} projs=${game.projs.length} bullets=${game.bullets.length} particles=${fx.live} canvas=${renderer.w}x${renderer.h}`;
      fetch('/__dev/log?name=' + (dev.shot || 'bench'), { method: 'POST', body: msg }).catch(() => {});
    }
    if (params.has('pause')) setPaused(true);
    if (params.has('modal')) menus.modal(params.get('modal'));
    render();
    if (dev.shot) {
      fetch('/__dev/log?name=' + dev.shot, { method: 'POST', body: `ok state=${game.state} wave=${game.wave} level=${game.level} t=${game.time.toFixed(1)} enemies=${game.enemies.length} hdr=${renderer.hdr} inst=${renderer.batch.n} particles=${fx.live} ffms=${Math.round(performance.now() - t0)}` }).catch(() => {});
      fetch('/__dev/shot?name=' + dev.shot, { method: 'POST', body: canvas.toDataURL('image/png') }).catch(() => {});
      return;                                   // freeze on this frame for page screenshots
    }
  }
  if (params.has('audiotest')) {              // dev: fire every sound once and report
    audio.unlock();
    audio.startMusic();
    setTimeout(() => {
      const names = ['shoot','beam','hit','block','kill','killBig','explode','xp','heal','hurt','death','dash','dashReady','shieldUp','shieldBreak','pulse','zap','freeze','charm','well','bomb','levelup','fusion','pick','hover','telegraph','lunge','charge','laser','enemyShot','enemyBurst','bossBeat','bossWarn','bossRoar','bossDeath','waveStart','waveClear'];
      let errs = [];
      for (const n of names) { try { audio.last.clear(); audio.play(n); } catch (e) { errs.push(n + ': ' + e.message); } }
      for (let i = 0; i <= 3; i++) audio.setIntensity(i);
      fetch('/__dev/log?name=audio', { method: 'POST', body: `audio state=${audio.ctx && audio.ctx.state} sounds=${names.length} errors=${errs.length} ${errs.join(' | ')}` });
      setTimeout(() => fetch('/__dev/log?name=audio', { method: 'POST', body: `music step=${audio.music && audio.music.step}` }), 2500);
    }, 600);
  }
  if (params.has('dev')) {
    setInterval(() => fetch('/__dev/log?name=page', { method: 'POST', body: `live mode=${mode} state=${game.state} wave=${game.wave} t=${game.time.toFixed(1)} enemies=${game.enemies.length}` }).catch(() => {}), 3000);
  }
  requestAnimationFrame(frame);
}

try {
  boot();
} catch (e) {
  report(String((e && e.stack) || e));
}
