/**
 * World geography: a deterministic heightfield for the diorama map (+ continent ownership, land mask, lava glow).
 * Shared by the overworld renderer (terrain mesh, water, props) and the world simulation (boats, parties, pathing).
 *
 * Coordinates: overworld units (≈ meters on the diorama). +x east, +z south. Sea level y = 0.
 * The grid is built lazily on first use (≈ 40 ms) and cached for the whole session.
 */
import type { ContinentId, LocationDef } from '../../data/types';
import { CONTINENTS, LOCATION_LIST } from '../../data/world';
import { fbm, ridged, simplex, smooth } from './noise';

export const CONT_ORDER: ContinentId[] = ['valdoria', 'sylvaria', 'kharaz', 'morvenna', 'islas', 'concordia'];
export const CONT_INDEX: Record<ContinentId, number> = { valdoria: 0, sylvaria: 1, kharaz: 2, morvenna: 3, islas: 4, concordia: 5 };

export const MAP_MIN = -130;
export const MAP_MAX = 130;
export const MAP_SIZE = MAP_MAX - MAP_MIN;
/** Vertices per side (1 unit spacing). */
export const GRID_N = MAP_SIZE + 1;
export const SEA_FLOOR = -7;

interface Island { x: number; z: number; r: number; peak: number }
/** Islas de Azar: one island per location + islets. */
export const ISLANDS: Island[] = [
  { x: 6, z: 61, r: 12.5, peak: 6.5 },   // Puerto Fortuna (main, volcanic)
  { x: 22, z: 70, r: 5.2, peak: 0.8 },   // Arena del Remolino (low)
  { x: -14, z: 68, r: 9, peak: 4.5 },    // Cala de los Contrabandistas
  { x: -4, z: 83, r: 7, peak: 3.5 },     // Faro de las Sirenas
  { x: 27, z: 84, r: 6, peak: 2.2 },     // Bóveda de Tiburcio
  { x: 19, z: 54, r: 4.2, peak: 3 },
  { x: 35, z: 63, r: 4.6, peak: 3.8 },
  { x: -25, z: 56, r: 3.8, peak: 2.4 },
  { x: 12, z: 78, r: 3.2, peak: 1.6 },
  { x: -19, z: 86, r: 3.6, peak: 2.2 },
  { x: 40, z: 75, r: 3.2, peak: 2 },
  { x: -3, z: 47, r: 3, peak: 1.4 },
  { x: 45, z: 55, r: 2.6, peak: 1.6 },
];

export interface Geo {
  heights: Float32Array;   // GRID_N²
  conts: Uint8Array;       // continent index (nearest), CONT_ORDER
  mask: Float32Array;      // land mask 0..1 (coast ≈ 0.85)
  glow: Float32Array;      // lava intensity 0..1 (Kharaz)
  locHeight: Record<string, number>;
}

let geo: Geo | null = null;

interface Raw { h: number; c: number; m: number; glow: number }
const raw: Raw = { h: 0, c: 0, m: 0, glow: 0 };

/** Unflattened field (no location plateaus). Writes into the shared `raw` record. */
function rawField(x: number, z: number): Raw {
  const cn = fbm(x * 0.045, z * 0.045, 3) - 0.5;
  const cn2 = simplex(x * 0.13 + 7, z * 0.13 - 3) * 0.05;
  let bestM = 0, bestC = 0, bestD = 1e9;
  let islandIdx = -1, islandT = 0;
  for (let ci = 0; ci < 6; ci++) {
    const def = CONTINENTS[CONT_ORDER[ci]];
    let m = 0, dn = 0;
    if (ci === 4) {
      // archipelago: max over islands
      dn = 1e9;
      for (let k = 0; k < ISLANDS.length; k++) {
        const is = ISLANDS[k];
        const t = Math.hypot(x - is.x, z - is.z) / is.r;
        const d = t + cn * 0.55 + cn2 * 2;
        const mm = 1 - smooth(0.55, 1.15, d);
        if (mm > m) { m = mm; islandIdx = k; islandT = t; }
        if (d < dn) dn = d;
      }
      dn = Math.min(dn, Math.hypot(x - def.center.x, z - def.center.z) / def.radius + 0.4);
    } else {
      const d = Math.hypot(x - def.center.x, z - def.center.z) / def.radius;
      dn = d + cn * (ci === 5 ? 0.16 : 0.38) + cn2;
      m = ci === 5 ? 1 - smooth(0.8, 1.08, dn) : 1 - smooth(0.82, 1.1, dn);
    }
    if (m > bestM + 1e-6 || (bestM < 1e-6 && dn < bestD)) { if (m > bestM) bestM = m; bestC = ci; }
    if (dn < bestD) bestD = dn;
  }
  // guarantee land under every location (location islands/peninsulas)
  for (let i = 0; i < LOCATION_LIST.length; i++) {
    const l = LOCATION_LIST[i];
    const dx = x - l.pos.x, dz = z - l.pos.z;
    if (dx * dx + dz * dz > 64) continue;
    const bm = 1 - smooth(3.6, 7.5, Math.hypot(dx, dz));
    if (bm > bestM) { bestM = bm; bestC = CONT_INDEX[l.continent]; }
  }
  const M = bestM;
  let h = SEA_FLOOR + 8.2 * M;              // coast (h = 0) at M ≈ 0.854
  const k = smooth(0.86, 1.0, M);           // inland factor
  let glow = 0;
  if (k > 0) {
    switch (bestC) {
      case 0: { // Valdoria — golden rolling plains
        const f = fbm(x * 0.03, z * 0.03, 4);
        h += k * (0.5 + 2.6 * f * f * 1.4 + simplex(x * 0.11, z * 0.11) * 0.18);
        break;
      }
      case 1: { // Sylvaria — forested hills
        const f = fbm(x * 0.036 + 5, z * 0.036, 4);
        h += k * (0.9 + 4.6 * Math.pow(f, 1.35));
        break;
      }
      case 2: { // Kharaz — ridged mountains + lava rivers
        const macro = 0.35 + 0.65 * smooth(0.22, 0.62, fbm(x * 0.021 + 11, z * 0.021 - 3, 3));
        const rid = ridged(x * 0.032, z * 0.032, 5);
        let r = 1.6 + 26 * macro * Math.pow(rid, 1.6) + 2.2 * fbm(x * 0.09, z * 0.09, 2);
        // the great peak above Kharaz-Dûm
        const pk = Math.hypot(x - 45, z - 72);
        r += 17 * Math.exp(-(pk * pk) / 60);
        const line = Math.abs(simplex(x * 0.034 + 3, z * 0.034 + 8));
        const lava = smooth(0.045, 0.012, line) * (1 - Math.min(1, (macro - 0.35) * 1.6)) * k;
        r -= lava * 1.6;
        glow = lava;
        h += k * r;
        break;
      }
      case 3: { // Morvenna — low swamp with pools
        const f = fbm(x * 0.042, z * 0.042, 3);
        const pools = smooth(0.57, 0.66, fbm(x * 0.085 + 20, z * 0.085 - 7, 3));
        h += k * (0.45 + 1.5 * f * f) - k * pools * 1.9;
        // a few crooked crags
        const crag = smooth(0.78, 0.9, fbm(x * 0.06 - 40, z * 0.06 + 13, 2));
        h += k * crag * 5.5;
        break;
      }
      case 4: { // Islas — volcanic islands with beaches
        if (islandIdx >= 0) {
          const is = ISLANDS[islandIdx];
          const t = Math.max(0, 1 - islandT);
          h += k * (0.35 + is.peak * Math.pow(t, 1.6) * (0.75 + 0.5 * fbm(x * 0.12, z * 0.12, 2)));
        } else h += k * 0.4;
        break;
      }
      default: { // Concordia — white marble plateau
        h += k * (1.3 + 0.25 * fbm(x * 0.2, z * 0.2, 2));
        break;
      }
    }
  }
  raw.h = h; raw.c = bestC; raw.m = M; raw.glow = glow;
  return raw;
}

function plateauFor(l: LocationDef, h: number): number {
  const cap = l.kind === 'fortaleza' ? 9 : l.continent === 'kharaz' ? 6.5 : 4.5;
  return Math.max(l.kind === 'arena' ? 0.7 : 1.0, Math.min(cap, h));
}

function build(): Geo {
  const N = GRID_N;
  const heights = new Float32Array(N * N);
  const conts = new Uint8Array(N * N);
  const mask = new Float32Array(N * N);
  const glow = new Float32Array(N * N);
  // location plateau targets from the raw field
  const targets = LOCATION_LIST.map((l) => plateauFor(l, rawField(l.pos.x, l.pos.z).h));
  const locHeight: Record<string, number> = {};
  LOCATION_LIST.forEach((l, i) => { locHeight[l.id] = targets[i]; });
  const crater = LOCATION_LIST.find((l) => l.id === 'crater');

  for (let j = 0; j < N; j++) {
    const z = MAP_MIN + j;
    for (let i = 0; i < N; i++) {
      const x = MAP_MIN + i;
      const r = rawField(x, z);
      let h = r.h;
      let g = r.glow;
      for (let li = 0; li < LOCATION_LIST.length; li++) {
        const l = LOCATION_LIST[li];
        const dx = x - l.pos.x, dz = z - l.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 56) continue;
        const w = 1 - smooth(3.3, 7.4, Math.sqrt(d2));
        h += (targets[li] - h) * w;
        g *= 1 - w;
      }
      if (crater) {
        const d = Math.hypot(x - crater.pos.x, z - crater.pos.z);
        if (d < 6) {
          const t = locHeight.crater;
          h -= 1.9 * (1 - smooth(0, 2.9, d)) * (t > 0 ? 1 : 0);
          h += 0.85 * Math.exp(-((d - 3.2) * (d - 3.2)) / 0.6);
        }
      }
      const idx = j * N + i;
      heights[idx] = h;
      conts[idx] = r.c;
      mask[idx] = r.m;
      glow[idx] = g;
    }
  }
  return { heights, conts, mask, glow, locHeight };
}

export function getGeo(): Geo {
  if (!geo) geo = build();
  return geo;
}

/** Bilinear terrain height (y). Outside the map → deep sea. */
export function heightAt(x: number, z: number): number {
  const g = getGeo();
  const fx = x - MAP_MIN, fz = z - MAP_MIN;
  if (fx < 0 || fz < 0 || fx >= MAP_SIZE || fz >= MAP_SIZE) return SEA_FLOOR;
  const i = Math.floor(fx), j = Math.floor(fz);
  const tx = fx - i, tz = fz - j;
  const N = GRID_N, H = g.heights;
  const a = H[j * N + i], b = H[j * N + i + 1], c = H[(j + 1) * N + i], d = H[(j + 1) * N + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

/** Ground or water surface height (never below 0). */
export function surfaceAt(x: number, z: number): number { return Math.max(0, heightAt(x, z)); }

export function isWater(x: number, z: number): boolean { return heightAt(x, z) < 0.08; }

/** Continent under (or nearest to) a point. */
export function continentAt(x: number, z: number): ContinentId {
  const g = getGeo();
  const i = Math.max(0, Math.min(GRID_N - 1, Math.round(x - MAP_MIN)));
  const j = Math.max(0, Math.min(GRID_N - 1, Math.round(z - MAP_MIN)));
  return CONT_ORDER[g.conts[j * GRID_N + i]] ?? 'concordia';
}

/** Land mask 0..1 (0 open sea, ≈0.85 coast, 1 inland). */
export function landMaskAt(x: number, z: number): number {
  const g = getGeo();
  const i = Math.max(0, Math.min(GRID_N - 1, Math.round(x - MAP_MIN)));
  const j = Math.max(0, Math.min(GRID_N - 1, Math.round(z - MAP_MIN)));
  return g.mask[j * GRID_N + i];
}

/** Terrain slope magnitude (rise/run) by central differences. */
export function slopeAt(x: number, z: number): number {
  const dx = heightAt(x + 1, z) - heightAt(x - 1, z);
  const dz = heightAt(x, z + 1) - heightAt(x, z - 1);
  return Math.hypot(dx, dz) * 0.5;
}

export function locationHeight(id: string): number { return getGeo().locHeight[id] ?? 1; }

/** Road network: each location links to its nearest 1–2 neighbours on the same continent (deterministic). */
export function roadSegments(): Array<[number, number, number, number]> {
  const segs: Array<[number, number, number, number]> = [];
  const seen = new Set<string>();
  for (const a of LOCATION_LIST) {
    if (a.continent === 'islas' || a.continent === 'concordia') continue;
    const others = LOCATION_LIST.filter((b) => b.continent === a.continent && b.id !== a.id)
      .map((b) => ({ b, d: Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z) }))
      .sort((p, q) => p.d - q.d)
      .slice(0, 2);
    for (const { b, d } of others) {
      if (d > 34) continue;
      const key = [a.id, b.id].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      segs.push([a.pos.x, a.pos.z, b.pos.x, b.pos.z]);
    }
  }
  return segs;
}

/** Distance from point to segment. */
export function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax, vz = bz - az;
  const l2 = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2));
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

/** Nearest location (optionally filtered) to a point. */
export function nearestLocation(x: number, z: number, filter?: (l: LocationDef) => boolean): { loc: LocationDef; d: number } | null {
  let best: LocationDef | null = null, bd = Infinity;
  for (const l of LOCATION_LIST) {
    if (filter && !filter(l)) continue;
    const d = Math.hypot(l.pos.x - x, l.pos.z - z);
    if (d < bd) { bd = d; best = l; }
  }
  return best ? { loc: best, d: bd } : null;
}
