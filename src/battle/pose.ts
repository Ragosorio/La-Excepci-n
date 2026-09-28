/**
 * Procedural TABS pose → world-space skeleton joints (J array), plus scratch frames for rendering.
 * Feet stay on the ground by lifting the pelvis to the longest leg's vertical extent (cheap "IK").
 * Angles: arm/leg α = 0 hanging down, +π/2 pointing forward, π pointing up.
 */
import type { Units } from './units';
import type { UnitSpec } from './defs';
import { frameFrom } from './mathx';
import {
  AS_BOW, AS_CAST, AS_GUN, AS_PUNCH, AS_SWING, AS_THROW, AS_THRUST, B_CHARM, B_DISABLED, B_FEAR, B_FROZEN, B_STUN,
  F_ROUT, NJ, S_AIR, S_ATTACK, S_CAST, S_DASH, S_DEAD, S_DOWN, S_HELD,
} from './const';

/** Root frame F,U,R of the last posed unit. */
export const FR = new Float32Array(9);
/** Torso frame F,U,R of the last posed unit. */
export const TF = new Float32Array(9);
/** Right-hand weapon direction (0..2) + reference (3..5). */
export const WEP = new Float32Array(6);
/** Head up (0..2) + head forward (3..5). */
export const HEAD = new Float32Array(6);

/** Victory cheer flag (set by the scene when the fight is over). */
export const poseGlobals = { cheerTeam: -1 };

const e01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function poseUnit(u: Units, i: number, sp: UnitSpec, time: number): void {
  const J = u.J, o = i * NJ * 3;
  const s = u.scale[i], d = sp.dims;
  frameFrom(FR, u.yaw[i], u.pitch[i] + u.tumble[i], u.roll[i] + u.tumbleR[i]);
  const Fx = FR[0], Fy = FR[1], Fz = FR[2], Ux = FR[3], Uy = FR[4], Uz = FR[5], Rx = FR[6], Ry = FR[7], Rz = FR[8];
  const bx = u.x[i], by = u.y[i], bz = u.z[i];
  const st = u.state[i], mask = u.stMask[i], sd = u.seed[i];
  const t = (mask & B_FROZEN) ? sd * 10 : time + sd * 10;

  // ── base walk / idle parameters
  const k = Math.min(1.3, u.stride[i]);
  const ph = u.walkPh[i];
  const sph = Math.sin(ph), cph = Math.cos(ph);
  let thL = sph * 0.62 * k, thR = -sph * 0.62 * k;
  let knL = Math.max(0, cph) * 1.0 * k + 0.06, knR = Math.max(0, -cph) * 1.0 * k + 0.06;
  let aL = -sph * 0.5 * k, aR = sph * 0.5 * k;
  let bL = 0.13 + 0.04 * k, bR = 0.13 + 0.04 * k;
  let eL = 0.18 + 0.3 * k, eR = 0.18 + 0.3 * k;
  let lean = 0.1 * k + Math.sin(t * 1.8) * 0.018 * (1 - Math.min(1, k));
  let twist = sph * 0.13 * k;
  let nod = -lean * 0.4 + Math.sin(t * 0.9) * 0.04;
  let fwdOff = 0, crouch = 0;
  let wAngle = 1.25;        // weapon angle offset from forearm (radians)
  let wMode = 0;            // 0 forearm-relative, 1 forward (spear/gun), 2 up (staff), 3 left-hand bow
  const style = sp.style;
  if (style === AS_THRUST) wMode = 1;
  else if (style === AS_GUN) wMode = 1;
  else if (style === AS_BOW) wMode = 3;
  else if (sp.weapon === 'baston' || sp.weapon === 'libro') wMode = 2;

  const idleAL = 0.05 + Math.sin(t * 1.8) * 0.03, idleAR = 0.05 - Math.sin(t * 1.8 + 1) * 0.03;

  if (st === S_AIR || st === S_HELD) {
    // flailing through the air (TABS signature)
    aL = 2.1 + Math.sin(t * 17 + sd * 9) * 0.9; aR = 2.3 + Math.sin(t * 19 + sd * 5) * 0.9;
    bL = bR = 0.85 + Math.sin(t * 11) * 0.25;
    eL = 0.6 + Math.sin(t * 13) * 0.5; eR = 0.6 + Math.cos(t * 12) * 0.5;
    thL = Math.sin(t * 15 + sd) * 0.8; thR = Math.sin(t * 15 + sd + 2.5) * 0.8;
    knL = 0.7 + Math.sin(t * 14) * 0.4; knR = 0.7 + Math.cos(t * 13) * 0.4;
    lean = 0.1; twist = Math.sin(t * 9) * 0.3; nod = Math.sin(t * 10) * 0.3;
  } else if (st === S_DOWN) {
    aL = 0.3; aR = 0.2; bL = 0.9; bR = 0.8; eL = 0.3; eR = 0.4; thL = 0.15; thR = -0.1; knL = 0.3; knR = 0.5;
    lean = 0; twist = 0; nod = Math.sin(t * 3) * 0.2;
  } else if (st === S_DEAD) {
    // (dead units are rendered from ragdoll joints; this is only used for their first frame)
    lean = 0; twist = 0;
  } else if ((u.flags[i] & F_ROUT) || (mask & B_FEAR)) {
    // panic run: arms up, flailing
    aL = 2.8 + Math.sin(ph * 2) * 0.4; aR = 2.8 + Math.cos(ph * 2) * 0.4; bL = bR = 0.45;
    eL = eR = 0.3; lean = 0.25; nod = -0.2;
  } else if (mask & B_DISABLED) {
    aL = idleAL; aR = idleAR;
    if (mask & B_STUN) { twist = Math.sin(t * 5) * 0.25; nod = 0.35 + Math.sin(t * 4) * 0.15; lean = 0.15; aL = aR = 0.15; bL = bR = 0.3; }
  } else if (mask & B_CHARM) {
    aL = 1.2; aR = 1.2; bL = bR = -0.25; eL = eR = 1.6; nod = -0.25 + Math.sin(t * 2) * 0.1; twist = Math.sin(t * 1.5) * 0.2;
  } else if (poseGlobals.cheerTeam >= 0 && u.side[i] === poseGlobals.cheerTeam && st !== S_ATTACK) {
    const hop = Math.abs(Math.sin(t * 7 + sd * 3));
    aL = 2.8 + hop * 0.2; aR = 2.9 - hop * 0.2; bL = bR = 0.35; eL = eR = 0.2; crouch = -hop * 0.12; nod = -0.25;
  } else if (k < 0.05) { aL = idleAL; aR = idleAR; }

  // ── casting stance
  if (st === S_CAST && !(mask & B_DISABLED)) {
    const w = Math.sin(t * 20) * 0.05;
    aL = 1.9 + w; aR = 2.0 - w; bL = bR = 0.25; eL = eR = 0.25; lean += 0.05; nod = -0.1;
    if (wMode === 2) wAngle = 0.4;
  }
  if (st === S_DASH) { aL = -0.9; aR = -0.9; bL = bR = 0.3; lean = 0.6; thL = -0.6; thR = 0.7; knL = 1.2; knR = 0.3; }

  // ── attack overlay
  const p = u.atkPh[i];
  if (p >= 0 && st !== S_AIR && st !== S_DOWN && st !== S_DEAD && !(mask & B_DISABLED)) {
    if (style === AS_SWING) {
      if (p < 0.45) { const q = e01(p / 0.45); aR = aR + (3.05 - aR) * q; eR = eR + (0.95 - eR) * q; twist += -0.4 * q; lean -= 0.08 * q; }
      else if (p < 0.6) { const q = (p - 0.45) / 0.15; aR = 3.05 - 2.55 * q; eR = 0.95 - 0.85 * q; twist += -0.4 + 0.85 * q; lean += 0.28 * q; fwdOff = 0.1 * q; }
      else { const q = e01((p - 0.6) / 0.4); aR = 0.5 + (aR - 0.5) * q; eR = 0.1 + (eR - 0.1) * q; twist += 0.45 * (1 - q); lean += 0.28 * (1 - q); fwdOff = 0.1 * (1 - q); }
      aL = Math.max(aL, 0.5 * Math.sin(p * Math.PI)); bL = 0.35;
    } else if (style === AS_THRUST) {
      if (p < 0.5) { const q = e01(p / 0.5); aR = 1.15; eR = 0.2 + 1.2 * q; twist -= 0.3 * q; }
      else if (p < 0.62) { const q = (p - 0.5) / 0.12; aR = 1.15 + 0.4 * q; eR = 1.4 * (1 - q); twist += -0.3 + 0.7 * q; lean += 0.3 * q; fwdOff = 0.22 * q; }
      else { const q = e01((p - 0.62) / 0.38); aR = 1.55 - 0.5 * q; eR = 0.2 * q; twist += 0.4 * (1 - q); lean += 0.3 * (1 - q); fwdOff = 0.22 * (1 - q); }
      aL = 1.1; eL = 0.9; bL = 0.25;
    } else if (style === AS_BOW) {
      aL = 1.5; eL = 0; bL = 0.05; aR = 1.45; bR = 0.12;
      if (p < 0.7) { const q = e01(p / 0.7); eR = -2.95 * q; twist -= 0.55 * q; }
      else { const q = (p - 0.7) / 0.3; eR = -2.95 + 2.2 * e01(q * 3); twist -= 0.55 * (1 - q); }
    } else if (style === AS_GUN) {
      aL = 1.45; aR = 1.5; eL = -0.15; eR = 0; bL = 0.35; bR = 0.05;
      if (p > 0.5 && p < 0.7) { const q = 1 - (p - 0.5) / 0.2; aR += 0.45 * q; aL += 0.35 * q; lean -= 0.2 * q; }
    } else if (style === AS_CAST) {
      if (p < 0.5) { const q = e01(p / 0.5); aL = aL + (2.4 - aL) * q; aR = aR + (2.5 - aR) * q; eL = eR = 0.35 * q; bL = bR = 0.35; }
      else if (p < 0.62) { const q = (p - 0.5) / 0.12; aL = 2.4 - 0.9 * q; aR = 2.5 - 1.0 * q; eL = eR = 0.35 - 0.35 * q; lean += 0.2 * q; }
      else { const q = e01((p - 0.62) / 0.38); aL = 1.5 - 1.3 * q; aR = 1.5 - 1.3 * q; lean += 0.2 * (1 - q); }
      if (wMode === 2) wAngle = 0.4;
    } else if (style === AS_PUNCH) {
      const left = (Math.floor(u.walkPh[i] * 0.3 + sd * 4) & 1) === 1;
      let a = 1.0, e = 2.0, tw = -0.35;
      if (p < 0.4) { const q = e01(p / 0.4); a = 1.0; e = 0.4 + 1.6 * q; tw = -0.35 * q; }
      else if (p < 0.55) { const q = (p - 0.4) / 0.15; a = 1.0 + 0.55 * q; e = 2.0 * (1 - q); tw = -0.35 + 0.8 * q; lean += 0.25 * q; fwdOff = 0.12 * q; }
      else { const q = e01((p - 0.55) / 0.45); a = 1.55 - 0.9 * q; e = 0.9 * q; tw = 0.45 * (1 - q); lean += 0.25 * (1 - q); fwdOff = 0.12 * (1 - q); }
      if (left) { aL = a; eL = e; twist -= tw; aR = 1.0; eR = 1.8; } else { aR = a; eR = e; twist += tw; aL = 1.0; eL = 1.8; }
      bL = bR = 0.15;
    } else if (style === AS_THROW) {
      if (p < 0.5) { const q = e01(p / 0.5); aR = aR + (3.4 - aR) * q; eR = 1.1 * q; twist -= 0.5 * q; lean -= 0.1 * q; }
      else if (p < 0.62) { const q = (p - 0.5) / 0.12; aR = 3.4 - 2.3 * q; eR = 1.1 - 1.0 * q; twist += -0.5 + 0.9 * q; lean += 0.3 * q; }
      else { const q = e01((p - 0.62) / 0.38); aR = 1.1 - 1.0 * q; eR = 0.1; twist += 0.4 * (1 - q); lean += 0.3 * (1 - q); }
      aL = 0.9 * Math.sin(p * Math.PI) + 0.1; bL = 0.4;
    }
  }

  // ── legs & pelvis height (feet on the ground)
  const thigh = d.thigh, shin = d.shin;
  const extL = thigh * Math.cos(thL) + shin * Math.cos(thL - knL);
  const extR = thigh * Math.cos(thR) + shin * Math.cos(thR - knR);
  const pelvisH = Math.max(extL, extR) * 0.99 - crouch;

  // local → world helper values
  const S = s;
  // pelvis
  const pX = bx + (Ux * pelvisH + Fx * fwdOff) * S;
  const pY = by + (Uy * pelvisH + Fy * fwdOff) * S;
  const pZ = bz + (Uz * pelvisH + Fz * fwdOff) * S;
  J[o + 6] = pX; J[o + 7] = pY; J[o + 8] = pZ;

  // hips, knees, feet (root frame)
  const hw = d.hipW * S;
  for (let side = -1; side <= 1; side += 2) {
    const th = side < 0 ? thL : thR, kn = side < 0 ? knL : knR;
    const hx = pX + Rx * hw * side, hy = pY + Ry * hw * side, hz = pZ + Rz * hw * side;
    const ct = Math.cos(th), stt = Math.sin(th);
    const kx = hx + (-Ux * ct + Fx * stt) * thigh * S, ky = hy + (-Uy * ct + Fy * stt) * thigh * S, kz = hz + (-Uz * ct + Fz * stt) * thigh * S;
    const c2 = Math.cos(th - kn), s2 = Math.sin(th - kn);
    const fx = kx + (-Ux * c2 + Fx * s2) * shin * S, fy = ky + (-Uy * c2 + Fy * s2) * shin * S, fz = kz + (-Uz * c2 + Fz * s2) * shin * S;
    const jh = side < 0 ? 9 : 10, jk = side < 0 ? 11 : 12, jf = side < 0 ? 13 : 14;
    J[o + jh * 3] = hx; J[o + jh * 3 + 1] = hy; J[o + jh * 3 + 2] = hz;
    J[o + jk * 3] = kx; J[o + jk * 3 + 1] = ky; J[o + jk * 3 + 2] = kz;
    J[o + jf * 3] = fx; J[o + jf * 3 + 1] = fy; J[o + jf * 3 + 2] = fz;
  }

  // torso frame: twist about U, then lean about the twisted right axis
  const ct = Math.cos(twist), stw = Math.sin(twist);
  let tFx = Fx * ct + Rx * stw, tFy = Fy * ct + Ry * stw, tFz = Fz * ct + Rz * stw;
  const tRx = Rx * ct - Fx * stw, tRy = Ry * ct - Fy * stw, tRz = Rz * ct - Fz * stw;
  const cl = Math.cos(lean), sl = Math.sin(lean);
  const tUx = Ux * cl + tFx * sl, tUy = Uy * cl + tFy * sl, tUz = Uz * cl + tFz * sl;
  const nFx = tFx * cl - Ux * sl, nFy = tFy * cl - Uy * sl, nFz = tFz * cl - Uz * sl;
  tFx = nFx; tFy = nFy; tFz = nFz;
  TF[0] = tFx; TF[1] = tFy; TF[2] = tFz; TF[3] = tUx; TF[4] = tUy; TF[5] = tUz; TF[6] = tRx; TF[7] = tRy; TF[8] = tRz;

  const tl = d.torsoLen * S;
  const nX = pX + tUx * tl, nY = pY + tUy * tl, nZ = pZ + tUz * tl;
  J[o + 3] = nX; J[o + 4] = nY; J[o + 5] = nZ;

  // head
  const cn = Math.cos(nod), sn = Math.sin(nod);
  const huX = tUx * cn + tFx * sn, huY = tUy * cn + tFy * sn, huZ = tUz * cn + tFz * sn;
  HEAD[0] = huX; HEAD[1] = huY; HEAD[2] = huZ;
  HEAD[3] = tFx * cn - tUx * sn; HEAD[4] = tFy * cn - tUy * sn; HEAD[5] = tFz * cn - tUz * sn;
  const hr = d.headR * S;
  J[o] = nX + huX * hr * 1.02; J[o + 1] = nY + huY * hr * 1.02; J[o + 2] = nZ + huZ * hr * 1.02;

  // shoulders, elbows, hands (torso frame)
  const shH = tl * 0.86, sw = d.shoulderW * S, ua = d.upperArm * S, fa = d.foreArm * S;
  for (let side = -1; side <= 1; side += 2) {
    const a = side < 0 ? aL : aR, b = side < 0 ? bL : bR, e = side < 0 ? eL : eR;
    const sx = pX + tUx * shH + tRx * sw * side, sy = pY + tUy * shH + tRy * sw * side, sz = pZ + tUz * shH + tRz * sw * side;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b) * side;
    let dx = (-tUx * ca + tFx * sa) * cb + tRx * sb, dy = (-tUy * ca + tFy * sa) * cb + tRy * sb, dz = (-tUz * ca + tFz * sa) * cb + tRz * sb;
    const ex = sx + dx * ua, ey = sy + dy * ua, ez = sz + dz * ua;
    const c2 = Math.cos(a + e), s2 = Math.sin(a + e), cb2 = Math.cos(b * 0.7), sb2 = Math.sin(b * 0.7) * side;
    dx = (-tUx * c2 + tFx * s2) * cb2 + tRx * sb2; dy = (-tUy * c2 + tFy * s2) * cb2 + tRy * sb2; dz = (-tUz * c2 + tFz * s2) * cb2 + tRz * sb2;
    const hx = ex + dx * fa, hy = ey + dy * fa, hz = ez + dz * fa;
    const js = side < 0 ? 3 : 4, je = side < 0 ? 5 : 6, jh = side < 0 ? 7 : 8;
    J[o + js * 3] = sx; J[o + js * 3 + 1] = sy; J[o + js * 3 + 2] = sz;
    J[o + je * 3] = ex; J[o + je * 3 + 1] = ey; J[o + je * 3 + 2] = ez;
    J[o + jh * 3] = hx; J[o + jh * 3 + 1] = hy; J[o + jh * 3 + 2] = hz;
    if (side > 0) {
      // weapon direction
      if (wMode === 0) {
        const w = a + e + wAngle;
        WEP[0] = -tUx * Math.cos(w) + tFx * Math.sin(w); WEP[1] = -tUy * Math.cos(w) + tFy * Math.sin(w); WEP[2] = -tUz * Math.cos(w) + tFz * Math.sin(w);
        WEP[3] = tRx; WEP[4] = tRy; WEP[5] = tRz;
      } else if (wMode === 1) {
        WEP[0] = tFx * 0.99 - tUx * 0.1; WEP[1] = tFy * 0.99 - tUy * 0.1; WEP[2] = tFz * 0.99 - tUz * 0.1;
        WEP[3] = tRx; WEP[4] = tRy; WEP[5] = tRz;
      } else if (wMode === 2) {
        const w = st === S_CAST || p >= 0 ? wAngle : 0.12;
        WEP[0] = tUx * Math.cos(w) + tFx * Math.sin(w); WEP[1] = tUy * Math.cos(w) + tFy * Math.sin(w); WEP[2] = tUz * Math.cos(w) + tFz * Math.sin(w);
        WEP[3] = tFx; WEP[4] = tFy; WEP[5] = tFz;
      } else {
        WEP[0] = tUx; WEP[1] = tUy; WEP[2] = tUz; WEP[3] = tFx; WEP[4] = tFy; WEP[5] = tFz;
      }
    }
  }
}

/** Seeds the Verlet previous positions from current joints minus velocity (inherits knockback). */
export function seedRagdollPrev(u: Units, i: number, dt: number): void {
  const o = i * NJ * 3, J = u.J, JP = u.JP;
  const vx = u.vx[i] * dt, vy = u.vy[i] * dt, vz = u.vz[i] * dt;
  const spin = (u.spinP[i] + u.spinR[i]) * dt * 0.35;
  for (let j = 0; j < NJ; j++) {
    const q = o + j * 3;
    // a little rotational scramble so bodies tumble instead of sliding stiffly
    const wob = ((j * 37 + i * 11) % 7 - 3) * 0.004 + spin * (j < 5 ? 1 : -0.6);
    JP[q] = J[q] - vx + wob; JP[q + 1] = J[q + 1] - vy; JP[q + 2] = J[q + 2] - vz - wob;
  }
}
