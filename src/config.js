// Central tunables. Colours are linear-ish RGB multipliers; values above 1 bloom harder.

export const TITLE = 'NEON HEARTSTORM';

export const VIEW_H = 920;                     // world units visible vertically
export const ARENA = { hw: 1700, hh: 1150 };   // arena half extents

/** Music tempo; the simulation's beat clock (On the Beat, ship pulse) shares it. */
export const BPM = 112;

export const COL = {
  pink: [1.0, 0.22, 0.62],
  hot: [1.0, 0.12, 0.38],
  rose: [1.0, 0.45, 0.7],
  red: [1.0, 0.12, 0.16],
  white: [1.0, 1.0, 1.0],
  cyan: [0.15, 0.9, 1.0],
  lime: [0.55, 1.0, 0.2],
  violet: [0.62, 0.38, 1.0],
  amber: [1.0, 0.68, 0.15],
  orange: [1.0, 0.42, 0.1],
  blue: [0.25, 0.48, 1.0],
  teal: [0.15, 1.0, 0.72],
  gold: [1.0, 0.84, 0.3],
  ice: [0.6, 0.9, 1.0],
  ghost: [0.8, 0.85, 1.0],
  bullet: [1.0, 0.72, 0.35],
  dark: [0.35, 0.1, 0.5],
};

export const SECTORS = [
  { name: 'AZURE DRIFT', c1: [0.05, 0.12, 0.42], c2: [0.32, 0.08, 0.5], c3: [0.1, 0.6, 0.8], grid: [0.2, 0.5, 1.0] },
  { name: 'VERDANT RIFT', c1: [0.03, 0.3, 0.26], c2: [0.1, 0.12, 0.45], c3: [0.4, 0.9, 0.4], grid: [0.15, 0.9, 0.6] },
  { name: 'EMBER REACH', c1: [0.42, 0.1, 0.05], c2: [0.4, 0.05, 0.3], c3: [1.0, 0.6, 0.2], grid: [1.0, 0.45, 0.2] },
  { name: 'THE HOLLOW', c1: [0.2, 0.03, 0.32], c2: [0.02, 0.02, 0.12], c3: [0.9, 0.2, 0.7], grid: [0.75, 0.25, 1.0] },
];

export const PLAYER = {
  r: 15,
  drawR: 24,
  hp: 5,
  speed: 430,
  damage: 10,
  fireRate: 3.6,
  projSpeed: 1150,
  projLife: 0.85,
  dashSpeed: 1750,
  dashTime: 0.16,
  dashCd: 2.4,
  invuln: 1.2,
  magnet: 150,
};

export const WAVES_PER_SECTOR = 5;
export const FINAL_WAVE = 20;

export const xpForLevel = (lvl) => Math.floor(6 + lvl * 4 + lvl * lvl * 0.36);

export const QUALITY = {
  low: { scale: 0.7, bloom: 4, particles: 0.45 },
  medium: { scale: 0.85, bloom: 5, particles: 0.75 },
  high: { scale: 1.0, bloom: 6, particles: 1.0 },
};
