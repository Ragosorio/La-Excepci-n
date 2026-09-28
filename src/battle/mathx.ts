/**
 * Allocation-free math helpers for the battle hot loops: value noise, unit frames, instance-matrix writers.
 * Matrices are column-major (three.js convention) written straight into Float32Arrays.
 */

export const TAU = Math.PI * 2;

// ───────────────────────────── noise ─────────────────────────────

function h2(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [-1, 1]. */
export function vnoise(x: number, z: number, seed = 0): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = h2(ix, iz, seed), b = h2(ix + 1, iz, seed), c = h2(ix, iz + 1, seed), d = h2(ix + 1, iz + 1, seed);
  return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1;
}

export function fbm(x: number, z: number, seed = 0, oct = 4): number {
  let s = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += vnoise(x * f, z * f, seed + i * 17) * amp; n += amp; amp *= 0.5; f *= 2.03; }
  return s / n;
}

/** Deterministic 0..1 hash of an integer (per-unit variation). */
export function hash1(n: number): number {
  let h = Math.imul(n | 0, 2654435761);
  h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth01 = (t: number) => { const k = t < 0 ? 0 : t > 1 ? 1 : t; return k * k * (3 - 2 * k); };

/** Shortest signed angle difference b - a in (-PI, PI]. */
export function angDiff(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return d;
}

/** Underdamped spring step (x, v stored in arrays at index i). f = Hz, z = damping ratio. */
export function springArr(x: Float32Array, v: Float32Array, i: number, goal: number, f: number, z: number, dt: number): void {
  const w = TAU * f;
  v[i] += (w * w * (goal - x[i]) - 2 * z * w * v[i]) * dt;
  x[i] += v[i] * dt;
}

// ───────────────────────────── frames ─────────────────────────────

/**
 * Unit frame from yaw (facing = (sin yaw, 0, cos yaw)), pitch (lean forward, +) and roll (lean right, +).
 * out = [Fx,Fy,Fz, Ux,Uy,Uz, Rx,Ry,Rz] where R = F × U (the character's own right hand side).
 */
export function frameFrom(out: Float32Array, yaw: number, pitch: number, roll: number): void {
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  // base
  let fx = sy, fy = 0, fz = cy;
  let ux = 0, uy = 1, uz = 0;
  let rx = -cy, ry = 0, rz = sy;
  if (pitch !== 0) {
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const nux = ux * cp + fx * sp, nuy = uy * cp + fy * sp, nuz = uz * cp + fz * sp;
    const nfx = fx * cp - ux * sp, nfy = fy * cp - uy * sp, nfz = fz * cp - uz * sp;
    ux = nux; uy = nuy; uz = nuz; fx = nfx; fy = nfy; fz = nfz;
  }
  if (roll !== 0) {
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const nux = ux * cr + rx * sr, nuy = uy * cr + ry * sr, nuz = uz * cr + rz * sr;
    const nrx = rx * cr - ux * sr, nry = ry * cr - uy * sr, nrz = rz * cr - uz * sr;
    ux = nux; uy = nuy; uz = nuz; rx = nrx; ry = nry; rz = nrz;
  }
  out[0] = fx; out[1] = fy; out[2] = fz; out[3] = ux; out[4] = uy; out[5] = uz; out[6] = rx; out[7] = ry; out[8] = rz;
}

// ───────────────────────────── matrix writers ─────────────────────────────

/**
 * Segment matrix: geometry's local Y axis (unit length, centered) spans A→B (+extend), X/Z are scaled by sx/sz.
 * Z is aligned to the reference vector (fx,fy,fz) projected perpendicular to the segment.
 */
export function writeSeg(m: Float32Array, o: number,
  ax: number, ay: number, az: number, bx: number, by: number, bz: number,
  fx: number, fy: number, fz: number, sx: number, sz: number, extend: number): void {
  let yx = bx - ax, yy = by - ay, yz = bz - az;
  const len = Math.sqrt(yx * yx + yy * yy + yz * yz) || 1e-6;
  yx /= len; yy /= len; yz /= len;
  const d = fx * yx + fy * yy + fz * yz;
  let zx = fx - yx * d, zy = fy - yy * d, zz = fz - yz * d;
  let zl = Math.sqrt(zx * zx + zy * zy + zz * zz);
  if (zl < 1e-4) {
    // reference parallel to the segment: use world X projected
    const e = yx; zx = 1 - yx * e; zy = -yy * e; zz = -yz * e;
    zl = Math.sqrt(zx * zx + zy * zy + zz * zz) || 1;
  }
  zx /= zl; zy /= zl; zz /= zl;
  const xx = yy * zz - yz * zy, xy = yz * zx - yx * zz, xz = yx * zy - yy * zx;
  const L = len + extend;
  m[o] = xx * sx; m[o + 1] = xy * sx; m[o + 2] = xz * sx; m[o + 3] = 0;
  m[o + 4] = yx * L; m[o + 5] = yy * L; m[o + 6] = yz * L; m[o + 7] = 0;
  m[o + 8] = zx * sz; m[o + 9] = zy * sz; m[o + 10] = zz * sz; m[o + 11] = 0;
  m[o + 12] = (ax + bx) * 0.5; m[o + 13] = (ay + by) * 0.5; m[o + 14] = (az + bz) * 0.5; m[o + 15] = 1;
}

/**
 * Basis matrix at P: local Y = (yx,yy,yz) (need not be normalized), local Z = reference (orthogonalized), scales sx/sy/sz.
 */
export function writeBasis(m: Float32Array, o: number, px: number, py: number, pz: number,
  yx: number, yy: number, yz: number, fx: number, fy: number, fz: number, sx: number, sy: number, sz: number): void {
  const yl = Math.sqrt(yx * yx + yy * yy + yz * yz) || 1e-6;
  yx /= yl; yy /= yl; yz /= yl;
  const d = fx * yx + fy * yy + fz * yz;
  let zx = fx - yx * d, zy = fy - yy * d, zz = fz - yz * d;
  let zl = Math.sqrt(zx * zx + zy * zy + zz * zz);
  if (zl < 1e-4) { zx = 0; zy = -yz; zz = yy; zl = Math.sqrt(zy * zy + zz * zz) || 1; }
  zx /= zl; zy /= zl; zz /= zl;
  const xx = yy * zz - yz * zy, xy = yz * zx - yx * zz, xz = yx * zy - yy * zx;
  m[o] = xx * sx; m[o + 1] = xy * sx; m[o + 2] = xz * sx; m[o + 3] = 0;
  m[o + 4] = yx * sy; m[o + 5] = yy * sy; m[o + 6] = yz * sy; m[o + 7] = 0;
  m[o + 8] = zx * sz; m[o + 9] = zy * sz; m[o + 10] = zz * sz; m[o + 11] = 0;
  m[o + 12] = px; m[o + 13] = py; m[o + 14] = pz; m[o + 15] = 1;
}

/** Flat ground-aligned matrix (decals, shadows, rings): yaw rotation + uniform XZ scale. */
export function writeFlat(m: Float32Array, o: number, px: number, py: number, pz: number, yaw: number, s: number, sy = 1): void {
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  m[o] = c * s; m[o + 1] = 0; m[o + 2] = -sn * s; m[o + 3] = 0;
  m[o + 4] = 0; m[o + 5] = sy; m[o + 6] = 0; m[o + 7] = 0;
  m[o + 8] = sn * s; m[o + 9] = 0; m[o + 10] = c * s; m[o + 11] = 0;
  m[o + 12] = px; m[o + 13] = py; m[o + 14] = pz; m[o + 15] = 1;
}

/** Yaw-only matrix with non-uniform scale (props, toads, ice blocks). */
export function writeYaw(m: Float32Array, o: number, px: number, py: number, pz: number, yaw: number, sx: number, sy: number, sz: number): void {
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  m[o] = c * sx; m[o + 1] = 0; m[o + 2] = -sn * sx; m[o + 3] = 0;
  m[o + 4] = 0; m[o + 5] = sy; m[o + 6] = 0; m[o + 7] = 0;
  m[o + 8] = sn * sz; m[o + 9] = 0; m[o + 10] = c * sz; m[o + 11] = 0;
  m[o + 12] = px; m[o + 13] = py; m[o + 14] = pz; m[o + 15] = 1;
}

/** Copies 16 floats. */
export function copy16(dst: Float32Array, o: number, src: Float32Array, so: number): void {
  for (let k = 0; k < 16; k++) dst[o + k] = src[so + k];
}

/** Scales the 3 basis columns of a matrix stored in src by f, writing to dst. */
export function copyScaled16(dst: Float32Array, o: number, src: Float32Array, so: number, f: number): void {
  for (let k = 0; k < 12; k++) dst[o + k] = (k & 3) === 3 ? 0 : src[so + k] * f;
  dst[o + 12] = src[so + 12]; dst[o + 13] = src[so + 13]; dst[o + 14] = src[so + 14]; dst[o + 15] = 1;
}

/** Projectile launch angle to hit (dx horizontal, dy vertical) at speed v. null = out of range. */
export function launchAngle(v: number, dx: number, dy: number, g: number, high: boolean): number | null {
  const v2 = v * v;
  const disc = v2 * v2 - g * (g * dx * dx + 2 * dy * v2);
  if (disc < 0 || dx < 1e-4) return null;
  return Math.atan((v2 + (high ? 1 : -1) * Math.sqrt(disc)) / (g * dx));
}

/** Parse '#rrggbb' into 0..1 floats (no THREE allocation). */
export function hexRgb(hex: string, out: Float32Array | number[], o = 0): void {
  let h = hex.charAt(0) === '#' ? hex.slice(1) : hex;
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16) || 0;
  out[o] = ((n >> 16) & 255) / 255; out[o + 1] = ((n >> 8) & 255) / 255; out[o + 2] = (n & 255) / 255;
}

/** sRGB hex → linear floats (instance colors are in linear space when ColorManagement is on). */
export function hexLinear(hex: string, out: Float32Array | number[], o = 0): void {
  hexRgb(hex, out, o);
  for (let k = 0; k < 3; k++) { const c = out[o + k]; out[o + k] = c <= 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4); }
}
