/**
 * Deterministic 2D noise for world geography (terrain, coasts, biome patterns).
 * Fixed permutation so the map shape is identical every cycle (what changes per cycle is relics, weaknesses, parties).
 */

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRAD: ReadonlyArray<[number, number]> = [
  [1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1],
  [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7],
];

function buildPerm(seed: number): Uint8Array {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = seed >>> 0 || 1;
  for (let i = 255; i > 0; i--) {
    s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    const j = s % (i + 1);
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  const out = new Uint8Array(512);
  for (let i = 0; i < 512; i++) out[i] = p[i & 255];
  return out;
}

const PERM = buildPerm(0x1e5a5);

/** Simplex noise in [-1, 1]. */
export function simplex(x: number, y: number): number {
  const s = (x + y) * F2;
  const i = Math.floor(x + s), j = Math.floor(y + s);
  const t = (i + j) * G2;
  const x0 = x - (i - t), y0 = y - (j - t);
  const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
  const ii = i & 255, jj = j & 255;
  let n = 0;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 > 0) { const g = GRAD[PERM[ii + PERM[jj]] % 12]; t0 *= t0; n += t0 * t0 * (g[0] * x0 + g[1] * y0); }
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 > 0) { const g = GRAD[PERM[ii + i1 + PERM[jj + j1]] % 12]; t1 *= t1; n += t1 * t1 * (g[0] * x1 + g[1] * y1); }
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 > 0) { const g = GRAD[PERM[ii + 1 + PERM[jj + 1]] % 12]; t2 *= t2; n += t2 * t2 * (g[0] * x2 + g[1] * y2); }
  return 70 * n;
}

/** Fractal noise in ~[0, 1]. */
export function fbm(x: number, y: number, octaves = 4, lac = 2.03, gain = 0.5): number {
  let a = 0.5, f = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += a * simplex(x * f + o * 17.3, y * f - o * 9.1);
    norm += a; a *= gain; f *= lac;
  }
  return sum / norm * 0.5 + 0.5;
}

/** Ridged multifractal in ~[0, 1] (sharp mountain crests). */
export function ridged(x: number, y: number, octaves = 4): number {
  let a = 0.5, f = 1, sum = 0, norm = 0, prev = 1;
  for (let o = 0; o < octaves; o++) {
    let n = 1 - Math.abs(simplex(x * f + o * 31.7, y * f + o * 5.3));
    n *= n;
    sum += n * a * prev;
    norm += a;
    prev = n;
    a *= 0.5; f *= 2.07;
  }
  return sum / norm;
}

/** Cheap hash → [0,1) for scattering. */
export function hash2(x: number, y: number): number {
  let h = Math.imul((x | 0) ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul((y | 0) + 0x5bd1e995, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return ((h >>> 0) % 100000) / 100000;
}

export const smooth = (a: number, b: number, v: number): number => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
