const KEY = 'neon-heartstorm-v1';

const DEFAULTS = {
  best: { score: 0, wave: 0, level: 0 },
  wins: 0,
  codex: [],            // discovered fusion ids
  settings: { master: 0.8, music: 0.6, sfx: 0.8, quality: 'high', shake: 1, autoFire: false },
};

export function loadSave() {
  let data = {};
  try {
    data = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch { data = {}; }
  return {
    ...DEFAULTS, ...data,
    best: { ...DEFAULTS.best, ...(data.best || {}) },
    settings: { ...DEFAULTS.settings, ...(data.settings || {}) },
    codex: Array.isArray(data.codex) ? data.codex : [],
  };
}

export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* storage unavailable: play on */ }
}
