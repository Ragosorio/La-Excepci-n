/**
 * Status effects for every StatusId: application (with La Excepción resistances for Elias, boss resistances),
 * side switching (mente / traición), DoT/HoT ticks, periodic particles and expiry.
 */
import type { StatusId } from '../data/types';
import type { Battle } from './world';
import type { AbilityRT } from './defs';
import { STATUS_INFO } from '../data/schools';
import {
  B_BLEED, B_BURN, B_FEAR, B_FROZEN, B_INVIS, B_MIND, B_POISON, B_REGEN, B_STUN, B_TOAD, B_TRAITOR, B_CHARM, B_SLOW, B_ROOT, B_CURSE,
  B_FURY, B_HASTE, B_SHIELD, B_MARK, B_BLIND, B_IMMORTAL, B_LEECH, B_SILENCE, B_TAUNT, F_BOSS, F_CAPTAIN, F_HERO, F_PLAYER, F_PRISONER, NS, SI, STATUS_IDS,
  S_ATTACK, S_CAST, S_IDLE, TEAM_ENEMY, TEAM_PLAYER, EX_ANGRY, EX_SCARED, F_CLONE,
} from './const';
import { resistance } from '../systems/progression/codex';

const CONTROL = new Set<StatusId>(['aturdido', 'congelado', 'sapo', 'mente', 'encanto', 'miedo', 'raiz', 'traicion', 'silencio', 'ceguera', 'lento', 'provocar']);
const DEFAULT_MAG: Partial<Record<StatusId, number>> = {
  quemadura: 4, veneno: 3, sangrado: 3, regeneracion: 5, lento: 0.4, escudo: 0.4, prisa: 0.35, robo_vida: 0.3, maldicion: 0.3, furia: 0.4, marcado: 0.3,
};

/** Max resistance over an ability's tags (plus the status id itself as a tag). */
export function playerResist(ab: AbilityRT | null, status?: StatusId): number {
  let r = 0;
  if (ab) for (const t of ab.def.tags) r = Math.max(r, resistance(t));
  if (status) r = Math.max(r, resistance(status));
  return Math.min(1, r);
}

export function hasStatus(b: Battle, i: number, s: StatusId): boolean { return (b.u.stMask[i] & (1 << SI[s])) !== 0; }
export function statusMag(b: Battle, i: number, s: StatusId): number { return b.u.stMag[i * NS + SI[s]]; }

/**
 * Apply a status. Returns false if resisted/immune.
 * src = caster unit index (-1 environment), ab = ability runtime (for Elias' resistances + comprehension handled by caller).
 */
export function applyStatus(b: Battle, i: number, s: StatusId, dur: number, mag: number | undefined, src: number, ab: AbilityRT | null = null): boolean {
  const u = b.u;
  if (!b.alive(i) || dur <= 0) return false;
  const good = STATUS_INFO[s]?.good ?? false;
  let d = dur;
  const flags = u.flags[i];
  if (!good) {
    if (flags & F_PLAYER) {
      if (b.player?.immune.includes(s)) { b.float(i, 'INMUNE', 'info', true, '#c7a2ff'); return false; }
      const r = playerResist(ab, s);
      if (r >= 1) { b.float(i, 'INMUNE', 'info', true, '#c7a2ff'); return false; }
      d *= 1 - r;
      if (s === 'mente' || s === 'traicion' || s === 'encanto') {
        // Elias is never converted: mind effects become inverted controls
        b.player?.mindHit(d, ab?.id);
        return true;
      }
    }
    if (CONTROL.has(s)) {
      const weak = u.hp[i] < u.hpMax[i] * 0.3;
      if (flags & (F_BOSS | F_HERO)) { if ((s === 'mente' || s === 'traicion' || s === 'sapo') && !weak) { b.float(i, '¡RESISTE!', 'info', true, '#ffd36b'); return false; } d *= 0.35; }
      else if (flags & F_CAPTAIN) d *= 0.6;
    }
  }
  const k = SI[s], o = i * NS + k;
  const was = (u.stMask[i] >> k) & 1;
  u.stTime[o] = Math.max(u.stTime[o], d);
  const m = mag ?? DEFAULT_MAG[s] ?? 1;
  u.stMag[o] = was ? Math.max(u.stMag[o], m) : m;
  u.stSrc[o] = src;
  u.stMask[i] |= 1 << k;
  if (!was) onApply(b, i, s, src);
  return true;
}

function onApply(b: Battle, i: number, s: StatusId, src: number): void {
  const u = b.u, x = u.x[i], z = u.z[i];
  const p = b.tmpV.set(x, u.y[i] + b.heightOf(i) * 0.6, z);
  switch (s) {
    case 'mente': case 'traicion': {
      const newSide = src >= 0 ? u.side[src] : (u.team[i] === TEAM_PLAYER ? TEAM_ENEMY : TEAM_PLAYER);
      if (newSide !== u.side[i]) {
        u.side[i] = newSide;
        u.setTeamColor(i, newSide, true);
        u.target[i] = -1; u.retargetT[i] = 0;
        cancelAction(b, i);
      }
      if (s === 'mente' && src >= 0 && (u.flags[src] & F_PLAYER) && u.hp[i] < u.hpMax[i] * 0.3) u.flags[i] |= F_PRISONER;
      b.fx.emit('mind', p, { count: 16 });
      b.fx.ring(b.tmpV.set(x, u.y[i], z), { color: '#ff7bf0', radius: 2.2, duration: 0.5 });
      b.sfx('mind_control', x, z, 0.8);
      if (s === 'traicion') b.float(i, '¡TRAICIÓN!', 'info', false, '#e6cc80');
      break;
    }
    case 'sapo':
      cancelAction(b, i);
      b.fx.emit('nature', p, { count: 14 }); b.fx.emit('smoke', p, { count: 6 });
      b.sfx('toad', x, z, 0.8);
      break;
    case 'congelado':
      cancelAction(b, i);
      b.fx.emit('ice', p, { count: 14 });
      b.sfx('freeze', x, z, 0.7);
      break;
    case 'aturdido':
      cancelAction(b, i);
      b.fx.emit('stars', b.tmpV.set(x, u.y[i] + b.heightOf(i) + 0.2, z), { count: 6 });
      break;
    case 'invisible':
      b.fx.emit('shadow', p, { count: 12 });
      // everyone hunting this unit loses it
      for (let j = 0; j < u.n; j++) if (u.active[j] && u.target[j] === i) { u.target[j] = -1; u.retargetT[j] = 0.8; }
      break;
    case 'miedo':
      u.exprTmp[i] = EX_SCARED; u.exprT[i] = 1;
      break;
    case 'furia':
      u.exprTmp[i] = EX_ANGRY; u.exprT[i] = 2;
      b.fx.emit('fire', p, { count: 8, color: '#ff4a1a' });
      break;
    case 'provocar':
      if (src >= 0) { u.target[i] = src; u.retargetT[i] = 3; }
      break;
    case 'escudo':
      b.sfx('shield_block', x, z, 0.5);
      break;
    case 'silencio':
      if (u.state[i] === S_CAST) cancelAction(b, i);
      break;
    default: break;
  }
}

function onExpire(b: Battle, i: number, s: StatusId): void {
  const u = b.u;
  const p = b.tmpV.set(u.x[i], u.y[i] + b.heightOf(i) * 0.6, u.z[i]);
  switch (s) {
    case 'mente':
      if (!(u.stMask[i] & B_TRAITOR)) { u.side[i] = u.team[i]; u.setTeamColor(i, u.team[i]); u.target[i] = -1; u.retargetT[i] = 0; }
      b.fx.emit('mind', p, { count: 8 });
      break;
    case 'traicion':
      if (!(u.stMask[i] & B_MIND)) { u.side[i] = u.team[i]; u.setTeamColor(i, u.team[i]); u.target[i] = -1; }
      break;
    case 'sapo': b.fx.emit('smoke', p, { count: 8 }); b.sfx('toad', u.x[i], u.z[i], 0.5, 0.7); break;
    case 'congelado': b.fx.emit('ice', p, { count: 20, speed: 7 }); b.sfx('freeze', u.x[i], u.z[i], 0.5, 1.4); break;
    case 'invisible': if (u.flags[i] & F_PLAYER) b.player?.onVeilEnd(); b.fx.emit('shadow', p, { count: 8 }); break;
    default: break;
  }
}

export function removeStatus(b: Battle, i: number, s: StatusId): void {
  const u = b.u, k = SI[s];
  if (!((u.stMask[i] >> k) & 1)) return;
  u.stMask[i] &= ~(1 << k);
  u.stTime[i * NS + k] = 0;
  onExpire(b, i, s);
}

export function clearStatuses(b: Battle, i: number): void {
  const u = b.u;
  for (let k = 0; k < NS; k++) if ((u.stMask[i] >> k) & 1) removeStatus(b, i, STATUS_IDS[k]);
}

function cancelAction(b: Battle, i: number): void {
  const u = b.u;
  if (u.state[i] === S_ATTACK || u.state[i] === S_CAST) { u.state[i] = S_IDLE; u.atkPh[i] = -1; u.castAb[i] = -1; b.abilities?.cancelTelegraph(i); }
}

/** Per-frame status tick. DoTs every 0.5 s. Returns nothing; may kill the unit through combat. */
export function tickStatus(b: Battle, i: number, dt: number, dot: (i: number, amount: number, src: number, kind: StatusId) => void): void {
  const u = b.u;
  let mask = u.stMask[i];
  if (!mask) return;
  const base = i * NS;
  for (let k = 0; k < NS; k++) {
    if (!((mask >> k) & 1)) continue;
    const o = base + k;
    u.stTime[o] -= dt;
    if (u.stTime[o] <= 0) { u.stMask[i] &= ~(1 << k); u.stTime[o] = 0; onExpire(b, i, STATUS_IDS[k]); }
  }
  mask = u.stMask[i];
  // periodic effects
  u.dotT[i] += dt;
  if (u.dotT[i] >= 0.5) {
    u.dotT[i] -= 0.5;
    if (mask & B_BURN) dot(i, u.stMag[base + SI.quemadura] * 0.5, u.stSrc[base + SI.quemadura], 'quemadura');
    if (mask & B_POISON) dot(i, u.stMag[base + SI.veneno] * 0.5, u.stSrc[base + SI.veneno], 'veneno');
    if (mask & B_BLEED) { const mv = Math.hypot(u.vx[i], u.vz[i]) > 0.8 ? 2 : 1; dot(i, u.stMag[base + SI.sangrado] * 0.5 * mv, u.stSrc[base + SI.sangrado], 'sangrado'); }
    if ((mask & B_REGEN) && !(mask & B_CURSE)) { const h = u.stMag[base + SI.regeneracion] * 0.5; u.hp[i] = Math.min(u.hpMax[i], u.hp[i] + h); }
  }
  // particles (only near the camera; cheap)
  u.fxT[i] -= dt;
  if (u.fxT[i] <= 0) {
    u.fxT[i] = 0.22 + u.seed[i] * 0.1;
    const f = b.cam.rig.focus;
    if (Math.abs(u.x[i] - f.x) < 38 && Math.abs(u.z[i] - f.z) < 38) {
      const h = b.heightOf(i);
      const p = b.tmpV.set(u.x[i], u.y[i] + h * 0.55, u.z[i]);
      if (mask & B_BURN) b.fx.emit('fire', p, { count: 3, scale: 0.6 });
      if (mask & B_POISON) b.fx.emit('poison', p, { count: 2, scale: 0.5 });
      if (mask & B_BLEED) b.fx.emit('ink', p, { count: 2, scale: 0.5 });
      if (mask & B_REGEN) b.fx.emit('heal', p, { count: 2, scale: 0.6 });
      if (mask & (B_MIND | B_TRAITOR)) b.fx.emit('mind', p.set(u.x[i], u.y[i] + h + 0.1, u.z[i]), { count: 2, scale: 0.5 });
      if (mask & B_STUN) b.fx.emit('stars', p.set(u.x[i], u.y[i] + h + 0.15, u.z[i]), { count: 2, scale: 0.55, up: 0.5 });
      if (mask & B_SLOW) b.fx.emit('ice', p, { count: 1, scale: 0.5 });
      if (mask & B_ROOT) b.fx.emit('nature', p.set(u.x[i], u.y[i] + 0.2, u.z[i]), { count: 2, scale: 0.6 });
      if (mask & B_CHARM) b.fx.emit('mind', p.set(u.x[i], u.y[i] + h + 0.2, u.z[i]), { count: 1, color: '#ff9ad5', scale: 0.6 });
      if (mask & B_FEAR) b.fx.emit('shadow', p, { count: 1, scale: 0.4 });
      if (mask & B_FURY) b.fx.emit('fire', p, { count: 1, color: '#ff4a1a', scale: 0.4 });
      if (mask & B_HASTE) b.fx.emit('time', p.set(u.x[i], u.y[i] + 0.3, u.z[i]), { count: 1, scale: 0.5 });
      if (mask & B_BLIND) b.fx.emit('smoke', p.set(u.x[i], u.y[i] + h, u.z[i]), { count: 1, scale: 0.3 });
      if (mask & B_CURSE) b.fx.emit('shadow', p, { count: 1, scale: 0.35, color: '#8a3ab0' });
      if (mask & B_IMMORTAL) b.fx.emit('light', p, { count: 1, scale: 0.5 });
      if (mask & B_LEECH) b.fx.emit('blood', p, { count: 1, scale: 0.4 });
      if (mask & B_SILENCE) b.fx.emit('magic', p.set(u.x[i], u.y[i] + h + 0.2, u.z[i]), { count: 1, color: '#c8c8c8', scale: 0.4 });
      if (mask & B_TAUNT) b.fx.emit('hit', p.set(u.x[i], u.y[i] + h + 0.1, u.z[i]), { count: 1, color: '#ffb347', scale: 0.4 });
      if ((mask & B_INVIS) && !(u.flags[i] & (F_PLAYER | F_CLONE))) b.fx.emit('shadow', p, { count: 1, scale: 0.3 });
      if (mask & B_SHIELD) { /* bubble mesh */ }
      if (mask & B_MARK) { /* marker mesh */ }
      if (mask & (B_TOAD | B_FROZEN)) { /* models */ }
    }
  }
}

/** Global slow on Elias' enemies (Reloj sin Agujas & co.). */
function timeSlow(b: Battle, i: number): number {
  const pi = b.playerIdx;
  return b.enemySlow > 0 && pi >= 0 && b.u.side[i] !== b.u.side[pi] ? 1 - b.enemySlow : 1;
}

/** Speed multiplier from statuses. */
export function speedMul(b: Battle, i: number): number {
  const u = b.u, m = u.stMask[i];
  if (!m) return timeSlow(b, i);
  let k = timeSlow(b, i);
  if (m & B_SLOW) k *= Math.max(0.1, 1 - u.stMag[i * NS + SI.lento]);
  if (m & B_HASTE) k *= 1 + u.stMag[i * NS + SI.prisa];
  if (m & B_FURY) k *= 1.15;
  if (m & B_TOAD) k *= 0.75;
  if (m & (B_ROOT | B_FROZEN | B_STUN)) k = 0;
  return k;
}
/** Attack speed multiplier from statuses. */
export function atkMul(b: Battle, i: number): number {
  const u = b.u, m = u.stMask[i];
  if (!m) return timeSlow(b, i);
  let k = timeSlow(b, i);
  if (m & B_SLOW) k *= Math.max(0.35, 1 - u.stMag[i * NS + SI.lento] * 0.6);
  if (m & B_HASTE) k *= 1 + u.stMag[i * NS + SI.prisa];
  if (m & B_FURY) k *= 1.1;
  return k;
}
/** Outgoing damage multiplier from statuses. */
export function dmgOutMul(b: Battle, i: number): number {
  const u = b.u, m = u.stMask[i];
  return (m & B_FURY) ? 1 + u.stMag[i * NS + SI.furia] : 1;
}
