// Status effects on enemies: burn, chill/freeze, charm.

import { COL } from '../config.js';

const QUIET = { quiet: true };

export function igniteEnemy(g, e, dps) {
  if (e.def.statusImmune) return;
  if (dps > e.burn) e.burn = dps;
  e.burnT = 3;
}

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
    g.fx.mote(e.x, e.y, COL.orange, 0.25, 4, 0.45, e.r * 3);
    if (e.burnAcc >= 0.3) {
      e.burnAcc -= 0.3;
      g.damageEnemy(e, e.burn * 0.3, QUIET);
      if (e.dead) return false;
    }
    if (e.burnT <= 0) e.burn = 0;
  }
  if (e.freezeImm > 0) e.freezeImm -= dt;
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
