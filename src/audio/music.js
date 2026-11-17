// Generative synthwave loop. A look-ahead scheduler lays down kick, hats, bass,
// pad and an arpeggio; `intensity` (0..3) decides which layers play.

const BPM = 112;
const STEP = 60 / BPM / 4;            // sixteenth note
// i - VI - III - VII in A minor, as semitone offsets from A
const CHORDS = [
  { root: 0, notes: [0, 3, 7, 12] },
  { root: -4, notes: [-4, 0, 3, 8] },
  { root: 3, notes: [3, 7, 10, 15] },
  { root: -2, notes: [-2, 2, 5, 10] },
];
const hz = (semi, octave) => 110 * Math.pow(2, octave + semi / 12);

export class Music {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.out = out;
    this.intensity = 0;
    this.step = 0;
    this.next = 0;
    this.timer = null;
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // gentle feedback delay for the arp
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = STEP * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(out);
  }

  setIntensity(n) { this.intensity = n; }

  start() {
    if (this.timer) return;
    this.next = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.tick(), 50);
  }

  tick() {
    const ctx = this.ctx;
    if (ctx.state !== 'running') { this.next = ctx.currentTime + 0.1; return; }
    if (this.next < ctx.currentTime - 0.3) this.next = ctx.currentTime + 0.05;   // tab was asleep
    while (this.next < ctx.currentTime + 0.18) {
      this.schedule(this.step, this.next);
      this.step++;
      this.next += STEP;
    }
  }

  schedule(step, t) {
    const I = this.intensity;
    const s = step % 16, bar = Math.floor(step / 16);
    const chord = CHORDS[bar % 4];

    if (s === 0) this.pad(chord, t, STEP * 16, I === 0 ? 0.05 : 0.035);
    if (I >= 1) {
      if (s % 4 === 0) this.kick(t, I >= 2 ? 0.5 : 0.36);
      if (s % 2 === 0) this.bass(hz(chord.root, s % 8 === 6 ? 0 : -1), t, STEP * 1.7, 0.16);
    }
    if (I >= 2) {
      if (s % 4 === 2) this.hat(t, 0.05);
      if (s === 4 || s === 12) this.snare(t, 0.11);
    }
    if (I >= 3 && s % 2 === 1) this.hat(t, 0.028);
    // arpeggio: sparse when calm, driving when it is not
    const arpOn = I === 0 ? s % 4 === 0 : I === 1 ? s % 2 === 0 : I === 2 ? s % 2 === 0 || s === 7 : true;
    if (arpOn) {
      const idx = [0, 1, 2, 3, 2, 1, 3, 2][(s + bar) % 8];
      this.pluck(hz(chord.notes[idx], I >= 3 ? 2 : 1), t, I === 0 ? 0.035 : 0.05);
    }
  }

  kick(t, gain) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(this.out);
    o.start(t); o.stop(t + 0.25);
  }

  noiseHit(t, dur, gain, freq, type) {
    const ctx = this.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noise;
    f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(t); src.stop(t + dur + 0.02);
  }
  hat(t, gain) { this.noiseHit(t, 0.04, gain, 7500, 'highpass'); }
  snare(t, gain) { this.noiseHit(t, 0.14, gain, 1900, 'bandpass'); }

  bass(freq, t, dur, gain) {
    const ctx = this.ctx, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(180, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.out);
    o.start(t); o.stop(t + dur + 0.02);
  }

  pluck(freq, t, gain) {
    const ctx = this.ctx, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.16);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(f).connect(g);
    g.connect(this.out);
    g.connect(this.delay);
    o.start(t); o.stop(t + 0.22);
  }

  pad(chord, t, dur, gain) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(500, t);
    f.frequency.linearRampToValueAtTime(1300, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(500, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.25);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.2);
    f.connect(g).connect(this.out);
    for (const n of chord.notes.slice(0, 3)) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(n, 1);
        o.detune.value = det;
        o.connect(f);
        o.start(t); o.stop(t + dur + 0.25);
      }
    }
  }
}
