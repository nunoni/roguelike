// Status effects on enemies: burn, chill/freeze, charm, jealousy, heartstrings.

import { COL } from '../config.js';

const QUIET = { quiet: true };
const ZAP = { quiet: true, shared: true };

/**
 * Burn stacks: every ignite adds a stack (up to the cap) and refreshes the
 * duration, so an enemy you keep hitting burns harder and harder.
 * `e.burn` is the damage per second of one stack.
 */
export function igniteEnemy(g, e, dps) {
  if (e.def.statusImmune) return;
  if (dps > e.burn) e.burn = dps;
  const cap = g.stats.burnMax;
  const n = e.burnStacks || 0;
  if (n < cap) {
    e.burnStacks = n + 1;
    if (e.burnStacks === cap && cap > 3) g.fx.ring(e.x, e.y, COL.orange, e.r, e.r * 1.9, 0.25, 2);
  }
  e.burnT = 3;
  // Thermal Shock: fire on ice
  if (g.stats.fus.thermal && e.frozen > 0 && e.burnStacks >= 3) steamBlast(g, e);
}

/** Thermal Shock: spend all burn stacks in one scalding burst. */
function steamBlast(g, e) {
  const n = e.burnStacks || 1, dmg = g.stats.damage * 2 + e.burn * n * 2;
  e.burn = 0; e.burnT = 0; e.burnStacks = 0;
  g.fx.burst(e.x, e.y, COL.white, 16 + n * 2, 320, 0.6, 6, 1);
  g.fx.ring(e.x, e.y, COL.ice, e.r, 90 + n * 6, 0.35, 4);
  g.fx.text(e.x, e.y - e.r - 18, 'STEAM', COL.ice, 12, 0.6);
  g.explode(e.x, e.y, 90 + n * 6, dmg, { col: COL.ice, small: true });
}

/** Jealousy: each stack makes the enemy take more damage from everything. */
export function envyEnemy(g, e, n = 1) {
  if (e.def.statusImmune) return;
  e.envy = Math.min(6, (e.envy || 0) + n);
  e.envyT = 4;
}

/** Heartstrings: tie this enemy to the last one you hit. */
export function tieEnemy(g, e) {
  const o = g.lastHit;
  g.lastHit = e;
  if (!o || o === e || o.dead || e.def.statusImmune || o.def.statusImmune) return;
  const dx = o.x - e.x, dy = o.y - e.y;
  if (dx * dx + dy * dy > 380 * 380) return;
  if (e.tie !== o) { e.tie = o; g.fx.ring(e.x, e.y, COL.rose, e.r, e.r * 1.6, 0.2, 2); }
  e.tieT = 3;
  if (!o.tie || o.tie.dead || o.tieT <= 0) { o.tie = e; o.tieT = 3; }
}

/** The enemy's living partner, if its string is still tied. */
export const tiedTo = (e) => (e.tieT > 0 && e.tie && !e.tie.dead ? e.tie : null);

export function chillEnemy(g, e, amt) {
  if (e.def.statusImmune || e.frozen > 0) return;
  if (e.boss) { e.chill = Math.min(0.5, e.chill + amt * 0.25); return; }
  if (e.freezeImm > 0) { e.chill = Math.min(0.7, e.chill + amt); return; }
  e.chill += amt;
  if (e.chill >= 1) {
    e.chill = 0;
    e.frozen = 1.6;
    e.freezeImm = 3.2;
    g.fx.ring(e.x, e.y, COL.ice, e.r, e.r * 2.2, 0.3, 3);
    g.fx.burst(e.x, e.y, COL.ice, 8, 200, 0.4, 3);
    g.audio.play('freeze');
    if (g.stats.fus.thermal && e.burnStacks > 0) steamBlast(g, e);
  }
}

export function charmEnemy(g, e) {
  if (e.boss || e.def.noCharm || e.def.statusImmune || e.charm > 0) return;
  e.charm = g.stats.charmDur;
  e.faded = false;
  e.ctgt = null;
  e.ctgtT = 0;
  g.fx.burst(e.x, e.y, COL.rose, 10, 220, 0.7, 6, 1);
  g.fx.text(e.x, e.y - e.r - 12, '♥', COL.rose, 16, 0.8);
  g.audio.play('charm');
}

/** Per-frame status upkeep. Returns false if the enemy died from it. */
export function updateStatus(g, e, dt) {
  if (e.burnT > 0) {
    e.burnT -= dt;
    e.burnAcc += dt;
    const n = e.burnStacks || 1;
    g.fx.mote(e.x, e.y, n >= 6 ? COL.gold : COL.orange, Math.min(1, 0.18 + 0.07 * n), 4 + Math.min(n, 10) * 0.3, 0.45, e.r * 3);
    if (e.burnAcc >= 0.3) {
      e.burnAcc -= 0.3;
      g.damageEnemy(e, e.burn * n * 0.3, QUIET);
      if (e.dead) return false;
    }
    if (e.burnT <= 0) { e.burn = 0; e.burnStacks = 0; }
  }
  if (e.freezeImm > 0) e.freezeImm -= dt;
  if (e.envyT > 0) { e.envyT -= dt; if (e.envyT <= 0) e.envy = 0; }
  if (e.tieT > 0) {
    e.tieT -= dt;
    const o = tiedTo(e);
    if (!o) e.tieT = 0;
    else if (g.stats.fus.livewire) {             // Live Wire: the string crackles
      e.wireT = (e.wireT || 0) - dt;
      if (e.wireT <= 0) {
        e.wireT = 0.5;
        g.fx.lightning(e.x, e.y, o.x, o.y, COL.ice);
        g.damageEnemy(e, g.stats.damage * 1.6, ZAP);
        if (e.dead) return false;
      }
    }
  }
  if (e.charm > 0) {
    e.charm -= dt;
    g.fx.mote(e.x, e.y - e.r, COL.rose, 0.08, 5, 0.6, 30, 1);
    if (e.charm <= 0) {
      e.charm = 0;
      g.fx.burst(e.x, e.y, COL.rose, 8, 200, 0.5, 5, 1);
      g.damageEnemy(e, e.maxHp * 0.3, QUIET);   // heartbreak when the spell wears off
      if (e.dead) return false;
    }
  }
  return true;
}
