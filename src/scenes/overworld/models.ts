/**
 * Procedural location models (toon primitives + outlines): castles, villages, forts, ruins, temples, the casino,
 * the arena, ports, the Concilio's five towers, the Colmenas, the crater… one recipe per place with continent styles.
 * All recipes build around (0,0,0) = location center on the ground, in map units (Elias ≈ 2.2 tall).
 */
import * as THREE from 'three';
import type { ContinentId, LocationDef } from '../../data/types';
import { Rng } from '../../core/rng';
import { ModelBuilder } from './modelKit';

export interface Style { wall: string; wall2: string; roof: string; roof2: string; wood: string; stone: string; trim: string; win: string; lamp: string }
export const STYLE: Record<ContinentId, Style> = {
  valdoria: { wall: '#efe4cf', wall2: '#d9ccb2', roof: '#b8413a', roof2: '#4a5f8a', wood: '#6a4a30', stone: '#b5ab98', trim: '#d9b36c', win: '#ffc86a', lamp: '#ffcf7a' },
  sylvaria: { wall: '#e9efdd', wall2: '#cfd9bf', roof: '#3f8a6a', roof2: '#6aa64a', wood: '#8a6a42', stone: '#c9cbb8', trim: '#ffd36b', win: '#fff0a0', lamp: '#fff2a8' },
  kharaz: { wall: '#6e625a', wall2: '#5a4f48', roof: '#3a3a44', roof2: '#4d4450', wood: '#5a4030', stone: '#7d7064', trim: '#c07a3a', win: '#ff9a3a', lamp: '#ff8a2a' },
  morvenna: { wall: '#5d5670', wall2: '#4a4458', roof: '#4a3a6a', roof2: '#2f2a44', wood: '#3f3230', stone: '#6a6478', trim: '#b48cff', win: '#b8ff9a', lamp: '#c79bff' },
  islas: { wall: '#f6efe0', wall2: '#ffd9b0', roof: '#e0673a', roof2: '#d9b36c', wood: '#8a5a32', stone: '#d8cbb0', trim: '#1fb5a8', win: '#ffd27a', lamp: '#ff7ad9' },
  concordia: { wall: '#f6f0e2', wall2: '#e8e0cc', roof: '#e8ecf5', roof2: '#d9b36c', wood: '#8a6a4a', stone: '#e0d8c4', trim: '#d9b36c', win: '#fff0c0', lamp: '#fff2c8' },
};
const ISLAND_COLORS = ['#ff6f61', '#ffd166', '#06d6a0', '#4fc3f7', '#f78fb3', '#f6efe0'];
const NEON = ['#ff4fa3', '#4fd8ff', '#ffe066', '#7dffb0'];

// ───────────────────────── building blocks ─────────────────────────

export function house(b: ModelBuilder, x: number, z: number, w: number, d: number, h: number, st: Style, rot = 0, opts: { roof?: string; wall?: string; pyramid?: boolean; chimney?: boolean } = {}): void {
  const s = b.sub(x, 0, z, rot);
  s.box(opts.wall ?? st.wall, [0, h / 2, 0], [w, h, d]);
  s.box(st.wood, [0, 0.06, 0], [w + 0.08, 0.12, d + 0.08]);
  if (opts.pyramid) s.roof(opts.roof ?? st.roof, [0, h, 0], w + 0.22, d + 0.22, h * 0.8);
  else s.gable(opts.roof ?? st.roof, [0, h, 0], w + 0.2, d + 0.24, h * 0.7);
  s.box('#3a2a24', [0, h * 0.28, d / 2 + 0.01], [0.22, h * 0.5, 0.04]);
  const nw = Math.max(1, Math.floor(w / 0.55));
  for (let i = 0; i < nw; i++) {
    const wx = -w / 2 + (i + 0.5) * (w / nw);
    if (Math.abs(wx) > 0.2) s.window([wx, h * 0.62, d / 2 + 0.02], 0, 0.14, 0.18, st.win);
    s.window([wx, h * 0.62, -d / 2 - 0.02], 0, 0.14, 0.18, st.win);
  }
  if (opts.chimney) s.box(st.stone, [w * 0.28, h + 0.45, -d * 0.15], [0.16, 0.6, 0.16]);
}

export function tower(b: ModelBuilder, x: number, z: number, r: number, h: number, st: Style, roof: string | null = st.roof, windows = 2): void {
  const s = b.sub(x, 0, z);
  s.cyl(st.stone, [0, 0, 0], r * 1.08, r * 1.15, 0.25, 10);
  s.cyl(st.wall2, [0, 0.2, 0], r, r * 1.04, h - 0.2, 10);
  if (roof) {
    s.cyl(st.stone, [0, h, 0], r * 1.18, r * 1.18, 0.14, 10);
    s.cone(roof, [0, h + 0.12, 0], r * 1.28, r * 2.4, 10);
  } else {
    s.cyl(st.stone, [0, h, 0], r * 1.15, r * 1.12, 0.2, 10);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; s.box(st.stone, [Math.cos(a) * r * 1.05, h + 0.3, Math.sin(a) * r * 1.05], [0.18, 0.2, 0.18], [0, -a, 0]); }
  }
  for (let i = 0; i < windows; i++) {
    const a = (i / windows) * Math.PI * 2 + 0.4;
    s.window([Math.sin(a) * (r + 0.02), h * (0.55 + (i % 2) * 0.2), Math.cos(a) * (r + 0.02)], a, 0.12, 0.2, st.win);
  }
}

export function wall(b: ModelBuilder, x1: number, z1: number, x2: number, z2: number, h: number, st: Style, thick = 0.35): void {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const rot = Math.atan2(dx, dz) - Math.PI / 2;
  const s = b.sub((x1 + x2) / 2, 0, (z1 + z2) / 2, rot);
  s.box(st.wall2, [0, h / 2, 0], [len, h, thick]);
  const n = Math.max(2, Math.floor(len / 0.42));
  for (let i = 0; i < n; i++) s.box(st.stone, [-len / 2 + (i + 0.5) * (len / n), h + 0.1, 0], [0.2, 0.2, thick + 0.04]);
}

function ring(b: ModelBuilder, r: number, n: number, h: number, st: Style, gate = true, roof: string | null = st.roof): void {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + Math.PI / n; pts.push([Math.sin(a) * r, Math.cos(a) * r]); }
  for (let i = 0; i < n; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n];
    const mid = Math.atan2((ax + bx) / 2, (az + bz) / 2);
    if (gate && Math.abs(mid) < Math.PI / n) {
      // gatehouse facing +z
      const gx = (ax + bx) / 2, gz = (az + bz) / 2;
      tower(b, gx - 0.75, gz, 0.42, h + 0.9, st, roof, 1);
      tower(b, gx + 0.75, gz, 0.42, h + 0.9, st, roof, 1);
      b.box(st.wall2, [gx, h + 0.35, gz], [1.2, 0.5, 0.45]);
      b.box('#2a1c16', [gx, 0.45, gz + 0.02], [0.62, 0.9, 0.48]);
      wall(b, ax, az, gx - 0.75, gz, h, st);
      wall(b, gx + 0.75, gz, bx, bz, h, st);
    } else wall(b, ax, az, bx, bz, h, st);
    tower(b, ax, az, 0.36, h + 0.55, st, roof, 1);
  }
}

function tree(b: ModelBuilder, x: number, z: number, s: number, leaf: string, trunk = '#6a4a30', kind: 'round' | 'pine' | 'palm' | 'dead' = 'round'): void {
  const t = b.sub(x, 0, z, 0, s);
  if (kind === 'pine') { t.cyl(trunk, [0, 0, 0], 0.07, 0.1, 0.5, 6); t.cone(leaf, [0, 0.35, 0], 0.5, 0.9, 7); t.cone(leaf, [0, 0.9, 0], 0.36, 0.7, 7); }
  else if (kind === 'palm') {
    t.cyl('#9a7a4a', [0, 0, 0], 0.06, 0.09, 1.5, 6, [0.12, 0, 0.08]);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; t.box(leaf, [Math.sin(a) * 0.35 + 0.1, 1.5, Math.cos(a) * 0.35 + 0.06], [0.14, 0.04, 0.8], [0.35, a, 0]); }
  } else if (kind === 'dead') {
    t.cyl('#3f3432', [0, 0, 0], 0.05, 0.1, 1.1, 5, [0.1, 0, -0.08]);
    t.box('#3f3432', [0.18, 0.8, 0], [0.4, 0.05, 0.05], [0, 0, 0.6]);
    t.box('#3f3432', [-0.14, 0.6, 0.05], [0.32, 0.05, 0.05], [0, 0.5, -0.7]);
  } else { t.cyl(trunk, [0, 0, 0], 0.07, 0.1, 0.55, 6); t.sphere(leaf, [0, 0.8, 0], [0.45, 0.4, 0.45]); t.sphere(leaf, [0.2, 0.62, 0.1], 0.28); }
}

// ───────────────────────── recipes ─────────────────────────

function capitalValdoria(b: ModelBuilder, st: Style, r: Rng, id: string): void {
  // Corona de Varn: white walls, crimson & slate roofs, keep + cathedral spire
  b.cyl(st.stone, [0, 0, 0], 4.6, 4.8, 0.2, 18);
  ring(b, 4.3, 8, 1.15, st);
  for (let i = 0; i < 9; i++) {
    const a = r.range(0, Math.PI * 2), d = r.range(1.9, 3.3);
    house(b, Math.sin(a) * d, Math.cos(a) * d, r.range(0.6, 0.9), r.range(0.55, 0.75), r.range(0.55, 0.8), st, a, { roof: r.chance(0.6) ? st.roof : st.roof2, chimney: r.chance(0.4) });
  }
  // keep
  const k = b.sub(-0.6, 0.2, -0.6);
  k.box(st.wall, [0, 1.3, 0], [1.7, 2.6, 1.5]);
  k.box(st.stone, [0, 2.7, 0], [1.9, 0.2, 1.7]);
  for (const [tx, tz] of [[-0.85, -0.75], [0.85, -0.75], [-0.85, 0.75], [0.85, 0.75]]) tower(k, tx, tz, 0.28, 3.2, st, st.roof2, 1);
  tower(k, 0, 0, 0.42, 4.4, st, st.roof, 3);
  k.flag([0, 5.4, 0], 0.9, `loc:${id}`, 1.4);
  for (let i = 0; i < 3; i++) { k.window([-0.5 + i * 0.5, 1.9, 0.76], 0, 0.14, 0.26, st.win); k.window([-0.5 + i * 0.5, 1.1, 0.76], 0, 0.14, 0.26, st.win); }
  // cathedral
  const c = b.sub(1.6, 0, 0.4, 0.3);
  c.box(st.wall, [0, 0.65, 0], [0.9, 1.3, 1.8]);
  c.gable(st.roof2, [0, 1.3, 0], 1.9, 1.0, 0.7, Math.PI / 2);
  tower(c, 0, 1.0, 0.3, 2.3, st, st.roof2, 1);
  c.glowBox('#ffb0e0', [0, 0.9, -0.92], [0.34, 0.5, 0.04]);
  b.light([0, 1.5, 4.45], st.lamp, 1.2); b.light([-1.2, 1.2, 4.2], st.lamp, 0.9); b.light([1.2, 1.2, 4.2], st.lamp, 0.9);
}

function lumen(b: ModelBuilder, st: Style, id: string): void {
  // a colossal tree-city
  const bark = '#7a5a3a', bark2 = '#5f4630';
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.cyl(bark2, [Math.sin(a) * 1.2, 0, Math.cos(a) * 1.2], 0.12, 0.45, 1.3, 7, [Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5]); }
  b.cyl(bark, [0, 0, 0], 0.95, 1.35, 3.2, 12);
  b.cyl(bark, [0, 3.2, 0], 0.7, 0.95, 3.4, 12);
  b.cyl(bark2, [0, 6.6, 0], 0.4, 0.7, 1.8, 10);
  const leaf = ['#6fb54a', '#8ac25a', '#b9c85a', '#e0c85a'];
  const blobs: Array<[number, number, number, number]> = [[0, 8.6, 0, 3.3], [2.5, 7.7, 0.6, 2.3], [-2.4, 7.9, -0.5, 2.4], [0.5, 7.5, 2.5, 2.2], [-0.6, 7.6, -2.5, 2.2], [1.2, 10.0, -0.8, 2.0], [-1.4, 9.7, 1.1, 1.8], [2.2, 8.4, -2.0, 1.6], [-2.2, 8.3, 2.0, 1.6]];
  blobs.forEach(([x, y, z, rr], i) => b.sphere(leaf[i % leaf.length], [x, y, z], [rr, rr * 0.78, rr]));
  // platforms & houses in the trunk
  for (let lvl = 0; lvl < 3; lvl++) {
    const y = 1.2 + lvl * 1.9, rr = 1.45 - lvl * 0.2;
    b.cyl(st.wood, [0, y, 0], rr + 0.4, rr + 0.4, 0.1, 14);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + lvl;
      const hx = Math.sin(a) * (rr + 0.15), hz = Math.cos(a) * (rr + 0.15);
      house(b.sub(0, y + 0.1, 0), hx, hz, 0.5, 0.42, 0.45, st, a, { roof: st.roof, pyramid: true });
      b.light([Math.sin(a + 0.5) * (rr + 0.5), y + 0.45, Math.cos(a + 0.5) * (rr + 0.5)], st.lamp, 0.8);
    }
  }
  for (let i = 0; i < 14; i++) { const a = i * 0.9, y = 7 + (i % 3) * 0.9; b.light([Math.sin(a) * 3.2, y, Math.cos(a) * 3.2], '#fff2a8', 0.8, 0.45); }
  b.flag([1.9, 0, 1.6], 2, `loc:${id}`, 1.1);
}

function kharazDum(b: ModelBuilder, st: Style, id: string): void {
  // gate carved into the mountain: facade, giant statues, forge chimneys
  b.box(st.wall2, [0, 1.9, -1.4], [5.2, 3.8, 1.6]);
  b.box(st.stone, [0, 3.95, -1.4], [5.6, 0.3, 1.8]);
  b.gable(st.wall, [0, 3.9, -1.2], 3.2, 1.2, 1.2);
  b.box('#241a16', [0, 1.1, -0.58], [1.5, 2.2, 0.1]);
  b.glowBox('#ff8a2a', [0, 0.9, -0.55], [1.1, 1.6, 0.06]);
  b.box(st.trim, [0, 2.35, -0.56], [1.8, 0.2, 0.08]);
  for (const sx of [-1.9, 1.9]) {
    const s = b.sub(sx, 0, -0.3);
    s.box(st.stone, [0, 0.3, 0], [0.9, 0.6, 0.9]);
    s.box('#8a7a6a', [0, 1.3, 0], [0.7, 1.4, 0.55]);
    s.sphere('#9a8a7a', [0, 2.3, 0.05], 0.36);
    s.box('#b8b0a8', [0, 2.0, 0.28], [0.5, 0.5, 0.12]);
    s.box('#6a6a72', [0.45, 1.5, 0.25], [0.14, 1.6, 0.14]);
    s.box('#8a8a92', [0.45, 2.35, 0.25], [0.5, 0.3, 0.3]);
  }
  for (const [cx, cz] of [[-2.1, -2.2], [2.2, -2.0], [0.9, -2.3]]) { b.cyl('#4a3f38', [cx, 3.6, cz], 0.22, 0.28, 1.5, 8); b.glowCyl('#ff7a2a', [cx, 5.08, cz], 0.18, 0.18, 0.08, 8); }
  for (let i = 0; i < 5; i++) { b.window([-2.2 + i * 1.1, 3.1, -0.58], 0, 0.2, 0.3, st.win); }
  house(b, -2.4, 1.2, 0.8, 0.7, 0.6, st, 0.3, { chimney: true });
  house(b, 2.5, 1.0, 0.9, 0.7, 0.6, st, -0.3, { chimney: true });
  b.light([-0.9, 0.5, 0.2], '#ff9a3a', 1.2); b.light([0.9, 0.5, 0.2], '#ff9a3a', 1.2);
  b.flag([-2.6, 3.8, -1.0], 1, `loc:${id}`, 1.2); b.flag([2.6, 3.8, -1.0], 1, `loc:${id}`, 1.2);
}

function altamira(b: ModelBuilder, st: Style, id: string): void {
  b.cyl(st.stone, [0, 0, 0], 3.6, 3.9, 0.3, 14);
  b.box(st.wall, [0, 0.3 + 0.8, 0], [2.6, 1.6, 1.8]);
  b.gable(st.roof, [0, 1.9, 0], 2.8, 2.0, 1.0);
  const spires: Array<[number, number, number, number, number]> = [[-1.8, -1.0, 0.45, 4.6, 0.1], [1.9, -0.9, 0.5, 5.4, -0.08], [0, -1.8, 0.55, 6.6, 0.04], [-1.2, 1.5, 0.35, 3.2, -0.12], [1.3, 1.6, 0.38, 3.8, 0.14]];
  for (const [x, z, rr, h, lean] of spires) {
    const s = b.sub(x, 0.3, z);
    s.cyl(st.wall2, [0, 0, 0], rr * 0.85, rr, h, 9, [lean, 0, lean * 0.5]);
    s.cone(st.roof, [lean * h * 0.9, h - 0.05, lean * h * 0.45], rr * 1.35, rr * 3, 9);
    for (let i = 0; i < 3; i++) s.window([Math.sin(i * 2.1) * (rr + 0.02), h * (0.35 + i * 0.18), Math.cos(i * 2.1) * (rr + 0.02)], i * 2.1, 0.12, 0.2, st.win);
  }
  // floating crystals + the great moon orb
  b.glowSphere('#e8e4ff', [0, 8.6, -1.8], 0.55);
  for (let i = 0; i < 6; i++) { const a = i * 1.05; b.crystal('#b48cff', [Math.sin(a) * 2.8, 3.2 + (i % 3) * 0.7, Math.cos(a) * 2.8], 0.14, 0.34, [0, a, 0.3]); }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.light([Math.sin(a) * 3.4, 0.6, Math.cos(a) * 3.4], '#c79bff', 0.8); }
  b.flag([0, 7.2, -1.8], 1.1, `loc:${id}`, 1.2);
}

function puertoFortuna(b: ModelBuilder, st: Style, r: Rng, id: string): void {
  // El Gran Casino "La Banca de las Mil Suertes" + harbor
  const c = b.sub(0, 0, -0.6);
  c.cyl('#e8d8b0', [0, 0, 0], 2.3, 2.4, 0.3, 16);
  c.box('#fff4e0', [0, 1.2, 0], [3.4, 1.8, 2.2]);
  c.box('#1f8a6a', [0, 2.15, 0], [3.6, 0.16, 2.4]);
  c.sphere('#e8c35a', [0, 2.3, 0], [1.2, 1.25, 1.2], true);
  c.cyl('#e8c35a', [0, 3.4, 0], 0.08, 0.12, 0.7, 6);
  c.glowSphere('#ffe066', [0, 4.15, 0], 0.18);
  for (const sx of [-1.4, 1.4]) { tower(c, sx, 1.0, 0.32, 2.6, st, '#1f8a6a', 2); }
  for (let i = 0; i < 6; i++) c.box('#fff4e0', [-1.25 + i * 0.5, 0.95, 1.18], [0.12, 1.3, 0.12]);
  c.glowBox('#ff4fa3', [0, 1.95, 1.13], [2.2, 0.16, 0.05]);
  for (let i = 0; i < 12; i++) { const a = (i / 11) * Math.PI - Math.PI / 2; c.light([Math.sin(a) * 2.0, 2.2 + Math.cos(a) * 0.4, 1.3], NEON[i % NEON.length], 0.75, 0.9); }
  // town houses in bright colors
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI * 0.95 + (i / 7) * Math.PI * 1.9, d = r.range(3.1, 4.0);
    house(b, Math.sin(a) * d, Math.cos(a) * d - 0.4, r.range(0.55, 0.8), r.range(0.5, 0.7), r.range(0.55, 0.85), st, a, { wall: ISLAND_COLORS[i % ISLAND_COLORS.length], roof: r.chance(0.5) ? st.roof : st.roof2 });
  }
  // docks & boats (south)
  b.box(st.wood, [0.3, 0.12, 3.6], [0.5, 0.12, 2.8]);
  b.box(st.wood, [-1.6, 0.12, 3.3], [0.4, 0.12, 2.2]);
  boat(b, 1.3, 4.6, 0.3, '#8a5a32', '#f6efe0');
  boat(b, -2.6, 4.2, -0.4, '#6a3a2a', '#ff6f61');
  for (let i = 0; i < 6; i++) b.light([-2.2 + i * 0.9, 0.9, 2.6], NEON[i % NEON.length], 0.6, 0.8);
  b.flag([0, 4.2, -0.6], 0.8, `loc:${id}`, 1.2);
}

export function boat(b: ModelBuilder, x: number, z: number, rot: number, hull: string, sail: string, big = 1): void {
  const s = b.sub(x, 0, z, rot, big);
  s.box(hull, [0, 0.12, 0], [0.55, 0.28, 1.4]);
  s.box(hull, [0, 0.18, 0.78], [0.36, 0.26, 0.3], [0, Math.PI / 4, 0]);
  s.box('#c9a878', [0, 0.28, 0], [0.45, 0.04, 1.2]);
  s.cyl('#5a4030', [0, 0.28, -0.05], 0.03, 0.04, 1.4, 5);
  s.box(sail, [0, 0.95, 0.05], [0.04, 0.9, 0.7]);
}

function arena(b: ModelBuilder, st: Style, id: string): void {
  // coliseum ring of arches over a whirlpool
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const s = b.sub(Math.sin(a) * 2.6, 0, Math.cos(a) * 2.6, a);
    s.box(st.wall2, [0, 0.95, 0], [0.9, 1.9, 0.45]);
    s.box('#3a2a24', [0, 0.55, 0.12], [0.44, 0.8, 0.3]);
    s.box(st.stone, [0, 2.0, 0], [0.98, 0.18, 0.5]);
    if (i % 2 === 0) s.window([0, 1.45, 0.24], 0, 0.22, 0.26, st.win);
    if (i % 4 === 0) s.light([0, 2.3, 0.2], NEON[(i / 4) % NEON.length], 0.8, 0.8);
  }
  b.cyl('#c8b88a', [0, 0, 0], 2.2, 2.2, 0.15, 20);
  b.flag([0, 2.1, 2.6], 1, `loc:${id}`, 1); b.flag([0, 2.1, -2.6], 1, `loc:${id}`, 1);
  b.flag([2.6, 2.1, 0], 1, `loc:${id}`, 1); b.flag([-2.6, 2.1, 0], 1, `loc:${id}`, 1);
}

function port(b: ModelBuilder, st: Style, r: Rng, id: string): void {
  // Cala de los Contrabandistas: shacks, docks, a pirate ship
  for (let i = 0; i < 6; i++) {
    const a = r.range(-2.4, 2.4), d = r.range(1.2, 2.6);
    house(b, Math.sin(a) * d, -Math.abs(Math.cos(a) * d) + 0.3, r.range(0.5, 0.75), r.range(0.45, 0.6), r.range(0.45, 0.65), st, a, { wall: r.pick(['#b8946a', '#9a7a58', '#c9a878']), roof: r.pick(['#6a3a2a', '#8a5a32', '#4a3a30']) });
  }
  b.box(st.wood, [0, 0.1, 2.4], [0.45, 0.12, 2.6]);
  b.box(st.wood, [1.2, 0.1, 3.3], [2.4, 0.12, 0.4]);
  for (let i = 0; i < 5; i++) b.cyl('#4a3020', [-0.2 + (i % 2) * 0.4, -0.6, 1.3 + i * 0.5], 0.05, 0.05, 0.8, 5);
  const ship = b.sub(2.3, 0, 4.3, 0.2, 1.6);
  ship.box('#3a2a24', [0, 0.18, 0], [0.8, 0.45, 2.2]);
  ship.box('#3a2a24', [0, 0.45, -0.9], [0.8, 0.35, 0.5]);
  ship.cyl('#4a3020', [0, 0.4, 0.1], 0.04, 0.05, 2.2, 5);
  ship.box('#2a2226', [0, 1.6, 0.12], [0.05, 1.1, 1.0]);
  ship.box('#1a1418', [0, 2.35, 0.1], [0.04, 0.3, 0.4]);
  ship.light([0, 0.8, -1.1], '#ffb347', 0.8);
  for (let i = 0; i < 4; i++) b.box('#6a4a2a', [-1.2 + i * 0.3, 0.2, 1.4], [0.22, 0.38, 0.22]);
  b.light([0, 0.8, 1.2], '#ffb347', 1); b.light([-1.6, 0.8, -0.4], '#ffb347', 0.8);
  b.flag([0.3, 0, 1.0], 1.6, `loc:${id}`, 1);
}

function concordia(b: ModelBuilder, st: Style, id: string): void {
  // the Concilio: round hall + dome + five white towers (one per continent)
  b.cyl(st.stone, [0, 0, 0], 4.2, 4.5, 0.3, 24);
  b.cyl(st.wall2, [0, 0.3, 0], 3.2, 3.3, 0.22, 24);
  b.cyl(st.wall, [0, 0.52, 0], 1.9, 2.0, 1.5, 20);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; b.cyl('#fffaf0', [Math.sin(a) * 2.15, 0.52, Math.cos(a) * 2.15], 0.1, 0.12, 1.45, 8); }
  b.cyl(st.stone, [0, 2.0, 0], 2.35, 2.35, 0.16, 24);
  b.sphere('#f0f2fa', [0, 2.1, 0], [1.75, 1.35, 1.75], true);
  b.cyl(st.trim, [0, 3.35, 0], 0.08, 0.14, 0.6, 8);
  b.glowSphere('#fff0c0', [0, 4.05, 0], 0.2);
  const conts = ['valdoria', 'sylvaria', 'kharaz', 'morvenna', 'islas'];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI;
    const x = Math.sin(a) * 3.3, z = Math.cos(a) * 3.3;
    const s = b.sub(x, 0.3, z);
    s.cyl(st.wall, [0, 0, 0], 0.36, 0.44, 4.6, 12);
    s.cyl(st.trim, [0, 4.6, 0], 0.46, 0.46, 0.12, 12);
    s.cone(st.roof, [0, 4.72, 0], 0.5, 1.2, 12);
    s.cone(st.trim, [0, 5.9, 0], 0.08, 0.5, 6);
    for (let k = 0; k < 3; k++) s.window([0, 1.4 + k * 1.1, 0.37], 0, 0.12, 0.3, st.win);
    s.flag([0.3, 3.2, 0], 1.4, `cont:${conts[i]}`, 1.1);
  }
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; b.light([Math.sin(a) * 4.1, 0.7, Math.cos(a) * 4.1], '#fff2c8', 0.8); }
  tree(b, -2.4, 3.2, 1, '#9fb87a', '#8a7050'); tree(b, 2.6, 3.1, 1, '#9fb87a', '#8a7050');
  void id;
}

function colmenas(b: ModelBuilder, st: Style, r: Rng, id: string): void {
  // hive towers: stacked tapering drums with honeycomb windows
  const spots: Array<[number, number, number]> = [[0, 0, 3.6], [-1.6, -0.6, 2.8], [1.5, -0.8, 3.1], [-0.9, 1.5, 2.4], [1.2, 1.4, 2.2], [-2.4, 1.0, 1.8]];
  for (const [x, z, h] of spots) {
    const s = b.sub(x, 0, z);
    const lv = Math.round(h / 0.6);
    for (let i = 0; i < lv; i++) {
      const rr = 0.62 - i * 0.045;
      s.cyl(i % 2 ? '#d9b36c' : '#c9a24c', [0, i * 0.6, 0], rr * 0.96, rr, 0.6, 12);
      for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + i * 0.6; s.window([Math.sin(a) * (rr - 0.01), i * 0.6 + 0.3, Math.cos(a) * (rr - 0.01)], a, 0.12, 0.13, '#ffcf6a'); }
    }
    s.sphere('#b8923c', [0, lv * 0.6, 0], [0.4, 0.3, 0.4]);
  }
  b.cyl(st.wood, [0.2, 0, 2.6], 0.05, 0.05, 0.6, 5);
  b.light([0.2, 0.7, 2.6], '#ffcf6a', 0.9);
  for (let i = 0; i < 4; i++) tree(b, r.range(-3.5, 3.5), r.range(-3.6, -2.6), r.range(0.9, 1.3), '#4f8a3a', '#6a4a30', 'pine');
  // the prologue log at the forest edge
  b.cyl('#6a4a30', [2.6, 0.18, 2.4], 0.18, 0.18, 1.1, 8, [0, 0.4, Math.PI / 2]);
  b.flag([-0.4, 0, 2.2], 1.4, `loc:${id}`, 0.9);
}

function crater(b: ModelBuilder): void {
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2, d = 3.4 + (i % 3) * 0.3;
    b.box(i % 2 ? '#3a3040' : '#2a2230', [Math.sin(a) * d, 0.25, Math.cos(a) * d], [0.6, 0.5 + (i % 3) * 0.2, 0.45], [0.3, a, 0.2]);
  }
  for (let i = 0; i < 6; i++) { const a = i * 1.1; b.crystal('#9b5cff', [Math.sin(a) * 1.6, -0.6, Math.cos(a) * 1.6], 0.14, 0.5 + (i % 2) * 0.2, [0.3, a, 0.4]); }
  // sanctuary obelisk with the eclipse
  b.box('#1a1024', [2.6, 0.9, -2.3], [0.4, 1.8, 0.4]);
  b.cyl('#1a1024', [2.6, 1.95, -2.1], 0.25, 0.25, 0.06, 16, [Math.PI / 2, 0, 0]);
  b.glowCyl('#c7a2ff', [2.6, 1.95, -2.16], 0.29, 0.29, 0.03, 16);
  b.light([0, -0.4, 0], '#9b5cff', 1.8, 1);
}

function villageGeneric(b: ModelBuilder, def: LocationDef, st: Style, r: Rng, id: string): void {
  const n = r.int(5, 7);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r.range(-0.2, 0.2), d = r.range(1.4, 2.6);
    house(b, Math.sin(a) * d, Math.cos(a) * d, r.range(0.6, 0.85), r.range(0.5, 0.7), r.range(0.5, 0.7), st, a + Math.PI, { roof: r.chance(0.7) ? st.roof : st.roof2, chimney: r.chance(0.4) });
  }
  b.cyl(st.stone, [0, 0, 0], 0.32, 0.34, 0.35, 10);
  b.cyl('#2a5a8a', [0, 0.3, 0], 0.26, 0.26, 0.04, 10);
  b.light([0.5, 0.7, 0.4], st.lamp, 0.9);
  b.flag([0.6, 0, -0.5], 1.5, `loc:${id}`, 0.9);
  void def;
}

function vadoTrigo(b: ModelBuilder, st: Style, r: Rng, id: string): void {
  villageGeneric(b, { id } as LocationDef, { ...st, roof: '#b86a3a' }, r, id);
  // windmill with spinning blades
  const m = b.sub(-2.4, 0, -1.6);
  m.cyl('#efe4cf', [0, 0, 0], 0.42, 0.62, 1.9, 10);
  m.cone('#8a4a2a', [0, 1.9, 0], 0.6, 0.7, 10);
  m.window([0, 1.2, 0.5], 0, 0.14, 0.2, st.win);
  const blades = new THREE.BufferGeometry();
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) parts.push(new THREE.BoxGeometry(0.16, 1.5, 0.03).translate(0, 0.8, 0).rotateZ((i / 4) * Math.PI * 2));
  parts.push(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 8).rotateX(Math.PI / 2));
  const merged = mergeParts(parts);
  m.spin(merged ?? blades, '#e9dcc0', [0, 1.75, 0.62], 'z', 1.4);
  // hay stacks
  for (let i = 0; i < 3; i++) b.cyl('#e0c060', [2.6 + i * 0.5, 0, -1.8 + i * 0.3], 0.24, 0.3, 0.4, 8);
}

function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  const norm = parts.map((p) => { const g = p.index ? p.toNonIndexed() : p; g.deleteAttribute('uv'); return g; });
  const out = mergeGeometriesSafe(norm);
  return out;
}
function mergeGeometriesSafe(list: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  // positions+normals only (spinners get colors in ModelBuilder.spin)
  let count = 0;
  for (const g of list) count += g.getAttribute('position').count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
  let o = 0;
  for (const g of list) {
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) { pos[(o + i) * 3] = p.getX(i); pos[(o + i) * 3 + 1] = p.getY(i); pos[(o + i) * 3 + 2] = p.getZ(i); nor[(o + i) * 3] = n.getX(i); nor[(o + i) * 3 + 1] = n.getY(i); nor[(o + i) * 3 + 2] = n.getZ(i); }
    o += p.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}

function fortress(b: ModelBuilder, st: Style, id: string, giant = false): void {
  const s = giant ? 1.35 : 1;
  const k = b.sub(0, 0, 0, 0, s);
  k.box(st.stone, [0, 0.12, 0], [5.4, 0.24, 5.4]);
  const c = 2.3;
  wall(k, -c, -c, c, -c, 1.4, st, 0.45); wall(k, c, -c, c, c, 1.4, st, 0.45); wall(k, -c, c, -c, -c, 1.4, st, 0.45);
  wall(k, -c, c, -0.6, c, 1.4, st, 0.45); wall(k, 0.6, c, c, c, 1.4, st, 0.45);
  for (const [x, z] of [[-c, -c], [c, -c], [-c, c], [c, c]]) {
    k.box(st.wall2, [x, 1.1, z], [1.0, 2.2, 1.0]);
    k.box(st.stone, [x, 2.3, z], [1.15, 0.22, 1.15]);
    for (const [mx, mz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) k.box(st.stone, [x + mx, 2.55, z + mz], [0.22, 0.28, 0.22]);
    k.window([x, 1.5, z + 0.52], 0, 0.14, 0.24, st.win);
  }
  k.box('#2a1c16', [0, 0.55, c + 0.02], [1.0, 1.1, 0.5]);
  k.box(st.wall2, [0, 1.75, c], [1.6, 0.7, 0.6]);
  // donjon
  k.box(st.wall, [0, 1.6, -0.3], [1.8, 3.2, 1.8]);
  k.box(st.stone, [0, 3.3, -0.3], [2.0, 0.22, 2.0]);
  k.roof(st.roof, [0, 3.4, -0.3], 1.6, 1.6, 1.1);
  for (let i = 0; i < 3; i++) k.window([-0.5 + i * 0.5, 2.3, 0.62], 0, 0.14, 0.26, st.win);
  k.flag([0, 4.5, -0.3], 0.9, `loc:${id}`, 1.3);
  k.flag([-c, 2.7, c], 0.8, `loc:${id}`, 0.9); k.flag([c, 2.7, c], 0.8, `loc:${id}`, 0.9);
  k.light([-0.7, 0.9, c + 0.3], st.lamp, 0.9); k.light([0.7, 0.9, c + 0.3], st.lamp, 0.9);
}

function escalon(b: ModelBuilder, st: Style, id: string): void {
  // stairs made for twelve-meter legs + a giant gate
  for (let i = 0; i < 6; i++) b.box(i % 2 ? st.stone : st.wall2, [0, 0.35 + i * 0.7, -i * 0.9 + 1.5], [3.4 - i * 0.2, 0.7, 1.2]);
  b.box(st.wall2, [-1.5, 3.2, -3.4], [0.8, 6.4, 0.8]);
  b.box(st.wall2, [1.5, 3.2, -3.4], [0.8, 6.4, 0.8]);
  b.box(st.stone, [0, 6.6, -3.4], [4.0, 0.7, 1.0]);
  b.box('#2a1c16', [0, 2.2, -3.5], [2.2, 4.4, 0.4]);
  b.light([-1.5, 6.5, -2.9], '#ff9a3a', 1.2); b.light([1.5, 6.5, -2.9], '#ff9a3a', 1.2);
  b.flag([-1.5, 6.4, -3.4], 1.4, `loc:${id}`, 1.4); b.flag([1.5, 6.4, -3.4], 1.4, `loc:${id}`, 1.4);
}

function ruin(b: ModelBuilder, st: Style, r: Rng, kind: 'columns' | 'mausoleo' | 'raiz' | 'mina' | 'pozo'): void {
  const moss = '#6a8a4a';
  if (kind === 'mausoleo') {
    b.box(st.stone, [0, 0.2, 0], [4.2, 0.4, 3.4]);
    b.box(st.stone, [0, 0.55, 0], [3.4, 0.3, 2.8]);
    b.box(st.wall, [0, 1.5, -0.3], [2.4, 1.6, 1.8]);
    b.sphere('#e9e2cf', [0, 2.3, -0.3], [1.0, 0.8, 1.0], true);
    for (let i = 0; i < 5; i++) b.cyl('#f0e8d4', [-1.2 + i * 0.6, 0.7, 0.8], 0.11, 0.13, 1.5, 8);
    b.box(st.stone, [0, 2.25, 0.8], [2.9, 0.18, 0.5]);
    b.cyl('#1a1024', [0, 1.3, 0.62], 0.35, 0.35, 0.05, 16, [Math.PI / 2, 0, 0]);
    b.glowCyl('#ffd36b', [0, 1.3, 0.6], 0.4, 0.4, 0.02, 16);
    b.box(st.stone, [1.9, 0.2, 1.6], [0.8, 0.4, 0.5], [0, 0.4, 0.2]);
    return;
  }
  if (kind === 'raiz') {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.cyl('#5f4630', [Math.sin(a) * 1.4, 0, Math.cos(a) * 1.4], 0.18, 0.4, 2.6, 7, [Math.cos(a) * 0.7, 0, -Math.sin(a) * 0.7]);
    }
    b.cyl('#1a1024', [0, 0.02, 0], 1.1, 1.1, 0.04, 16);
    b.glowCyl('#7fe3ff', [0, 0.04, 0], 0.7, 0.7, 0.03, 16);
    for (let i = 0; i < 4; i++) b.box('#8a8a7a', [r.range(-2.5, 2.5), 0.3, r.range(-2.5, 2.5)], [0.6, 0.6, 0.6], [0.3, r.range(0, 3), 0.2]);
    b.light([0, 0.4, 0], '#7fe3ff', 1.2, 0.6);
    return;
  }
  if (kind === 'mina') {
    b.sphere('#6a5a50', [0, 0, -1.2], [2.6, 1.9, 2.0]);
    b.box('#241a16', [0, 0.6, 0.6], [1.1, 1.2, 0.4]);
    b.box('#5a4030', [-0.6, 0.65, 0.72], [0.14, 1.3, 0.14]);
    b.box('#5a4030', [0.6, 0.65, 0.72], [0.14, 1.3, 0.14]);
    b.box('#5a4030', [0, 1.33, 0.72], [1.4, 0.14, 0.16]);
    b.crystal('#cfe8ff', [0.9, 2.0, -0.6], 0.35, 0.8, [0.3, 0.4, 0.2]);
    b.crystal('#bcd8ff', [-0.7, 1.7, -0.9], 0.25, 0.6, [-0.2, 1, 0.3]);
    for (let i = 0; i < 5; i++) b.box('#6a6a72', [0, 0.05, 1.2 + i * 0.4], [0.9, 0.05, 0.08]);
    b.box('#5a4030', [0.8, 0.25, 2.2], [0.5, 0.35, 0.7]);
    b.light([0, 0.9, 0.9], '#cfe8ff', 1.2, 0.5);
    return;
  }
  if (kind === 'pozo') {
    b.cyl(st.stone, [0, 0, 0], 0.9, 1.0, 0.6, 14);
    b.glowCyl('#dfe8ff', [0, 0.58, 0], 0.72, 0.72, 0.03, 14);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, hh = r.range(0.6, 2.2);
      b.cyl(i % 2 ? st.stone : st.wall2, [Math.sin(a) * 2.4, 0, Math.cos(a) * 2.4], 0.18, 0.2, hh, 8, [r.range(-0.1, 0.1), 0, r.range(-0.1, 0.1)]);
    }
    b.light([0, 0.9, 0], '#dfe8ff', 1.4, 0.7);
    return;
  }
  // generic broken colonnade
  b.box(st.stone, [0, 0.12, 0], [3.8, 0.24, 2.6]);
  for (let i = 0; i < 7; i++) {
    const x = -1.6 + (i % 4) * 1.05, z = i < 4 ? -0.9 : 0.9;
    const hh = r.chance(0.35) ? r.range(1.6, 2.1) : r.range(0.4, 1.2);
    b.cyl(r.chance(0.3) ? moss : st.wall2, [x, 0.24, z], 0.15, 0.17, hh, 8);
  }
  b.box(st.wall2, [-0.5, 2.3, -0.9], [2.6, 0.22, 0.45]);
  for (let i = 0; i < 4; i++) b.box(r.chance(0.4) ? moss : st.stone, [r.range(-2.4, 2.4), 0.25, r.range(-2, 2)], [0.5, 0.35, 0.35], [r.range(-0.3, 0.3), r.range(0, 3), r.range(-0.3, 0.3)]);
}

function temploAlba(b: ModelBuilder, _st: Style, id: string): void {
  for (let i = 0; i < 3; i++) b.cyl('#f4ecd8', [0, i * 0.22, 0], 3.2 - i * 0.35, 3.3 - i * 0.35, 0.22, 20);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; b.cyl('#fffaf0', [Math.sin(a) * 2.0, 0.66, Math.cos(a) * 2.0], 0.13, 0.15, 1.8, 8); }
  b.cyl('#f4ecd8', [0, 2.44, 0], 2.25, 2.25, 0.2, 20);
  b.sphere('#e8c35a', [0, 2.6, 0], [1.6, 1.2, 1.6], true);
  b.glowCyl('#ffd36b', [0, 4.2, 0], 0.55, 0.55, 0.06, 20);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.glowBox('#ffe8a0', [Math.sin(a) * 0.75, 4.25, Math.cos(a) * 0.75], [0.08, 0.04, 0.35], [0, a, 0]); }
  b.cyl('#b8923c', [0, 0.66, 0], 0.45, 0.5, 0.6, 10);
  b.glowBox('#fff2c8', [0, 1.35, 0], [0.12, 0.4, 0.06], [0, 0, 0.5]);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; b.light([Math.sin(a) * 3.0, 0.9, Math.cos(a) * 3.0], '#fff2a8', 0.9); }
  tree(b, -3.4, 1.4, 1.4, '#e0c85a'); tree(b, 3.3, -1.2, 1.3, '#d8b84a');
  b.flag([2.2, 0.66, 2.2], 1.8, `loc:${id}`, 1);
}

function forja(b: ModelBuilder, id: string): void {
  b.cyl('#3a302c', [0, 0, 0], 3.0, 3.3, 0.3, 14);
  b.cyl('#2a2020', [0, 0.3, 0], 1.3, 1.5, 0.5, 14);
  b.glowCyl('#ff7a2a', [0, 0.78, 0], 1.1, 1.1, 0.06, 14);
  // the giant anvil
  const a = b.sub(-1.9, 0.3, -0.6, 0.4);
  a.box('#4a4a52', [0, 0.35, 0], [0.8, 0.7, 0.6]);
  a.box('#5a5a64', [0, 0.85, 0], [1.6, 0.3, 0.7]);
  a.box('#5a5a64', [0.95, 0.9, 0], [0.5, 0.18, 0.4]);
  for (const [x, z] of [[1.8, -1.6], [1.6, 1.4], [-1.4, 1.8]]) { b.cyl('#4a3f38', [x, 0.3, z], 0.3, 0.38, 2.8, 8); b.glowCyl('#ff8a2a', [x, 3.1, z], 0.22, 0.22, 0.1, 8); }
  b.box('#5a4f48', [0, 1.4, -2.2], [2.4, 2.2, 0.8]);
  b.glowBox('#ff9a3a', [0, 1.0, -1.78], [0.9, 1.2, 0.05]);
  b.light([0, 1.3, 0], '#ff7a2a', 2.0, 1);
  b.flag([2.4, 0.3, -1.8], 1.8, `loc:${id}`, 1);
}

function tragapiedras(b: ModelBuilder, r: Rng, id: string): void {
  const hides = ['#8a6a4a', '#9a7a58', '#6a5a4a', '#a88a60'];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r.range(-0.2, 0.2), d = r.range(1.8, 2.8);
    b.cone(hides[i % hides.length], [Math.sin(a) * d, 0, Math.cos(a) * d], r.range(0.6, 0.85), r.range(1.1, 1.5), 7);
    b.cyl('#5a4030', [Math.sin(a) * d, 0.9, Math.cos(a) * d], 0.03, 0.03, 0.9, 4);
  }
  for (let i = 0; i < 7; i++) b.sphere(r.pick(['#8a8378', '#7a746a', '#9a948a']), [r.range(-3, 3), 0.2, r.range(-3, 3)], r.range(0.2, 0.45));
  b.cyl('#4a3a30', [0, 0, 0], 0.5, 0.55, 0.15, 10);
  b.glowCyl('#ff9a3a', [0, 0.12, 0], 0.32, 0.18, 0.4, 8);
  b.light([0, 0.6, 0], '#ff9a3a', 1.6, 0.8);
  b.flag([1.2, 0, 0.8], 1.6, `loc:${id}`, 1);
}

function aquelarre(b: ModelBuilder, st: Style, r: Rng, id: string): void {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3, d = r.range(1.7, 2.6);
    const s = b.sub(Math.sin(a) * d, 0, Math.cos(a) * d, a + Math.PI);
    // chicken legs
    s.cyl('#d9a04a', [-0.15, 0, 0], 0.03, 0.05, 0.7, 5, [0, 0, 0.2]); s.cyl('#d9a04a', [0.15, 0, 0], 0.03, 0.05, 0.7, 5, [0, 0, -0.2]);
    s.box('#4a3a30', [0, 0.95, 0], [0.7, 0.55, 0.6], [0, 0, 0.08]);
    s.cone(st.roof, [0, 1.22, 0], 0.55, 1.1, 6, [0.15, 0, 0.12]);
    s.window([0, 0.95, 0.31], 0, 0.14, 0.16, '#b8ff9a');
  }
  b.sphere('#2a2226', [0, 0.35, 0], [0.55, 0.4, 0.55]);
  b.glowCyl('#7dff9a', [0, 0.62, 0], 0.42, 0.42, 0.04, 12);
  b.light([0, 0.9, 0], '#7dff9a', 1.4, 0.8);
  b.flag([0.9, 0, -0.9], 1.4, `loc:${id}`, 0.9);
}

function cienaga(b: ModelBuilder, st: Style, r: Rng, id: string): void {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, d = r.range(1.4, 2.6);
    const s = b.sub(Math.sin(a) * d, 0, Math.cos(a) * d, a);
    for (const [px, pz] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]]) s.cyl('#3f3230', [px, -0.3, pz], 0.04, 0.05, 1.0, 5);
    s.box(st.wood, [0, 0.72, 0], [0.8, 0.08, 0.7]);
    s.box('#5a4a3a', [0, 1.0, 0], [0.6, 0.5, 0.5]);
    s.roof('#6a7a4a', [0, 1.25, 0], 0.8, 0.7, 0.55);
    s.window([0, 1.0, 0.26], 0, 0.12, 0.14, st.win);
  }
  for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.5; b.cyl('#6a4a3a', [Math.sin(a) * 0.9, 0, Math.cos(a) * 0.9], 0.08, 0.1, 1.5, 6); b.sphere('#4fa3a0', [Math.sin(a) * 0.9, 1.6, Math.cos(a) * 0.9], 0.16); }
  b.light([0, 0.8, 0], '#b8ff9a', 1, 0.5);
  b.flag([0, 0, -0.6], 1.6, `loc:${id}`, 0.9);
}

function torreInvertida(b: ModelBuilder, st: Style, id: string): void {
  b.cyl(st.stone, [0, 0, 0], 2.4, 2.6, 0.3, 14);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; b.cyl(st.wall2, [Math.sin(a) * 1.9, 0.3, Math.cos(a) * 1.9], 0.18, 0.22, 1.3, 8); }
  // the tower hangs upside down, tip pointing to the ground
  const t = b.sub(0, 2.2, 0);
  t.cone(st.roof, [0, 0, 0], 1.3, 1.5, 10, [Math.PI, 0, 0]);
  t.cyl(st.wall, [0, 0, 0], 1.1, 0.95, 2.8, 10);
  t.cyl(st.stone, [0, 2.8, 0], 1.25, 1.25, 0.2, 10);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; t.box(st.stone, [Math.sin(a) * 1.15, 3.1, Math.cos(a) * 1.15], [0.2, 0.3, 0.2], [0, -a, 0]); }
  for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.3; t.window([Math.sin(a) * 1.04, 1.2 + (i % 2) * 0.8, Math.cos(a) * 1.04], a, 0.14, 0.22, '#c79bff'); }
  for (let i = 0; i < 5; i++) t.glowBox('#b48cff', [Math.sin(i * 1.3) * 0.6, -0.6 - i * 0.1, Math.cos(i * 1.3) * 0.6], [0.05, 0.3, 0.05]);
  b.light([0, 0.8, 0], '#b48cff', 1.6, 0.9);
  t.flag([0, 3.2, 0], 1, `loc:${id}`, 1.1);
}

function callejones(b: ModelBuilder, st: Style, r: Rng, id: string): void {
  const dark = { ...st, wall: '#8a7a6a', wall2: '#6a5e54', roof: '#4a3a3a', roof2: '#5a4040' };
  for (let gx = -2; gx <= 2; gx++) for (let gz = -2; gz <= 2; gz++) {
    if ((gx === 0 && gz === 0) || r.chance(0.2)) continue;
    const hh = r.range(0.6, 1.3);
    house(b, gx * 1.05 + r.range(-0.1, 0.1), gz * 1.05 + r.range(-0.1, 0.1), r.range(0.7, 0.9), r.range(0.7, 0.9), hh, dark, r.pick([0, Math.PI / 2, Math.PI]), { chimney: r.chance(0.5), roof: r.chance(0.5) ? dark.roof : dark.roof2 });
  }
  // la Casa de las Sedas: silk house with rose lanterns
  house(b, 0, 0, 1.0, 0.9, 1.4, { ...st, wall: '#7a2a4a' }, 0, { roof: '#c0407a', pyramid: true });
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.light([Math.sin(a) * 0.8, 1.5, Math.cos(a) * 0.8], '#ff7ab0', 0.7, 0.4); }
  for (let i = 0; i < 5; i++) b.light([r.range(-2.4, 2.4), 0.8, r.range(-2.4, 2.4)], '#ffb347', 0.7);
  b.flag([2.3, 0, 2.3], 1.8, `loc:${id}`, 1);
}

function faro(b: ModelBuilder, st: Style, r: Rng, id: string): void {
  const s = b.sub(1.6, 0, -1.4);
  s.cyl('#8a8378', [0, 0, 0], 0.9, 1.1, 0.5, 10);
  for (let i = 0; i < 5; i++) s.cyl(i % 2 ? '#d84a3a' : '#f6efe0', [0, 0.5 + i * 0.75, 0], 0.5 - i * 0.04, 0.54 - i * 0.04, 0.75, 12);
  s.cyl('#3a3a44', [0, 4.25, 0], 0.46, 0.46, 0.12, 12);
  s.glowCyl('#fff2c8', [0, 4.37, 0], 0.32, 0.32, 0.5, 10);
  s.cone('#d84a3a', [0, 4.87, 0], 0.5, 0.5, 10);
  s.light([0, 4.6, 0], '#fff2c8', 3.2, 1);
  for (let i = 0; i < 5; i++) {
    const a = r.range(0.5, 5.5), d = r.range(1.6, 2.6);
    house(b, Math.sin(a) * d - 0.4, Math.cos(a) * d + 0.5, r.range(0.55, 0.75), r.range(0.45, 0.6), r.range(0.45, 0.6), st, a, { wall: r.pick(ISLAND_COLORS), roof: r.pick([st.roof, st.roof2]) });
  }
  b.flag([-1.2, 0, 1.2], 1.5, `loc:${id}`, 0.9);
}

function boveda(b: ModelBuilder, id: string): void {
  b.box('#5a5a64', [0, 1.4, -0.6], [4.4, 2.8, 3.0]);
  b.box('#6a6a74', [0, 2.95, -0.6], [4.7, 0.3, 3.3]);
  b.cyl('#d9b36c', [0, 1.4, 0.92], 1.25, 1.25, 0.25, 24, [Math.PI / 2, 0, 0]);
  b.cyl('#b8923c', [0, 1.4, 1.1], 0.95, 0.95, 0.12, 24, [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.box('#8a6a2a', [Math.sin(a) * 0.55, 1.4 + Math.cos(a) * 0.55, 1.2], [0.1, 0.4, 0.08], [0, 0, a]); }
  b.sphere('#e8c35a', [0, 1.4, 1.22], 0.18);
  // treasure piles & duende guard towers
  for (let i = 0; i < 5; i++) b.cyl('#ffd166', [-2.2 + i * 1.1, 0, 2.1], 0.22, 0.34, 0.25 + (i % 2) * 0.12, 8);
  for (const sx of [-2.6, 2.6]) { b.cyl('#6a6a74', [sx, 0, 0.9], 0.35, 0.4, 3.2, 8); b.cone('#1f8a6a', [sx, 3.2, 0.9], 0.5, 0.8, 8); b.light([sx, 2.8, 1.3], '#7dffb0', 1, 0.7); }
  b.glowBox('#ffe066', [0, 2.95, 0.95], [3.0, 0.12, 0.05]);
  b.flag([0, 3.1, -0.6], 1.2, `loc:${id}`, 1.2);
}

function claro(b: ModelBuilder, st: Style, r: Rng, id: string): void {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2, d = r.range(1.6, 2.6);
    const x = Math.sin(a) * d, z = Math.cos(a) * d;
    b.cyl('#7a5a3a', [x, 0, z], 0.22, 0.3, 2.2, 8);
    b.sphere('#5aa04a', [x, 2.6, z], [1.0, 0.8, 1.0]);
    b.cyl(st.wood, [x, 1.3, z], 0.62, 0.62, 0.08, 10);
    house(b.sub(0, 1.38, 0), x, z, 0.5, 0.45, 0.4, st, a, { roof: st.roof, pyramid: true });
    b.light([x + 0.5, 1.6, z], '#fff2a8', 0.7, 0.3);
  }
  for (let i = 0; i < 12; i++) b.light([r.range(-3, 3), r.range(0.5, 2.5), r.range(-3, 3)], '#d8ff7a', 0.45, 0.6);
  b.flag([0, 0, 0], 1.8, `loc:${id}`, 0.9);
}

/** Builds the model for a location into `b` (already positioned at the location). */
export function buildLocationModel(b: ModelBuilder, def: LocationDef): void {
  const st = STYLE[def.continent];
  const r = new Rng(`model:${def.id}`);
  switch (def.id) {
    case 'corona_varn': capitalValdoria(b, st, r, def.id); return;
    case 'lumen': lumen(b, st, def.id); return;
    case 'kharaz_dum': kharazDum(b, st, def.id); return;
    case 'altamira': altamira(b, st, def.id); return;
    case 'puerto_fortuna': puertoFortuna(b, st, r, def.id); return;
    case 'arena_remolino': arena(b, st, def.id); return;
    case 'cala_contrabandistas': port(b, st, r, def.id); return;
    case 'concordia': concordia(b, st, def.id); return;
    case 'aldea_colmenas': colmenas(b, st, r, def.id); return;
    case 'crater': crater(b); return;
    case 'vado_trigo': vadoTrigo(b, st, r, def.id); return;
    case 'fortaleza_juramento': fortress(b, st, def.id); return;
    case 'escalon_gigantes': escalon(b, st, def.id); return;
    case 'mausoleo_alba': ruin(b, st, r, 'mausoleo'); return;
    case 'raiz_profunda': ruin(b, st, r, 'raiz'); return;
    case 'mina_luna': ruin(b, st, r, 'mina'); return;
    case 'pozo_luna': ruin(b, st, r, 'pozo'); return;
    case 'templo_alba': temploAlba(b, st, def.id); return;
    case 'forja_primigenia': forja(b, def.id); return;
    case 'tragapiedras': tragapiedras(b, r, def.id); return;
    case 'aquelarre': aquelarre(b, st, r, def.id); return;
    case 'cienaga_trol': cienaga(b, st, r, def.id); return;
    case 'torre_invertida': torreInvertida(b, st, def.id); return;
    case 'callejones_ceniza': callejones(b, st, r, def.id); return;
    case 'faro_sirenas': faro(b, st, r, def.id); return;
    case 'boveda_tiburcio': boveda(b, def.id); return;
    case 'claro_luciernagas': claro(b, st, r, def.id); return;
    default:
      switch (def.kind) {
        case 'capital': case 'ciudad': capitalValdoria(b, st, r, def.id); return;
        case 'fortaleza': fortress(b, st, def.id); return;
        case 'ruina': ruin(b, st, r, 'columns'); return;
        case 'templo': temploAlba(b, st, def.id); return;
        case 'puerto': port(b, st, r, def.id); return;
        default: villageGeneric(b, def, st, r, def.id);
      }
  }
}

/** Decorative trees scattered around a location model (location scene backdrop). */
export function decorTrees(b: ModelBuilder, def: LocationDef, n: number, rMin: number, rMax: number): void {
  const r = new Rng(`decor:${def.id}`);
  const leaf: Record<ContinentId, [string, 'round' | 'pine' | 'palm' | 'dead']> = {
    valdoria: ['#6f9a42', 'round'], sylvaria: ['#4f8a3a', 'round'], kharaz: ['#3f6a3a', 'pine'], morvenna: ['#3f3432', 'dead'], islas: ['#3f9a50', 'palm'], concordia: ['#9fb87a', 'round'],
  };
  const [c, k] = leaf[def.continent];
  for (let i = 0; i < n; i++) {
    const a = r.range(0, Math.PI * 2), d = r.range(rMin, rMax);
    tree(b, Math.sin(a) * d, Math.cos(a) * d, r.range(0.9, 1.6), c, '#6a4a30', k);
  }
}
