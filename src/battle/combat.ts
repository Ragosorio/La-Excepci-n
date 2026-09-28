/**
 * Combat core: damage pipeline, knockback (TABS flights), deaths (ragdolls, morale, streaks, captains),
 * basic melee/ranged strikes and projectile impacts. Elias-specific rules: comprehension (La Excepción),
 * resistances / INMUNE, i-frames, Retorno (delegated to the player controller).
 */
import type { School, StatusId } from '../data/types';
import type { Battle } from './world';
import { abilityAt, specAt, type AbilityRT } from './defs';
import {
  AS_PUNCH, B_BLIND, B_CURSE, B_FROZEN, B_IMMORTAL, B_LEECH, B_MARK, B_SHIELD, EX_HURT, F_BOSS, F_CAPTAIN, F_CLONE, F_EATEN, F_HERO, F_INVULN, F_NOCORPSE, F_PLAYER, F_RIG,
  F_SUMMON, F_THROWN, NS, P_ARROW, P_BOMB, P_BULLET, P_ORB, P_ROCK, S_AIR, S_DEAD, S_HELD, SI, TEAM_PLAYER,
} from './const';
import { applyStatus, dmgOutMul, playerResist } from './status';
import { comprehend } from '../systems/progression/codex';
import { seedRagdollPrev, poseUnit } from './pose';
import { track } from '../core/tracker';
import { engine } from '../core/engine';

export const K_MELEE = 0, K_RANGED = 1, K_MAGIC = 2, K_DOT = 3, K_FALL = 4, K_TRUE = 5;

export interface DmgOpts {
  src: number;
  ab?: AbilityRT | null;
  crit?: boolean;
  knock?: number;
  dirX?: number;
  dirZ?: number;
  up?: number;
  kind?: number;
  school?: School;
  silent?: boolean;
}

const lastComp = new Map<string, number>();

/** La Excepción: an enemy ability touched Elias. */
export function comprehendHit(b: Battle, ab: AbilityRT, crit: boolean): void {
  if (!ab.copyable) return;
  const now = b.realTime;
  const last = lastComp.get(ab.id) ?? -9;
  if (now - last < 0.45) return;
  lastComp.set(ab.id, now);
  let r;
  try { r = comprehend(ab.id, crit ? 2 : 1); } catch (err) { console.warn('[battle] comprehend', err); return; }
  b.hud?.comprehension(ab, r.progress, r.required, r.acquired, r.justAcquired);
  if (r.justAcquired && !b.stats.copied.includes(ab.id)) { b.stats.copied.push(ab.id); b.player?.onAcquired(ab.id); }
}

export function damage(b: Battle, t: number, amount: number, o: DmgOpts): number {
  const u = b.u;
  if (!b.alive(t) || amount <= 0) return 0;
  const src = o.src;
  const kind = o.kind ?? K_MELEE;
  const tf = u.flags[t];
  const playerT = (tf & F_PLAYER) !== 0;
  const fromEnemy = src >= 0 && u.side[src] !== u.side[t];
  let amt = amount;
  let crit = !!o.crit;
  const ab = o.ab ?? null;

  if (playerT) {
    const pl = b.player;
    if (pl && pl.iframes() && kind !== K_DOT && kind !== K_TRUE) { if (!o.silent) b.float(t, '¡Esquiva!', 'info', true, '#c7a2ff'); pl.onDodged(ab); return 0; }
    if (ab && fromEnemy) comprehendHit(b, ab, crit);
    if (ab) {
      const r = playerResist(ab);
      if (r >= 1) { b.float(t, 'INMUNE', 'info', true, '#c7a2ff'); return 0; }
      amt *= 1 - r;
    }
    if (pl) amt *= pl.damageTakenMul();
    if (pl && pl.invulnerable) amt = 0;
  }
  if (tf & F_INVULN) amt = 0;

  // armor & statuses
  const m = u.stMask[t];
  if (kind !== K_DOT && kind !== K_TRUE) {
    let arm = u.armor[t];
    if (m & B_CURSE) arm -= u.stMag[t * NS + SI.maldicion];
    amt *= 1 - Math.max(0, Math.min(0.85, arm));
  }
  if (m & B_MARK) amt *= 1 + u.stMag[t * NS + SI.marcado];
  if (m & B_FROZEN) { amt *= 1.3; }
  if (m & B_SHIELD) {
    const s = u.stMag[t * NS + SI.escudo];
    if (s <= 1) amt *= 1 - s;
    else { const ab2 = Math.min(s, amt); u.stMag[t * NS + SI.escudo] = s - ab2; amt -= ab2; if (s - ab2 <= 0.5) { u.stMask[t] &= ~(1 << SI.escudo); } }
  }
  if (b.onDamageHook) {
    const r = b.onDamageHook(t, amt, ab?.id, src);
    if (r !== undefined && Number.isFinite(r)) amt = Math.max(0, r);
  }
  if (amt <= 0 && !playerT) return 0;

  let hp = u.hp[t] - amt;
  if (m & B_IMMORTAL) hp = Math.max(1, hp);
  if (playerT && b.player) hp = Math.max(b.player.minHp, hp);
  const dealt = u.hp[t] - Math.max(0, hp);
  u.hp[t] = hp;
  if (kind !== K_DOT) {
    u.flash[t] = 1;
    u.sinceHit[t] = 0;
    u.exprTmp[t] = EX_HURT; u.exprT[t] = 0.35;
    if (u.rig[t] >= 0) b.rigs?.hit(t, o.dirX ?? 0, o.dirZ ?? 0);
  }
  if (src >= 0) u.lastHitBy[t] = src;

  // leech
  if (src >= 0 && (u.stMask[src] & B_LEECH) && b.alive(src)) u.hp[src] = Math.min(u.hpMax[src], u.hp[src] + dealt * u.stMag[src * NS + SI.robo_vida]);
  // Elias' progression on-hit hooks (lifesteal, Maleficio, Eclipse's Traición…)
  const pl = b.player;
  if (pl && src >= 0 && (u.flags[src] & F_PLAYER) && kind !== K_DOT && dealt > 0) {
    if (pl.lifesteal > 0) u.hp[src] = Math.min(u.hpMax[src], u.hp[src] + dealt * pl.lifesteal);
    for (const e of pl.onHit) if (e.status && (e.chance === undefined || Math.random() < e.chance) && !(e.status === 'traicion' && (tf & (F_BOSS | F_HERO)))) applyStatus(b, t, e.status, e.duration ?? 4, e.magnitude, src, null);
  }
  if (pl && playerT && fromEnemy && pl.reflect > 0 && kind !== K_DOT && dealt > 0 && b.alive(src)) damage(b, src, dealt * pl.reflect, { src: t, kind: K_TRUE, silent: true });
  // Eclipse passive: traición on hit
  if (src >= 0 && (u.flags[src] & F_PLAYER) && b.player?.traitorChance && !(tf & (F_BOSS | F_HERO)) && Math.random() < b.player.traitorChance) {
    applyStatus(b, t, 'traicion', 10, 1, src, null);
  }

  // feedback
  const involvesPlayer = b.isPlayerish(t) || (src >= 0 && b.isPlayerish(src));
  if (!o.silent && dealt > 0) {
    const big = dealt >= 40 || crit || (tf & (F_CAPTAIN | F_BOSS | F_HERO)) !== 0;
    if (involvesPlayer || big) {
      const txt = Math.round(dealt).toString() + (crit ? '!' : '');
      const kindF = playerT ? 'dmg' : crit ? 'crit' : kind === K_MAGIC ? 'magic' : 'dmg';
      b.float(t, txt, kindF, involvesPlayer || crit, playerT ? '#ff6a7a' : undefined);
    }
    if (src >= 0 && (u.flags[src] & F_PLAYER)) {
      b.hitstop(crit ? 85 : kind === K_MAGIC ? 40 : 50);
      b.cam.rig.shake(crit ? 0.3 : 0.08);
      if (crit && engine.pipeline) { engine.pipeline.chromaticPulse(0.5, 0.25); b.cam.rig.fovPunch(-3); }
    }
    if (playerT) {
      b.hitstop(90);
      b.cam.rig.shake(0.35);
      engine.pipeline.flash('#e2455b', 0.22, 0.18);
      b.onPlayerDamaged?.(dealt, ab?.id, src);
    }
  }

  // knockback
  if (o.knock && o.knock > 0) {
    let dx = o.dirX ?? 0, dz = o.dirZ ?? 0;
    if (!dx && !dz && src >= 0) { dx = u.x[t] - u.x[src]; dz = u.z[t] - u.z[src]; }
    const l = Math.hypot(dx, dz) || 1;
    knockback(b, t, dx / l, dz / l, o.knock * (crit ? 1.3 : 1), o.up ?? 1);
  }

  if (u.hp[t] <= 0) kill(b, t, src, o);
  return dealt;
}

export function heal(b: Battle, t: number, amount: number, src = -1, silent = false): number {
  const u = b.u;
  if (!b.alive(t) || amount <= 0) return 0;
  const h = Math.min(u.hpMax[t] - u.hp[t], amount);
  u.hp[t] += h;
  if (h > 1 && !silent) {
    if (b.isPlayerish(t) || (src >= 0 && b.isPlayerish(src))) b.float(t, '+' + Math.round(h), 'heal', true);
    b.fx.emit('heal', b.tmpV.set(u.x[t], u.y[t] + b.heightOf(t) * 0.6, u.z[t]), { count: 6 });
  }
  return h;
}

/** Launch or shove a unit. impulse ~ EffectSpec.knockback (10 punch, 25 giant stomp). */
export function knockback(b: Battle, i: number, dx: number, dz: number, impulse: number, up = 1): void {
  const u = b.u;
  if (!b.alive(i) || impulse <= 0) return;
  if (u.state[i] === S_HELD) return;
  const isPl = (u.flags[i] & F_PLAYER) !== 0;
  let dv = Math.min(38, (impulse / Math.max(0.35, u.mass[i])) * (isPl ? 0.55 : 1));
  if (b.player && isPl && b.player.stable()) dv *= 0.4;
  if ((u.flags[i] & (F_BOSS | F_HERO)) && dv > 8) dv = 8 + (dv - 8) * 0.3;
  if (dv < 3.2 || (u.stMask[i] & B_FROZEN)) {
    u.vx[i] += dx * dv * 1.4; u.vz[i] += dz * dv * 1.4;
    return;
  }
  const wasAir = u.state[i] === S_AIR;
  u.state[i] = S_AIR; u.stT[i] = 0;
  u.atkPh[i] = -1; u.castAb[i] = -1;
  b.abilities?.cancelTelegraph(i);
  u.vx[i] = (wasAir ? u.vx[i] * 0.4 : 0) + dx * dv * 0.85;
  u.vz[i] = (wasAir ? u.vz[i] * 0.4 : 0) + dz * dv * 0.85;
  u.vy[i] = Math.max(u.vy[i], dv * 0.55 * up + 2.5);
  const sgn = Math.random() < 0.5 ? -1 : 1;
  u.spinP[i] = -(4 + dv * 0.55) * (0.7 + Math.random() * 0.6);
  u.spinR[i] = sgn * dv * 0.35 * Math.random();
  u.y[i] += 0.05;
  b.stats.knockbacks++;
  if (isPl) b.player?.onLaunched(dv);
  else if (dv > 14) { b.sfx('whoosh', u.x[i], u.z[i], 0.5); if (b.setup.arena || b.setup.biome === 'arena') b.arena.cheer = Math.min(1, b.arena.cheer + 0.4); }
  if (u.rig[i] >= 0) b.rigs?.airborne(i, true);
}

/** Kill a unit: ragdoll, morale shock, streaks, captain drama, hooks. */
export function kill(b: Battle, i: number, src: number, o?: DmgOpts): void {
  const u = b.u;
  if (!u.active[i] || u.state[i] === S_DEAD) return;
  const flags = u.flags[i];
  if (flags & F_PLAYER) { u.hp[i] = 0; b.player?.onDeath(src); return; }

  const wasAir = u.state[i] === S_AIR;
  const sp = specAt(u.spec[i]);
  // joints for the ragdoll: pose now so the corpse starts from the live pose
  if (!(flags & F_RIG)) poseUnit(u, i, sp, b.time);
  u.state[i] = S_DEAD; u.deadT[i] = 0; u.sink[i] = 0;
  u.atkPh[i] = -1; u.castAb[i] = -1; u.target[i] = -1;
  b.abilities?.cancelTelegraph(i);
  // corpse inherits velocity; heavy blows add a kick
  if (!wasAir && o?.knock) { const l = Math.hypot(o.dirX ?? 0, o.dirZ ?? 0) || 1; const k = Math.min(10, o.knock / Math.max(0.5, u.mass[i])) * 0.6; u.vx[i] += ((o.dirX ?? 0) / l) * k; u.vz[i] += ((o.dirZ ?? 0) / l) * k; u.vy[i] += k * 0.5; }
  if (!(flags & F_RIG)) { seedRagdollPrev(u, i, 1 / 60); b.rag.start(u, i); }
  else b.rigs?.dead(i);

  const x = u.x[i], z = u.z[i], hgt = b.heightOf(i);
  b.fx.emit('ink', b.tmpV.set(x, u.y[i] + hgt * 0.5, z), { count: 8 });
  b.sfx('death_pop', x, z, 0.55);

  const team = u.team[i];
  const enemyOfPlayer = u.side[i] !== TEAM_PLAYER && !b.setup.arena;
  const killerIsPlayer = src >= 0 && b.isPlayerish(src);
  if (src >= 0 && u.active[src]) u.kills[src]++;

  if (!b.setup.arena) {
    if (team !== TEAM_PLAYER) { b.stats.kills++; b.stats.essence += Math.round(1 + sp.def.tier * 1.5 + ((flags & F_CAPTAIN) ? 10 : 0)); b.stats.gold += Math.round(sp.def.cost * 0.12); }
    else if (!(flags & (F_SUMMON | F_CLONE))) { b.stats.lost++; track('units_lost'); }
  }
  if (killerIsPlayer && enemyOfPlayer) {
    b.stats.playerKills++;
    if (b.player && b.player.killHeal > 0 && b.playerIdx >= 0) { const pi = b.playerIdx; u.hp[pi] = Math.min(u.hpMax[pi], u.hp[pi] + u.hpMax[pi] * b.player.killHeal); }
    track('enemies_killed');
    b.streak++; b.streakT = 2.2;
    if (b.streak > b.stats.maxStreak) b.stats.maxStreak = b.streak;
    const s = b.streak;
    const call = s === 2 ? '¡DOBLE!' : s === 3 ? '¡TRIPLE!' : s === 5 ? '¡MASACRE!' : s === 8 ? '¡IMPARABLE!' : s === 12 ? '¡EXCEPCIONAL!' : s > 12 && s % 6 === 0 ? `¡${s} SEGUIDAS!` : '';
    if (call) b.callout(call, 'streak', `${s} bajas`);
    b.hitstop(60);
    // essence motes drift to Elias
    b.fx.emit('essence', b.tmpV.set(x, u.y[i] + hgt * 0.6, z), { count: 6, up: 2.5 });
  }

  // morale shock nearby
  const n = b.grid.query(u, x, z, 7, MORALE_BUF, 64);
  const capt = (flags & (F_CAPTAIN | F_BOSS | F_HERO)) !== 0;
  for (let k = 0; k < n; k++) {
    const j = MORALE_BUF[k];
    if (j === i || u.side[j] !== u.side[i]) continue;
    u.morale[j] -= capt ? 14 : 4;
  }
  if (capt) {
    for (let j = 0; j < u.n; j++) if (u.active[j] && u.state[j] !== S_DEAD && u.team[j] === team && j !== i) u.morale[j] -= 22;
    const name = b.nameOf(i);
    const id = b.metaOf(i)?.npcId ?? name;
    if (team !== TEAM_PLAYER && !b.setup.arena) b.stats.captainsKilled.push(id);
    b.callout(flags & (F_BOSS | F_HERO) ? `¡${name.toUpperCase()} HA CAÍDO!` : '¡CAPITÁN CAÍDO!', 'captain', name);
    engine.slowmo(0.22, 1.2);
    engine.pipeline.impact(2, 1);
    b.hitstop(90);
    b.cam.rig.shake(0.6);
    b.sfx('impact_frame', NaN, NaN, 0.9, 1, 300);
  }
  b.onUnitDeath?.(i);
  if (flags & (F_EATEN | F_NOCORPSE)) b.remove(i);
}
const MORALE_BUF = new Int32Array(64);

// ───────────────────────────── basic attacks ─────────────────────────────

export const ATK_DUR = [0.62, 0.56, 1.0, 0.85, 0.8, 0.44, 0.78];     // by AS_*
export const STRIKE_AT = [0.52, 0.58, 0.72, 0.55, 0.56, 0.5, 0.56];

const HIT_BUF = new Int32Array(64);

/** The strike moment of a basic attack. */
export function strike(b: Battle, i: number): void {
  const u = b.u, sp = specAt(u.spec[i]);
  const t = u.target[i];
  let dmg = u.dmg[i] * u.dmgMul[i] * dmgOutMul(b, i);
  const blind = (u.stMask[i] & B_BLIND) !== 0;
  let crit = Math.random() < 0.07;
  if (sp.role === 'asesino' && t >= 0) {
    // backstab
    const fx = Math.sin(u.yaw[t]), fz = Math.cos(u.yaw[t]);
    const dx = u.x[i] - u.x[t], dz = u.z[i] - u.z[t];
    if ((fx * dx + fz * dz) / (Math.hypot(dx, dz) || 1) < -0.3) crit = true;
  }
  if (crit) dmg *= 2;
  const fwdX = Math.sin(u.yaw[i]), fwdZ = Math.cos(u.yaw[i]);
  if (sp.ranged) {
    if (t < 0 || !b.alive(t)) return;
    const s = u.scale[i];
    const hx = u.x[i] + fwdX * 0.5 * s, hz = u.z[i] + fwdZ * 0.5 * s, hy = u.y[i] + sp.dims.legLen * s + sp.dims.torsoLen * s * 0.8;
    let tx = u.x[t], tz = u.z[t];
    const ty = u.y[t] + b.heightOf(t) * 0.55;
    const d = Math.hypot(tx - hx, tz - hz);
    const kind = sp.projectile;
    const speed = kind === P_BULLET ? 60 : kind === P_ARROW ? 30 : kind === P_ORB ? 20 : kind === P_ROCK ? 22 : 18;
    const flight = d / speed;
    tx += u.vx[t] * flight * 0.9; tz += u.vz[t] * flight * 0.9;
    const spread = (blind ? 5 : 0.6) + d * 0.02;
    tx += (Math.random() - 0.5) * spread; tz += (Math.random() - 0.5) * spread;
    b.proj.spawn({
      kind, x: hx, y: hy, z: hz, tx, ty, tz, speed, owner: i, side: u.side[i], dmg, crit,
      knock: kind === P_ROCK ? 12 : kind === P_BOMB ? 9 : kind === P_BULLET ? 4 : 1.5,
      radius: kind === P_BOMB ? 2.6 : kind === P_ROCK ? 1.6 : 0,
      homing: kind === P_ORB ? t : -1, arc: kind === P_BOMB || kind === P_ROCK ? 'high' : 'low',
      color: kind === P_ORB ? '#c7a2ff' : undefined, scale: kind === P_ROCK ? Math.max(1, u.scale[i] * 0.6) : 1,
    });
    b.sfx(kind === P_ARROW ? 'arrow_shot' : kind === P_BULLET ? 'explosion' : kind === P_ORB ? 'cast_arcane' : 'whoosh', u.x[i], u.z[i], kind === P_BULLET ? 0.25 : 0.4, kind === P_BULLET ? 2 : 1, 70);
    if (kind === P_BULLET) b.fx.emit('smoke', b.tmpV.set(hx + fwdX * 0.6, hy, hz + fwdZ * 0.6), { count: 4, scale: 0.4 });
    return;
  }
  if (blind && Math.random() < 0.5) { if (b.isPlayerish(t)) b.float(i, 'Falló', 'small'); return; }
  const reach = u.range[i] + u.radius[i] + 0.7;
  const kn = u.knock[i] * (crit ? 1.6 : 1);
  if (sp.cleave) {
    const n = b.grid.query(u, u.x[i] + fwdX * reach * 0.5, u.z[i] + fwdZ * reach * 0.5, reach * 0.8 + 1, HIT_BUF, 64);
    let hits = 0;
    for (let k = 0; k < n; k++) {
      const j = HIT_BUF[k];
      if (!b.hostile(i, j) || !b.alive(j)) continue;
      const dx = u.x[j] - u.x[i], dz = u.z[j] - u.z[i], d = Math.hypot(dx, dz) || 1;
      if (d > reach + u.radius[j] || (dx * fwdX + dz * fwdZ) / d < 0.1) continue;
      damage(b, j, dmg * (hits === 0 ? 1 : 0.75), { src: i, crit, knock: kn, dirX: dx / d, dirZ: dz / d, kind: 0 });
      hits++;
    }
    if (hits) {
      b.sfx('hit_heavy', u.x[i], u.z[i], 0.7);
      b.fx.emit('dust', b.tmpV.set(u.x[i] + fwdX * reach * 0.7, u.y[i] + 0.3, u.z[i] + fwdZ * reach * 0.7), { count: 8, scale: u.scale[i] * 0.6 });
      b.cam.rig.shake(Math.min(0.25, 0.04 * u.scale[i]) * (b.cam.rig.focus.distanceTo(b.tmpV) < 25 ? 1 : 0));
    }
    return;
  }
  if (t < 0 || !b.alive(t)) return;
  const dx = u.x[t] - u.x[i], dz = u.z[t] - u.z[i], d = Math.hypot(dx, dz) || 1;
  if (d > reach + u.radius[t] + 0.5) return;
  damage(b, t, dmg, { src: i, crit, knock: kn, dirX: dx / d, dirZ: dz / d, kind: 0 });
  const hx = u.x[i] + dx / d * (d - u.radius[t]), hz = u.z[i] + dz / d * (d - u.radius[t]);
  b.fx.emit('spark', b.tmpV.set(hx, u.y[t] + b.heightOf(t) * 0.55, hz), { count: crit ? 10 : 5 });
  b.sfx(sp.style === AS_PUNCH ? 'hit_light' : (u.stMask[t] & B_SHIELD) ? 'shield_block' : 'sword_clash', u.x[i], u.z[i], 0.45, 1, 60);
}

/** Projectile impact (unit = -1 for ground). */
export function projectileHit(b: Battle, p: number, unit: number, x: number, y: number, z: number): void {
  const pr = b.proj, u = b.u;
  const src = pr.owner[p];
  const abIdx = pr.ab[p];
  const ab = abIdx >= 0 ? abilityAt(abIdx) : null;
  const kind = pr.kind[p];
  const radius = pr.radius[p];
  const dmg = pr.dmg[p];
  const crit = pr.crit[p] === 1;
  const carried = pr.carry[p];
  if (carried >= 0) { b.abilities?.landThrown(carried, x, z, src); }
  if (radius > 0) {
    explode(b, x, y, z, radius, dmg, pr.knock[p], src, pr.side[p], ab, crit);
    if (kind === P_BOMB) { b.fx.emit('confetti', b.tmpV.set(x, y + 0.5, z), { count: 22 }); }
    return;
  }
  if (unit < 0) {
    if (kind === P_ORB) b.fx.emit(ab?.preset ?? 'arcane', b.tmpV.set(x, y + 0.2, z), { count: 6, color: ab?.color });
    else b.fx.emit('dust', b.tmpV.set(x, y + 0.1, z), { count: 3, scale: 0.4 });
    return;
  }
  const dx = pr.vx[p], dz = pr.vz[p], l = Math.hypot(dx, dz) || 1;
  const dealt = damage(b, unit, dmg, { src, ab, crit, knock: pr.knock[p], dirX: dx / l, dirZ: dz / l, kind: ab || kind === P_ORB ? K_MAGIC : K_RANGED });
  if (ab && dealt >= 0) applyEffects(b, unit, ab, src, dx / l, dz / l, true);
  const hy = u.y[unit] + b.heightOf(unit) * 0.55;
  if (kind === P_ORB) b.fx.emit(ab?.preset ?? 'arcane', b.tmpV.set(x, hy, z), { count: 10, color: ab?.color });
  else b.fx.emit('hit', b.tmpV.set(x, hy, z), { count: 5 });
  b.sfx(kind === P_ARROW ? 'arrow_hit' : kind === P_ORB ? 'hit_magic' : 'hit_light', x, z, 0.45, 1, 50);
}

/** Radial explosion with falloff; applies ability effects. */
export function explode(b: Battle, x: number, y: number, z: number, r: number, dmg: number, knock: number, src: number, side: number, ab: AbilityRT | null, crit = false, friendly = false): number {
  const u = b.u;
  const n = b.grid.query(u, x, z, r + 1.2, HIT_BUF, 64);
  let hits = 0;
  for (let k = 0; k < n; k++) {
    const j = HIT_BUF[k];
    if (!b.alive(j) || (!friendly && u.side[j] === side) || j === src) continue;
    const dx = u.x[j] - x, dz = u.z[j] - z, d = Math.hypot(dx, dz);
    if (d > r + u.radius[j]) continue;
    const f = 1 - Math.min(1, d / (r + u.radius[j])) * 0.6;
    const l = d || 1;
    damage(b, j, dmg * f, { src, ab, crit, knock: knock * (0.5 + f * 0.5), dirX: dx / l, dirZ: dz / l, kind: ab ? K_MAGIC : K_RANGED, up: 1.2 });
    if (ab) applyEffects(b, j, ab, src, dx / l, dz / l, true);
    hits++;
  }
  // corpses get tossed too (permanence + comedy)
  for (let j = 0; j < u.n; j++) {
    if (!u.active[j] || u.state[j] !== S_DEAD || u.rig[j] >= 0) continue;
    const dx = u.x[j] - x, dz = u.z[j] - z, d = Math.hypot(dx, dz);
    if (d > r) continue;
    const f = (1 - d / r) * knock * 0.5;
    b.rag.kick(u, j, (dx / (d || 1)) * f, f * 0.8, (dz / (d || 1)) * f);
  }
  b.siege?.blast(x, z, r, dmg);
  const big = src >= 0 && b.isPlayerish(src);
  b.fx.emit(ab?.preset === 'fire' || !ab ? 'explosion' : ab.preset, b.tmpV.set(x, y + 0.4, z), { count: big ? 24 : 14, scale: Math.max(0.5, r / 3.4), color: ab?.color });
  b.fx.emit('smoke', b.tmpV.set(x, y + 0.5, z), { count: 8, scale: r / 3 });
  b.fx.ring(b.tmpV.set(x, y, z), { color: ab?.color ?? '#ffb347', radius: r * 1.1, duration: 0.4 });
  b.fx.flash(b.tmpV.set(x, y + 0.6, z), { color: ab?.color ?? '#ffcf5a', radius: r * (big ? 0.7 : 0.45), duration: big ? 0.22 : 0.16, intensity: big ? 2.4 : 1.3 });
  b.sfx('explosion', x, z, 0.8, r > 4 ? 0.8 : 1, 60);
  const f = b.cam.rig.focus, dd = Math.hypot(f.x - x, f.z - z);
  if (dd < 30) b.cam.rig.shake(Math.min(0.5, r * 0.06) * (1 - dd / 30));
  return hits;
}

/** Applies an ability's EffectSpec list to a unit (statuses, heal, extra damage, knockback, pull). */
export function applyEffects(b: Battle, t: number, ab: AbilityRT, src: number, dirX: number, dirZ: number, skipKnock = false): void {
  const u = b.u;
  const eff = ab.def.effects;
  if (!eff || !b.alive(t)) return;
  const hostile = src >= 0 && u.side[src] !== u.side[t];
  if (hostile && (u.flags[t] & F_PLAYER)) comprehendHit(b, ab, false);
  for (const e of eff) {
    if (e.chance !== undefined && Math.random() > e.chance) continue;
    if (e.status) {
      const good = e.status === 'escudo' || e.status === 'regeneracion' || e.status === 'prisa' || e.status === 'furia' || e.status === 'robo_vida' || e.status === 'inmortal' || e.status === 'invisible';
      if (good === hostile) continue; // buffs to allies, debuffs to enemies
      applyStatus(b, t, e.status as StatusId, e.duration ?? ab.def.duration ?? 4, e.magnitude, src, ab);
    }
    if (e.heal && !hostile) heal(b, t, e.heal, src);
    if (e.heal && hostile && src >= 0) heal(b, src, e.heal, src);
    if (e.damage && hostile) damage(b, t, e.damage, { src, ab, kind: K_MAGIC });
    if (!skipKnock && e.knockback && hostile) knockback(b, t, dirX, dirZ, e.knockback);
    if (e.pull && hostile && src >= 0) {
      const dx = u.x[src] - u.x[t], dz = u.z[src] - u.z[t], l = Math.hypot(dx, dz) || 1;
      knockback(b, t, dx / l, dz / l, e.pull, 0.6);
    }
  }
}

/** Largest knockback in an ability's effects (for damage() calls). */
export function abilityKnock(ab: AbilityRT | null): number { return ab ? ab.knock : 0; }

/** Air-state helpers used by the sim. */
export function landing(b: Battle, i: number, impact: number): void {
  const u = b.u;
  if (impact > 14 && !(u.flags[i] & (F_PLAYER | F_BOSS | F_HERO))) {
    const d = (impact - 14) * 1.6;
    if (d > 1) damage(b, i, d, { src: u.lastHitBy[i], kind: K_FALL, silent: !b.isPlayerish(u.lastHitBy[i]) });
  }
  if (!b.alive(i)) return;
  b.sfx('ragdoll_thud', u.x[i], u.z[i], Math.min(0.8, impact / 20), 1, 60);
  b.fx.emit('dust', b.tmpV.set(u.x[i], u.y[i] + 0.1, u.z[i]), { count: Math.min(12, 3 + (impact | 0)), scale: 0.6 * u.scale[i] });
  if (u.flags[i] & F_THROWN) { u.flags[i] &= ~F_THROWN; }
}

