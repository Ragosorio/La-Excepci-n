/**
 * Battle simulation step: AI decisions, steering integration, TABS flights / bowling / bounces,
 * overlap resolution, morale & rout, corpses. Allocation-free hot loop over the SoA unit store.
 */
import type { Battle } from './world';
import { specAt } from './defs';
import {
  AS_CAST, B_CHARM, B_FEAR, B_FROZEN, B_INVIS, B_MIND, B_ROOT, B_STUN, B_TAUNT, B_TOAD, B_TRAITOR, F_BOSS, F_CAPTAIN, F_CLONE, F_FLED, F_HERO,
  F_NOAI, F_PLAYER, F_ROUT, F_SCRIPTED, F_SUMMON, F_TOWER, FIELD, GRAVITY, NA, NS, S_AIR, S_ATTACK, S_CAST, S_DASH, S_DEAD, S_DOWN, S_HELD, S_IDLE, S_MOVE,
  SI, TEAM_PLAYER, EX_ANGRY, EX_DETERMINED, EX_NEUTRAL, EX_SCARED,
} from './const';
import { ATK_DUR, STRIKE_AT, damage, knockback, landing, strike, K_DOT } from './combat';
import { atkMul, speedMul, tickStatus } from './status';
import { angDiff, springArr } from './mathx';
import type { StatusId } from '../data/types';

const NB = new Int32Array(128);
const ORDER_CHARGE = 0, ORDER_HOLD = 1, ORDER_FOLLOW = 2;
const CORPSE_LIFE = 38;
const MAX_CORPSES = 170;

let bRef: Battle | null = null;
function dotFn(i: number, amount: number, src: number, kind: StatusId): void {
  if (bRef && amount > 0) damage(bRef, i, amount, { src, kind: K_DOT, silent: amount < 3 && !bRef.isPlayerish(i), school: kind === 'quemadura' ? 'fuego' : 'veneno' });
}

export function simStep(b: Battle, dt: number): void {
  if (dt <= 0) return;
  bRef = b;
  const u = b.u;
  b.grid.build(u);
  b.refreshSides();
  // melee slot counts from current targets
  u.attackers.fill(0, 0, u.n);
  for (let i = 0; i < u.n; i++) { const t = u.target[i]; if (t >= 0 && u.active[i] && u.state[i] !== S_DEAD && !specAt(u.spec[i]).ranged) u.attackers[t]++; }
  const fightOn = b.phase === 'fight';
  for (let i = 0; i < u.n; i++) if (u.active[i]) stepUnit(b, i, dt, fightOn);
  resolve(b);
  b.rag.update(u, dt);
  corpses(b, dt);
  if (b.streakT > 0) { b.streakT -= dt; if (b.streakT <= 0) b.streak = 0; }
}

function stepUnit(b: Battle, i: number, dt: number, fightOn: boolean): void {
  const u = b.u;
  const st = u.state[i];
  if (st === S_DEAD) { u.deadT[i] += dt; return; }
  u.stT[i] += dt; u.sinceHit[i] += dt;
  if (u.flash[i] > 0) u.flash[i] = Math.max(0, u.flash[i] - dt * 7);
  if (u.exprT[i] > 0) u.exprT[i] -= dt;
  u.blinkT[i] -= dt; if (u.blinkT[i] < 0) u.blinkT[i] = 2 + Math.random() * 4;
  for (let k = 0; k < NA; k++) if (u.abilCd[i * NA + k] > 0) u.abilCd[i * NA + k] -= dt;
  tickStatus(b, i, dt, dotFn);
  if (!u.active[i] || u.state[i] === S_DEAD) return;
  if (u.lifeT[i] > 0) { u.lifeT[i] -= dt; if (u.lifeT[i] <= 0) { expireSummon(b, i); return; } }
  // ghosting (invisibility dither)
  const invis = (u.stMask[i] & B_INVIS) !== 0;
  const gGoal = invis ? (u.side[i] === TEAM_PLAYER || b.spectator ? 0.55 : b.revealInvisible ? 0.5 : 0.93) : 0;
  u.ghost[i] += (gGoal - u.ghost[i]) * Math.min(1, dt * 6);

  if (st === S_HELD) return;
  if (st === S_AIR) { air(b, i, dt); return; }
  if (st === S_DOWN) { down(b, i, dt); return; }
  if (st === S_DASH) { if (!(u.flags[i] & F_PLAYER)) b.abilities?.dashStep(i, dt); anim(b, i, dt); return; }
  if (u.flags[i] & F_PLAYER) { settle(b, i, dt); anim(b, i, dt); return; }

  if (fightOn) morale(b, i, dt);
  const mask = u.stMask[i];
  if (!fightOn || (mask & (B_STUN | B_FROZEN))) {
    u.wantX[i] = u.wantZ[i] = 0; u.wantFace[i] = 0;
    if (u.state[i] === S_ATTACK) { u.state[i] = S_IDLE; u.atkPh[i] = -1; }
    integrate(b, i, dt);
    anim(b, i, dt);
    return;
  }
  if (u.atkT[i] > 0) u.atkT[i] -= dt * atkMul(b, i);
  think(b, i, dt);
  if (!u.active[i]) return;
  { const s2 = u.state[i]; if (s2 === S_DEAD || s2 === S_AIR || s2 === S_HELD || s2 === S_DOWN) return; } // think() may have cast something that killed / launched this unit
  if (u.state[i] === S_ATTACK) {
    const sp = specAt(u.spec[i]);
    u.atkPh[i] += dt / u.atkDur[i];
    if (!u.atkHit[i] && u.atkPh[i] >= STRIKE_AT[sp.style]) { u.atkHit[i] = 1; strike(b, i); }
    if (u.atkPh[i] >= 1) { u.atkPh[i] = -1; if (u.state[i] === S_ATTACK) u.state[i] = S_MOVE; }
    u.wantX[i] *= 0.25; u.wantZ[i] *= 0.25;
  } else if (u.state[i] === S_CAST) {
    b.abilities?.castStep(i, dt);
    u.wantX[i] = u.wantZ[i] = 0;
  }
  integrate(b, i, dt);
  anim(b, i, dt);
}

// ───────────────────────────── AI ─────────────────────────────

function think(b: Battle, i: number, dt: number): void {
  const u = b.u, sp = specAt(u.spec[i]);
  const mask = u.stMask[i], flags = u.flags[i];
  const spd = u.speed[i] * speedMul(b, i);
  u.wantFace[i] = 0;
  if (u.state[i] === S_CAST) { stop(u, i); return; }
  if ((flags & F_ROUT) || (mask & B_FEAR)) { flee(b, i, spd * 1.15); return; }
  if (mask & B_TOAD) { toadHop(b, i, spd); return; }
  if (mask & B_CHARM) { charmed(b, i, spd); return; }
  if (u.moveOn[i]) {
    const d = seek(u, i, u.moveX[i], u.moveZ[i], spd, 0.4);
    if (d < 0.6) u.moveOn[i] = 0;
    if (flags & F_SCRIPTED) return;
    if (u.moveOn[i]) return;
  }
  if (flags & (F_NOAI | F_SCRIPTED)) { stop(u, i); return; }

  // abilities
  u.abilCheckT[i] -= dt;
  if (u.abilCheckT[i] <= 0 && u.state[i] !== S_ATTACK) {
    u.abilCheckT[i] = 0.4 + u.seed[i] * 0.35;
    if (!(mask & (1 << SI.silencio)) && b.abilities?.aiTry(i)) { stop(u, i); return; }
  }

  // target maintenance
  let t = u.target[i];
  if (t >= 0 && (!b.alive(t) || !b.hostile(i, t) || (u.flags[t] & F_FLED) || u.state[t] === S_HELD || ((u.stMask[t] & B_INVIS) && dist2(u, i, t) > 6))) { t = -1; u.target[i] = -1; }
  u.retargetT[i] -= dt;
  if (u.retargetT[i] <= 0 || t < 0) {
    u.retargetT[i] = 0.35 + u.seed[i] * 0.3;
    t = pickTarget(b, i, t);
    u.target[i] = t;
  }

  // player-side orders
  const playerSide = u.side[i] === TEAM_PLAYER && !b.setup.arena && !(mask & (B_MIND | B_TRAITOR)) && !(flags & (F_CLONE | F_HERO));
  const order = playerSide ? b.orders[0] : ORDER_CHARGE;
  const pi = b.playerIdx;
  if (order === ORDER_HOLD) {
    const hx = u.homeX[i], hz = u.homeZ[i];
    const tooFar = t < 0 || Math.hypot(u.x[t] - hx, u.z[t] - hz) > (sp.ranged ? u.range[i] * 0.95 : 7);
    if (tooFar) {
      const d = seek(u, i, hx, hz, spd, 0.5);
      if (d < 1.2) { u.wantFace[i] = 1; u.wantYaw[i] = u.team[i] === TEAM_PLAYER ? 0 : Math.PI; }
      if (t >= 0 && sp.ranged && d < 1.5 && Math.hypot(u.x[t] - u.x[i], u.z[t] - u.z[i]) <= u.range[i]) engage(b, i, t, spd, sp.ranged);
      return;
    }
  } else if (order === ORDER_FOLLOW && pi >= 0 && b.alive(pi)) {
    const px = u.x[pi], pz = u.z[pi];
    const near = t >= 0 && Math.hypot(u.x[t] - px, u.z[t] - pz) < 11;
    if (!near) {
      const a = u.seed[i] * 6.283, r = 2.5 + u.seed[i] * 5.5;
      const fx = Math.sin(u.yaw[pi]), fz = Math.cos(u.yaw[pi]);
      const ox = Math.cos(a) * r - fx * 2.5, oz = Math.sin(a) * r - fz * 2.5;
      seek(u, i, px + ox, pz + oz, Math.max(spd, u.speed[pi] * 1.05), 0.8);
      return;
    }
  }
  if (t < 0) { advance(b, i, spd * 0.6); return; }
  engage(b, i, t, spd, sp.ranged);
}

function engage(b: Battle, i: number, t: number, spd: number, ranged: boolean): void {
  const u = b.u, sp = specAt(u.spec[i]);
  const dx = u.x[t] - u.x[i], dz = u.z[t] - u.z[i];
  const d = Math.hypot(dx, dz) || 1e-3;
  if (u.state[i] === S_ATTACK) { face(u, i, dx, dz); return; }
  if (ranged) {
    const range = u.range[i];
    if (d > range * 0.95) { seek(u, i, u.x[t], u.z[t], spd, range * 0.85); return; }
    if (d < Math.min(4, range * 0.3) && !(u.flags[i] & F_TOWER)) {
      u.wantX[i] = (-dx / d) * spd * 0.75; u.wantZ[i] = (-dz / d) * spd * 0.75; face(u, i, dx, dz);
      if (u.atkT[i] <= 0 && sp.style === AS_CAST) startAttack(b, i);
      return;
    }
    stop(u, i); face(u, i, dx, dz);
    if (u.atkT[i] <= 0 && facing(u, i, dx, dz)) startAttack(b, i);
    return;
  }
  const reach = u.range[i] + u.radius[i] + u.radius[t] + 0.1;
  if (d > reach) {
    if (sp.healer && d < 9) { stop(u, i); face(u, i, dx, dz); return; }
    seek(u, i, u.x[t], u.z[t], spd, reach * 0.8);
    return;
  }
  stop(u, i); face(u, i, dx, dz);
  if (u.atkT[i] <= 0 && facing(u, i, dx, dz)) startAttack(b, i);
}

export function startAttack(b: Battle, i: number): void {
  const u = b.u, sp = specAt(u.spec[i]);
  const am = atkMul(b, i);
  u.state[i] = S_ATTACK; u.stT[i] = 0; u.atkPh[i] = 0; u.atkHit[i] = 0;
  u.atkDur[i] = ATK_DUR[sp.style] * (0.9 + u.seed[i] * 0.2) / am * (1 + (u.scale[i] - 1) * 0.22);
  u.atkT[i] = u.atkCd[i] * (0.85 + Math.random() * 0.3) / am;
  u.exprTmp[i] = EX_ANGRY; u.exprT[i] = u.atkDur[i];
  if (u.rig[i] >= 0) b.rigs?.play(i, sp.style === AS_CAST ? 'cast' : 'attack', u.atkDur[i]);
  if (!sp.ranged && Math.random() < 0.35) b.sfx('sword_swing', u.x[i], u.z[i], 0.25, 1 / Math.sqrt(u.scale[i]), 90);
}

function pickTarget(b: Battle, i: number, cur: number): number {
  const u = b.u, sp = specAt(u.spec[i]);
  if (u.stMask[i] & B_TAUNT) { const s = u.stSrc[i * NS + SI.provocar]; if (b.alive(s) && b.hostile(i, s)) return s; }
  const my = u.side[i], x = u.x[i], z = u.z[i];
  const ranged = sp.ranged;
  const enemyOfPlayer = u.side[i] !== TEAM_PLAYER;
  let best = -1, bestS = 1e9, curS = 1e9;
  for (let s = 0; s < 3; s++) {
    if (s === my) continue;
    const list = b.sideList[s], n = b.sideCount[s];
    for (let k = 0; k < n; k++) {
      const j = list[k];
      const fj = u.flags[j];
      if (fj & F_FLED) continue;
      const dx = u.x[j] - x, dz = u.z[j] - z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if ((u.stMask[j] & B_INVIS) && d > 2.2) continue;
      if (u.state[j] === S_HELD) continue;
      let sc = d * (ranged ? 0.75 : 1);
      if ((fj & F_PLAYER) && enemyOfPlayer) sc -= (u.flags[i] & (F_CAPTAIN | F_HERO | F_BOSS)) ? 8 : 2.5;
      if ((fj & F_CLONE) && enemyOfPlayer) sc -= 2;
      if (!ranged && u.attackers[j] >= 4 && j !== cur) sc += 5;
      if (fj & F_ROUT) sc += 7;
      if (u.state[j] === S_AIR) sc += 3;
      if (fj & F_TOWER) sc += ranged ? 0 : 20;
      if (j === cur) curS = sc;
      if (sc < bestS) { bestS = sc; best = j; }
    }
  }
  if (cur >= 0 && curS < 1e9 && bestS > curS * 0.7) best = cur;
  return best;
}

function advance(b: Battle, i: number, spd: number): void {
  const u = b.u;
  // march toward the enemy's side of the field (keeps armies from idling)
  const fs = b.foeSide(u.side[i]);
  const n = b.sideCount[fs];
  if (n === 0) { stop(u, i); return; }
  let cx = 0, cz = 0;
  const list = b.sideList[fs];
  const step = Math.max(1, Math.floor(n / 16));
  let c = 0;
  for (let k = 0; k < n; k += step) { cx += u.x[list[k]]; cz += u.z[list[k]]; c++; }
  seek(u, i, cx / c, cz / c, spd, 2);
}

function flee(b: Battle, i: number, spd: number): void {
  const u = b.u;
  let fx = 0, fz = 0;
  const src = u.stSrc[i * NS + SI.miedo];
  if ((u.stMask[i] & B_FEAR) && src >= 0 && u.active[src]) { fx = u.x[i] - u.x[src]; fz = u.z[i] - u.z[src]; }
  else {
    // routers run to their own edge
    fz = u.team[i] === TEAM_PLAYER ? -1 : 1;
    if (b.setup.arena) fz = u.team[i] === 0 ? -1 : 1;
    fx = (u.seed[i] - 0.5) * 0.6;
  }
  const l = Math.hypot(fx, fz) || 1;
  u.wantX[i] = (fx / l) * spd; u.wantZ[i] = (fz / l) * spd;
  if ((u.flags[i] & F_ROUT) && (Math.abs(u.x[i]) > FIELD + 3 || Math.abs(u.z[i]) > FIELD + 3 || (b.arena.round && Math.hypot(u.x[i], u.z[i]) > b.arena.fieldR - 1.5))) fled(b, i);
}

function fled(b: Battle, i: number): void {
  const u = b.u;
  u.flags[i] |= F_FLED;
  if ((u.flags[i] & (F_CAPTAIN | F_BOSS | F_HERO)) && u.team[i] !== TEAM_PLAYER) {
    const m = b.metaOf(i);
    b.stats.captainsFled.push(m?.npcId ?? m?.name ?? b.nameOf(i));
    b.callout(`${b.nameOf(i)} huye`, 'info');
  }
  b.remove(i);
}

function toadHop(b: Battle, i: number, spd: number): void {
  const u = b.u;
  const t = Math.floor(b.time * 0.8 + u.seed[i] * 7);
  const a = ((t * 2654435761) % 1000) / 1000 * 6.283 + u.seed[i] * 3;
  u.wantX[i] = Math.cos(a) * spd * 0.6; u.wantZ[i] = Math.sin(a) * spd * 0.6;
}

function charmed(b: Battle, i: number, spd: number): void {
  const u = b.u;
  const src = u.stSrc[i * NS + SI.encanto];
  if (src >= 0 && u.active[src]) { seek(u, i, u.x[src], u.z[src], spd * 0.4, 2.5); face(u, i, u.x[src] - u.x[i], u.z[src] - u.z[i]); }
  else stop(u, i);
}

// ───────────────────────────── steering helpers ─────────────────────────────

function stop(u: Battle['u'], i: number): void { u.wantX[i] = 0; u.wantZ[i] = 0; }
function face(u: Battle['u'], i: number, dx: number, dz: number): void { u.wantFace[i] = 1; u.wantYaw[i] = Math.atan2(dx, dz); }
function facing(u: Battle['u'], i: number, dx: number, dz: number): boolean { return Math.abs(angDiff(u.yaw[i], Math.atan2(dx, dz))) < 0.6; }
function dist2(u: Battle['u'], a: number, c: number): number { const dx = u.x[a] - u.x[c], dz = u.z[a] - u.z[c]; return dx * dx + dz * dz; }
function seek(u: Battle['u'], i: number, tx: number, tz: number, spd: number, stopD: number): number {
  const dx = tx - u.x[i], dz = tz - u.z[i];
  const d = Math.hypot(dx, dz);
  if (d <= stopD) { u.wantX[i] = 0; u.wantZ[i] = 0; return d; }
  const k = Math.min(1, (d - stopD) / 1.2) * spd / (d || 1);
  u.wantX[i] = dx * k; u.wantZ[i] = dz * k;
  return d;
}

// ───────────────────────────── integration ─────────────────────────────

const CL = { x: 0, z: 0 };

function integrate(b: Battle, i: number, dt: number): void {
  const u = b.u;
  const frozen = (u.stMask[i] & B_FROZEN) !== 0;
  if (frozen) { const f = Math.exp(-1.2 * dt); u.vx[i] *= f; u.vz[i] *= f; }
  else {
    const acc = u.state[i] === S_ATTACK ? 5 : 11;
    const k = 1 - Math.exp(-acc * dt);
    u.vx[i] += (u.wantX[i] - u.vx[i]) * k; u.vz[i] += (u.wantZ[i] - u.vz[i]) * k;
  }
  if (u.stMask[i] & B_ROOT) { u.vx[i] = 0; u.vz[i] = 0; }
  u.x[i] += u.vx[i] * dt; u.z[i] += u.vz[i] * dt;
  if (!frozen) {
    let goal = u.yaw[i];
    const sp2 = u.vx[i] * u.vx[i] + u.vz[i] * u.vz[i];
    if (u.wantFace[i]) goal = u.wantYaw[i];
    else if (sp2 > 0.16) goal = Math.atan2(u.vx[i], u.vz[i]);
    const rate = 9 / Math.sqrt(u.scale[i]);
    const d = angDiff(u.yaw[i], goal);
    u.yaw[i] += Math.max(-rate * dt, Math.min(rate * dt, d));
  }
  if (!(u.flags[i] & F_TOWER)) {
    if (!(u.flags[i] & F_ROUT) && b.arena.clampField(u.x[i], u.z[i], u.radius[i], CL)) { u.x[i] = CL.x; u.z[i] = CL.z; }
    u.y[i] = b.heightAt(u.x[i], u.z[i]);
  }
}

/** Player / scripted units: ground snap + field clamp (controllers set velocity). */
function settle(b: Battle, i: number, dt: number): void {
  const u = b.u;
  u.x[i] += u.vx[i] * dt; u.z[i] += u.vz[i] * dt;
  if (b.arena.clampField(u.x[i], u.z[i], u.radius[i], CL)) { u.x[i] = CL.x; u.z[i] = CL.z; }
  u.y[i] = b.heightAt(u.x[i], u.z[i]);
}

function anim(b: Battle, i: number, dt: number): void {
  const u = b.u;
  const vx = u.vx[i], vz = u.vz[i];
  const speed = Math.hypot(vx, vz);
  const s = u.scale[i];
  const k = Math.min(1.3, speed / (2.9 * Math.sqrt(s)));
  u.stride[i] += (k - u.stride[i]) * (1 - Math.exp(-10 * dt));
  u.walkPh[i] += dt * speed / (0.42 * s);
  const ax = (vx - u.lastVx[i]) / Math.max(dt, 1e-3), az = (vz - u.lastVz[i]) / Math.max(dt, 1e-3);
  u.lastVx[i] = vx; u.lastVz[i] = vz;
  const sy = Math.sin(u.yaw[i]), cy = Math.cos(u.yaw[i]);
  const fwd = ax * sy + az * cy, side = -ax * cy + az * sy;
  const gp = Math.max(-0.35, Math.min(0.35, fwd * 0.03)), gr = Math.max(-0.25, Math.min(0.25, side * 0.025));
  springArr(u.pitch, u.pitchV, i, gp, 3.2, 0.3, dt);
  springArr(u.roll, u.rollV, i, gr, 3.2, 0.3, dt);
  if (u.pitch[i] > 0.6) { u.pitch[i] = 0.6; u.pitchV[i] = 0; } else if (u.pitch[i] < -0.6) { u.pitch[i] = -0.6; u.pitchV[i] = 0; }
  // get-up: tumble springs back to upright
  if (u.tumble[i] !== 0 || u.tumbleR[i] !== 0) {
    const f = 1 - Math.exp(-9 * dt);
    u.tumble[i] -= u.tumble[i] * f; u.tumbleR[i] -= u.tumbleR[i] * f;
    if (Math.abs(u.tumble[i]) < 0.01) u.tumble[i] = 0;
    if (Math.abs(u.tumbleR[i]) < 0.01) u.tumbleR[i] = 0;
  }
  if (u.exprT[i] <= 0) {
    const t = u.target[i];
    u.expr[i] = (u.flags[i] & F_ROUT) ? EX_SCARED : t >= 0 && dist2(u, i, t) < 49 ? EX_DETERMINED : EX_NEUTRAL;
  }
}

// ───────────────────────────── flight ─────────────────────────────

function air(b: Battle, i: number, dt: number): void {
  const u = b.u;
  u.vy[i] -= GRAVITY * dt;
  const drag = Math.exp(-0.15 * dt);
  u.vx[i] *= drag; u.vz[i] *= drag;
  u.x[i] += u.vx[i] * dt; u.y[i] += u.vy[i] * dt; u.z[i] += u.vz[i] * dt;
  if (u.x[i] < -135) { u.x[i] = -135; u.vx[i] *= -0.3; } else if (u.x[i] > 135) { u.x[i] = 135; u.vx[i] *= -0.3; }
  if (u.z[i] < -135) { u.z[i] = -135; u.vz[i] *= -0.3; } else if (u.z[i] > 135) { u.z[i] = 135; u.vz[i] *= -0.3; }
  u.tumble[i] += u.spinP[i] * dt; u.tumbleR[i] += u.spinR[i] * dt;
  u.walkPh[i] += dt * 8;
  const sp = Math.hypot(u.vx[i], u.vz[i]);
  // bowling: flying bodies knock over whoever they hit
  if (sp > 6.5 && !(u.flags[i] & F_PLAYER)) {
    const n = b.grid.query(u, u.x[i], u.z[i], u.radius[i] + 1.4, NB, 32);
    for (let k = 0; k < n; k++) {
      const j = NB[k];
      if (j === i || u.state[j] === S_AIR || u.state[j] === S_DEAD || u.state[j] === S_HELD) continue;
      const dx = u.x[j] - u.x[i], dz = u.z[j] - u.z[i], d = Math.hypot(dx, dz);
      if (d > u.radius[i] + u.radius[j]) continue;
      if (u.y[i] > u.y[j] + b.heightOf(j) + 0.2) continue;
      const imp = sp * u.mass[i] * 0.45;
      knockback(b, j, (u.vx[i] / sp) * 0.7 + (dx / (d || 1)) * 0.3, (u.vz[i] / sp) * 0.7 + (dz / (d || 1)) * 0.3, imp, 0.8);
      if (!(u.flags[j] & F_PLAYER) && u.side[j] !== u.side[i]) damage(b, j, Math.min(25, imp * 0.8), { src: u.lastHitBy[i], kind: 4, silent: true });
      u.vx[i] *= 0.72; u.vz[i] *= 0.72;
      b.sfx('hit_light', u.x[i], u.z[i], 0.4, 0.8, 80);
    }
  }
  const gy = b.heightAt(u.x[i], u.z[i]);
  if (u.y[i] <= gy && u.vy[i] < 0) {
    const impact = Math.hypot(u.vx[i], u.vy[i], u.vz[i]);
    u.y[i] = gy;
    landing(b, i, impact);
    if (!b.alive(i)) return;
    if (impact > 10 && u.stT[i] < 3.5) {
      u.vy[i] = -u.vy[i] * 0.3; u.vx[i] *= 0.6; u.vz[i] *= 0.6; u.spinP[i] *= 0.55; u.spinR[i] *= 0.5;
    } else {
      u.state[i] = S_DOWN; u.stT[i] = 0;
      const isPl = (u.flags[i] & F_PLAYER) !== 0;
      u.stDur[i] = isPl ? 0.3 : 0.6 + Math.random() * 0.5 + (impact > 8 ? 0.3 : 0);
      u.vy[i] = 0;
      // settle to lying on back or front
      let tb = u.tumble[i] % 6.283; if (tb > Math.PI) tb -= 6.283; else if (tb < -Math.PI) tb += 6.283;
      u.tumble[i] = tb;
      u.tumbleR[i] = 0;
      if (u.rig[i] >= 0) b.rigs?.airborne(i, false);
    }
  }
}

function down(b: Battle, i: number, dt: number): void {
  const u = b.u;
  const f = Math.exp(-5 * dt);
  u.vx[i] *= f; u.vz[i] *= f;
  u.x[i] += u.vx[i] * dt; u.z[i] += u.vz[i] * dt;
  const goal = u.tumble[i] >= 0 ? Math.PI / 2 : -Math.PI / 2;
  u.tumble[i] += (goal - u.tumble[i]) * (1 - Math.exp(-12 * dt));
  u.y[i] = b.heightAt(u.x[i], u.z[i]) + 0.1 * u.scale[i];
  if (b.arena.clampField(u.x[i], u.z[i], u.radius[i], CL)) { u.x[i] = CL.x; u.z[i] = CL.z; }
  if (u.stT[i] >= u.stDur[i]) { u.state[i] = S_IDLE; u.stT[i] = 0; u.y[i] = b.heightAt(u.x[i], u.z[i]); }
  u.stride[i] *= f;
}

// ───────────────────────────── morale ─────────────────────────────

function morale(b: Battle, i: number, dt: number): void {
  const u = b.u, f = u.flags[i];
  if (f & (F_PLAYER | F_CLONE | F_CAPTAIN | F_BOSS | F_HERO | F_SUMMON)) return;
  if (u.stMask[i] & (B_MIND | B_TRAITOR)) return;
  const base = u.moraleBase[i];
  if (u.sinceHit[i] > 3 && u.morale[i] < base) u.morale[i] += dt * ((f & F_ROUT) ? 3 : 1.2);
  // Elias' presence terrifies his enemies (scaled by the place's fear)
  const pi = b.playerIdx;
  if (pi >= 0 && b.alive(pi) && u.side[i] !== u.side[pi] && dist2(u, i, pi) < 49) u.morale[i] -= dt * (1.4 + b.fearBonus);
  if (!(f & F_ROUT) && u.morale[i] < 20) {
    u.flags[i] |= F_ROUT; u.target[i] = -1;
    if (u.state[i] === S_ATTACK) { u.state[i] = S_IDLE; u.atkPh[i] = -1; }
    if (Math.random() < 0.15) b.sfx('crowd_gasp', u.x[i], u.z[i], 0.3, 1.4, 900);
  } else if ((f & F_ROUT) && u.morale[i] > 46 && u.sinceHit[i] > 5 && b.captainAlive(u.team[i])) {
    u.flags[i] &= ~F_ROUT;
  }
}

// ───────────────────────────── collisions ─────────────────────────────

function resolve(b: Battle): void {
  const u = b.u, g = b.grid;
  const obs = b.arena.obstacles, nObs = obs.length;
  for (let i = 0; i < u.n; i++) {
    if (!u.active[i]) continue;
    const st = u.state[i];
    if (st === S_DEAD || st === S_AIR || st === S_HELD || (u.flags[i] & F_TOWER)) continue;
    const ri = u.radius[i], x = u.x[i], z = u.z[i];
    const c0 = g.cx(x - ri - 1.3), c1 = g.cx(x + ri + 1.3), r0 = g.cz(z - ri - 1.3), r1 = g.cz(z + ri + 1.3);
    const pi = (u.flags[i] & F_PLAYER) !== 0;
    for (let rz = r0; rz <= r1; rz++) for (let cx = c0; cx <= c1; cx++) {
      const cell = rz * g.cols + cx;
      for (let k = g.start[cell], e = g.start[cell + 1]; k < e; k++) {
        const j = g.items[k];
        if (j <= i) continue;
        const sj = u.state[j];
        if (sj === S_AIR || sj === S_HELD || sj === S_DEAD || (u.flags[j] & F_TOWER)) continue;
        const dx = u.x[j] - u.x[i], dz = u.z[j] - u.z[i];
        const min = ri + u.radius[j];
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-8) continue;
        const d = Math.sqrt(d2), push = (min - d) * 0.5;
        const nx = dx / d, nz = dz / d;
        let mi = u.mass[i], mj = u.mass[j];
        if (pi) mi *= 4; if (u.flags[j] & F_PLAYER) mj *= 4;
        if (u.stMask[i] & B_ROOT) mi *= 10; if (u.stMask[j] & B_ROOT) mj *= 10;
        const wi = mj / (mi + mj), wj = mi / (mi + mj);
        u.x[i] -= nx * push * wi; u.z[i] -= nz * push * wi;
        u.x[j] += nx * push * wj; u.z[j] += nz * push * wj;
      }
    }
    for (let o = 0; o < nObs; o++) {
      const ob = obs[o];
      const dx = u.x[i] - ob.x, dz = u.z[i] - ob.z;
      const min = ob.r + ri;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 1e-3;
      u.x[i] = ob.x + (dx / d) * min; u.z[i] = ob.z + (dz / d) * min;
    }
    b.siege?.collide(i);
  }
}

// ───────────────────────────── corpses & summons ─────────────────────────────

function corpses(b: Battle, dt: number): void {
  const u = b.u;
  let n = 0;
  for (let i = 0; i < u.n; i++) if (u.active[i] && u.state[i] === S_DEAD && u.rig[i] < 0) n++;
  const over = n > MAX_CORPSES;
  for (let i = 0; i < u.n; i++) {
    if (!u.active[i] || u.state[i] !== S_DEAD || u.rig[i] >= 0) continue;
    if (u.deadT[i] > CORPSE_LIFE || (over && u.deadT[i] > 6)) {
      u.sink[i] += dt * 0.35;
      if (u.ragOn[i] === 1) u.ragOn[i] = 2;
      if (u.sink[i] > 1.4 * u.scale[i]) b.remove(i);
    }
  }
}

function expireSummon(b: Battle, i: number): void {
  const u = b.u;
  b.fx.emit('shadow', b.tmpV.set(u.x[i], u.y[i] + 1, u.z[i]), { count: 16 });
  b.fx.emit('smoke', b.tmpV, { count: 6 });
  b.sfx('clone', u.x[i], u.z[i], 0.4, 1.3);
  b.remove(i);
}

