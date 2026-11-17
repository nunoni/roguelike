// Procedural sound: every effect is synthesised with WebAudio, no asset files.

import { Music } from './music.js';

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.8, music: 0.6, sfx: 0.8 };
    this.muted = false;
    this.last = new Map();
    this.music = null;
    this.xpStreak = 0;
    this.xpT = 0;
  }

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.18;
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    // one shared noise buffer
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.music = new Music(ctx, this.musicBus);
    this.applyVolume();
  }

  setVolumes(v) { Object.assign(this.vol, v); this.applyVolume(); }
  toggleMute() { this.muted = !this.muted; this.applyVolume(); return this.muted; }
  applyVolume() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol.master, t, 0.02);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.02);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.55, t, 0.02);
  }

  startMusic() { if (this.music) this.music.start(); }
  setIntensity(n) { if (this.music) this.music.setIntensity(n); }
  /** Pause/duck everything while the game is paused or hidden. */
  setPaused(p) {
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(this.vol.music * (p ? 0.2 : 0.55), this.ctx.currentTime, 0.08);
  }

  // ---- primitives -----------------------------------------------------------
  tone(type, f0, f1, dur, gain, delay = 0, attack = 0.004) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  hiss(dur, gain, f0, f1, q = 1, type = 'bandpass', delay = 0) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random()); src.stop(t + dur + 0.02);
  }

  // ---- named effects --------------------------------------------------------
  play(name) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const gap = GAPS[name] ?? 0.04;
    if (now - (this.last.get(name) || -1) < gap) return;
    this.last.set(name, now);
    const r = () => 0.94 + Math.random() * 0.12;
    switch (name) {
      case 'shoot': this.tone('triangle', 880 * r(), 420, 0.07, 0.07); break;
      case 'beam': this.tone('sawtooth', 300 * r(), 280, 0.11, 0.035); break;
      case 'hit': this.tone('square', 240 * r(), 120, 0.04, 0.035); break;
      case 'block': this.tone('square', 1300 * r(), 900, 0.05, 0.04); break;
      case 'kill': this.hiss(0.12, 0.12, 2400 * r(), 300, 0.8); this.tone('sine', 300 * r(), 70, 0.12, 0.09); break;
      case 'killBig': this.hiss(0.35, 0.2, 1800, 120, 0.7); this.tone('sine', 170, 40, 0.35, 0.2); break;
      case 'explode': this.hiss(0.3, 0.16, 1400 * r(), 90, 0.6, 'lowpass'); this.tone('sine', 130, 38, 0.28, 0.16); break;
      case 'xp': {
        this.xpStreak = now - this.xpT < 0.5 ? Math.min(14, this.xpStreak + 1) : 0;
        this.xpT = now;
        this.tone('sine', 700 * Math.pow(1.06, this.xpStreak), 700 * Math.pow(1.06, this.xpStreak) * 1.5, 0.07, 0.035);
        break;
      }
      case 'heal': this.tone('sine', 520, 1040, 0.22, 0.09); this.tone('sine', 780, 1560, 0.22, 0.06, 0.07); break;
      case 'hurt': this.tone('sawtooth', 320, 50, 0.4, 0.22); this.hiss(0.3, 0.18, 900, 80, 0.7, 'lowpass'); break;
      case 'death': this.tone('sawtooth', 400, 30, 1.3, 0.28); this.hiss(1.2, 0.25, 2000, 40, 0.6, 'lowpass'); break;
      case 'dash': this.hiss(0.2, 0.14, 500, 4200, 1.4); break;
      case 'dashReady': this.tone('sine', 1250, 1500, 0.06, 0.03); break;
      case 'shieldUp': this.tone('sine', 420, 980, 0.22, 0.07); break;
      case 'shieldBreak': this.hiss(0.25, 0.15, 5000, 600, 2); this.tone('triangle', 1300, 240, 0.25, 0.12); break;
      case 'pulse': this.tone('sine', 95, 42, 0.26, 0.22); this.tone('sine', 190, 90, 0.12, 0.07); break;
      case 'zap': this.hiss(0.09, 0.07, 6000 * r(), 1800, 3); this.tone('sawtooth', 1500 * r(), 300, 0.07, 0.03); break;
      case 'freeze': this.tone('sine', 2100 * r(), 3300, 0.12, 0.035); break;
      case 'charm': this.tone('sine', 660, 990, 0.14, 0.05); this.tone('sine', 990, 1320, 0.16, 0.04, 0.08); break;
      case 'well': this.tone('sine', 280, 55, 0.6, 0.12); break;
      case 'bomb': this.tone('sine', 220, 28, 1.0, 0.4); this.hiss(0.9, 0.28, 3000, 60, 0.5, 'lowpass'); this.tone('triangle', 660, 1320, 0.3, 0.1); break;
      case 'levelup': [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.16, 0.09, i * 0.07)); break;
      case 'fusion': [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this.tone('triangle', f, f * 1.01, 0.3, 0.1, i * 0.06)); this.hiss(0.8, 0.08, 800, 9000, 1.5, 'bandpass', 0.1); break;
      case 'pick': this.tone('triangle', 660, 990, 0.1, 0.09); break;
      case 'hover': this.tone('sine', 880, 880, 0.03, 0.025); break;
      case 'telegraph': this.tone('square', 700, 900, 0.1, 0.04); break;
      case 'lunge': this.hiss(0.18, 0.1, 3000, 400, 1.2); break;
      case 'charge': this.tone('sawtooth', 110, 700, 1.1, 0.045, 0, 0.5); break;
      case 'laser': this.tone('sawtooth', 900, 120, 0.3, 0.13); this.hiss(0.25, 0.1, 5000, 500, 1); break;
      case 'enemyShot': this.tone('square', 520 * r(), 300, 0.06, 0.03); break;
      case 'enemyBurst': this.tone('square', 300, 140, 0.16, 0.06); this.hiss(0.14, 0.06, 2500, 500, 1); break;
      case 'bossBeat': this.tone('sine', 75, 34, 0.32, 0.3); break;
      case 'bossWarn': [0, 0.32, 0.64].forEach((d) => this.tone('sawtooth', 190, 170, 0.24, 0.11, d)); break;
      case 'bossRoar': this.tone('sawtooth', 100, 44, 0.75, 0.22); this.hiss(0.65, 0.16, 500, 100, 0.8, 'lowpass'); break;
      case 'bossDeath': this.tone('sine', 190, 24, 1.7, 0.38); this.hiss(1.5, 0.3, 4000, 40, 0.5, 'lowpass'); [784, 1047, 1319].forEach((f, i) => this.tone('triangle', f, f, 0.5, 0.07, 0.5 + i * 0.12)); break;
      case 'waveStart': this.tone('triangle', 392, 392, 0.12, 0.06); this.tone('triangle', 587, 587, 0.2, 0.06, 0.1); break;
      case 'waveClear': [587, 784, 988].forEach((f, i) => this.tone('triangle', f, f, 0.16, 0.06, i * 0.08)); break;
    }
  }
}

// minimum seconds between repeats of the same effect
const GAPS = { shoot: 0.055, hit: 0.035, kill: 0.04, xp: 0.03, explode: 0.07, zap: 0.06, enemyShot: 0.07, beam: 0.09, block: 0.05, freeze: 0.08, charm: 0.15, hover: 0.03, telegraph: 0.12, lunge: 0.1, killBig: 0.1, pulse: 0.2, heal: 0.15 };

export function nullAudio() {
  const noop = () => {};
  return new Proxy({}, { get: () => noop });
}
