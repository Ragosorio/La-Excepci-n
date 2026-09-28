/**
 * Battle arenas per biome: heightmapped toon terrain (vertex colors, no outlines), water, instanced props
 * (with outlines + collision circles), coliseum stands with a goblin crowd, void islands, marble plazas.
 */
import * as THREE from 'three';
import type { BattleBiome } from './api';
import type { SkyOverride } from '../render/sky';
import type { Ambience } from '../audio';
import { Rng } from '../core/rng';
import { fbm, hexLinear, smooth01, vnoise, writeYaw } from './mathx';
import { propGeo, PROP_COLLIDE, PROP_NO_OUTLINE, type PropKind } from './props';
import { GB } from './geo';
import { PartMesh } from './crowd';
import { crowdMaterial } from './crowdmat';
import { FIELD } from './const';

interface PropPlacement { kind: PropKind; count: number; minR: number; maxR: number; scale: [number, number]; colors: string[]; inField?: number; y?: [number, number] }

export interface BiomeDef {
  ground: [string, string, string];
  rim: string;
  rimTop?: string;
  amp: number;
  rimH: number;
  time: number;
  fog: [number, number];
  override?: SkyOverride;
  water?: { color: string; deep: string; level: number; swirl?: boolean };
  grass: { count: number; colors: string[] };
  flowers?: { count: number; colors: string[] };
  props: PropPlacement[];
  ambient?: { preset: string; color?: string; color2?: string; rate: number; up?: number };
  ambience?: Ambience;
  tiles?: 'marble' | 'sand' | 'void';
  bloom?: number;
}

const GREENS = ['#4f8a3a', '#5aa04a', '#3f7a3a', '#6aa84a'];

export const BIOMES: Record<BattleBiome, BiomeDef> = {
  llanura: {
    ground: ['#a9b155', '#7fa04a', '#6a8a3a'], rim: '#6a9a4a', rimTop: '#8ab05a', amp: 1.4, rimH: 16, time: 0.63, fog: [70, 230],
    grass: { count: 2600, colors: ['#7fa04a', '#9ab45a', '#b8b860', '#6a9a3a'] }, flowers: { count: 500, colors: ['#ffffff', '#ffe066', '#e2455b', '#b48cff'] },
    props: [
      { kind: 'tree', count: 34, minR: 64, maxR: 125, scale: [0.9, 1.5], colors: GREENS },
      { kind: 'wheat', count: 70, minR: 56, maxR: 100, scale: [0.9, 1.3], colors: ['#e8c46a', '#d9b050'] },
      { kind: 'rock', count: 14, minR: 30, maxR: 120, scale: [0.6, 1.5], colors: ['#9a948a', '#8a847a'], inField: 3 },
      { kind: 'fence', count: 16, minR: 58, maxR: 80, scale: [1, 1], colors: ['#ffffff'] },
      { kind: 'windmill', count: 2, minR: 80, maxR: 100, scale: [1.2, 1.4], colors: ['#ffffff'] },
      { kind: 'bush', count: 30, minR: 50, maxR: 120, scale: [0.8, 1.4], colors: GREENS },
    ],
    ambient: { preset: 'leaves', color: '#e8d070', color2: '#9ccf5a', rate: 3 }, ambience: 'wind',
  },
  bosque: {
    ground: ['#4f8a3a', '#3a7a3a', '#2f5a2f'], rim: '#3a6a3a', amp: 1.2, rimH: 12, time: 0.38, fog: [45, 190],
    override: { fog: '#b8d8a0', weight: 0.35 },
    grass: { count: 3200, colors: ['#4f8a3a', '#5aa04a', '#3a7a3a'] }, flowers: { count: 300, colors: ['#ffe066', '#ffffff', '#ff9ad5'] },
    props: [
      { kind: 'colossal', count: 16, minR: 66, maxR: 115, scale: [0.9, 1.3], colors: ['#3f8a3a', '#4f9a4a', '#5aa04a'] },
      { kind: 'tree', count: 40, minR: 58, maxR: 120, scale: [1.0, 1.7], colors: GREENS },
      { kind: 'pine', count: 26, minR: 60, maxR: 120, scale: [1.0, 1.6], colors: ['#2f6a3a', '#3a7a4a'] },
      { kind: 'mushroom', count: 26, minR: 40, maxR: 90, scale: [0.6, 1.6], colors: ['#e2455b', '#b48cff', '#ffb347'], inField: 3 },
      { kind: 'bush', count: 40, minR: 45, maxR: 110, scale: [0.8, 1.6], colors: GREENS },
      { kind: 'rock', count: 10, minR: 30, maxR: 110, scale: [0.6, 1.3], colors: ['#7a847a'], inField: 2 },
    ],
    ambient: { preset: 'nature', color: '#fff7a0', color2: '#9dff7a', rate: 6, up: 0.5 }, ambience: 'forest_dawn',
  },
  montana: {
    ground: ['#8a7a6a', '#6a5a4a', '#4a3f38'], rim: '#6a6060', rimTop: '#eeeef4', amp: 2.3, rimH: 30, time: 0.55, fog: [70, 260],
    grass: { count: 900, colors: ['#7a8a5a', '#8a8a6a'] },
    props: [
      { kind: 'pine', count: 40, minR: 60, maxR: 125, scale: [1.0, 1.8], colors: ['#2f5a3a', '#3a6a4a'] },
      { kind: 'boulders', count: 24, minR: 50, maxR: 125, scale: [0.8, 2.0], colors: ['#8a847a', '#7a746e'], inField: 4 },
      { kind: 'rock', count: 26, minR: 30, maxR: 120, scale: [0.6, 1.8], colors: ['#8a847a', '#6a645e'] },
      { kind: 'crystal', count: 14, minR: 45, maxR: 100, scale: [0.8, 1.8], colors: ['#ff8a3a', '#7fe3ff'] },
      { kind: 'banner', count: 8, minR: 56, maxR: 66, scale: [1, 1.2], colors: ['#ff6a2a', '#8a3a2a'] },
    ],
    ambient: { preset: 'dust', color: '#c8b8a8', rate: 2 }, ambience: 'wind',
  },
  pantano: {
    ground: ['#4a5a4a', '#3a4a42', '#2a3a3a'], rim: '#3a4a4a', amp: 0.9, rimH: 10, time: 0.8, fog: [30, 150],
    override: { fog: '#5a4a7a', horizon: '#7a5a9a', weight: 0.55 },
    water: { color: '#3a5a5a', deep: '#1a2a3a', level: -0.28 },
    grass: { count: 1400, colors: ['#4a6a4a', '#5a6a3a'] },
    props: [
      { kind: 'deadtree', count: 34, minR: 50, maxR: 120, scale: [0.9, 1.7], colors: ['#ffffff'], inField: 3 },
      { kind: 'reeds', count: 110, minR: 30, maxR: 110, scale: [0.8, 1.4], colors: ['#6a7a4a', '#8a8a5a'] },
      { kind: 'mushroom', count: 30, minR: 40, maxR: 100, scale: [0.5, 1.3], colors: ['#b48cff', '#7fe3ff', '#8dff5a'] },
      { kind: 'crystal', count: 8, minR: 55, maxR: 100, scale: [0.8, 1.3], colors: ['#b48cff'] },
      { kind: 'rock', count: 12, minR: 40, maxR: 110, scale: [0.6, 1.4], colors: ['#5a6a5a'] },
    ],
    ambient: { preset: 'nature', color: '#c7ff7a', color2: '#b48cff', rate: 9, up: 0.3 }, ambience: 'swamp',
  },
  tropical: {
    ground: ['#e8d49a', '#5ab06a', '#c8b47a'], rim: '#5aa05a', amp: 1.1, rimH: 8, time: 0.5, fog: [80, 280],
    water: { color: '#2ab0c8', deep: '#0a6a9a', level: -0.9 },
    grass: { count: 1500, colors: ['#5ab06a', '#7ac06a'] }, flowers: { count: 400, colors: ['#ff4fa3', '#ffb347', '#ffffff'] },
    props: [
      { kind: 'palm', count: 40, minR: 50, maxR: 115, scale: [0.9, 1.4], colors: ['#4aa04a', '#5ab05a', '#3a9a4a'] },
      { kind: 'rock', count: 12, minR: 40, maxR: 110, scale: [0.6, 1.6], colors: ['#b8a888'], inField: 2 },
      { kind: 'bush', count: 30, minR: 45, maxR: 110, scale: [0.8, 1.5], colors: ['#4aa04a', '#6ab04a'] },
      { kind: 'crate', count: 10, minR: 50, maxR: 70, scale: [0.8, 1.2], colors: ['#ffffff'] },
      { kind: 'tent', count: 4, minR: 62, maxR: 72, scale: [1, 1.2], colors: ['#ff4fa3', '#ffb347', '#2ab0c8'] },
    ],
    ambient: { preset: 'leaves', color: '#ff9ad5', color2: '#ffe066', rate: 2 }, ambience: 'sea',
  },
  marmol: {
    ground: ['#e8e2d0', '#d8d0c0', '#c8c0b0'], rim: '#b8c8a0', amp: 0.4, rimH: 8, time: 0.55, fog: [80, 260], tiles: 'marble',
    grass: { count: 300, colors: ['#9ab87a'] },
    props: [
      { kind: 'column', count: 28, minR: 56, maxR: 70, scale: [1, 1.2], colors: ['#ffffff'] },
      { kind: 'statue', count: 8, minR: 58, maxR: 66, scale: [1.2, 1.5], colors: ['#ffffff'] },
      { kind: 'banner', count: 14, minR: 54, maxR: 60, scale: [1.2, 1.4], colors: ['#c0392b', '#3a8a4a', '#ff6a2a', '#8a3ab0', '#2ab0c8', '#d9b36c'] },
      { kind: 'tree', count: 18, minR: 72, maxR: 120, scale: [1, 1.4], colors: GREENS },
    ],
    ambient: { preset: 'confetti', color: '#ffffff', color2: '#ffd36b', rate: 1 },
  },
  concordia: {
    ground: ['#ece6d8', '#dcd4c4', '#c8c0b0'], rim: '#c8d0b8', amp: 0.3, rimH: 10, time: 0.6, fog: [90, 300], tiles: 'marble', bloom: 0.62,
    grass: { count: 200, colors: ['#a8c88a'] },
    props: [
      { kind: 'column', count: 36, minR: 55, maxR: 72, scale: [1.1, 1.4], colors: ['#ffffff'] },
      { kind: 'statue', count: 10, minR: 58, maxR: 68, scale: [1.4, 1.8], colors: ['#ffffff'] },
      { kind: 'banner', count: 20, minR: 52, maxR: 60, scale: [1.3, 1.6], colors: ['#c0392b', '#3a8a4a', '#ff6a2a', '#8a3ab0', '#2ab0c8', '#d9b36c'] },
      { kind: 'tower', count: 5, minR: 95, maxR: 110, scale: [2.2, 2.8], colors: ['#ffffff'] },
      { kind: 'tree', count: 14, minR: 75, maxR: 125, scale: [1, 1.5], colors: GREENS },
    ],
    ambient: { preset: 'light', color: '#fff7d6', color2: '#ffd36b', rate: 3, up: 0.3 },
  },
  ruina: {
    ground: ['#7a8a6a', '#6a6a5a', '#5a5a4a'], rim: '#5a6a5a', amp: 1.2, rimH: 14, time: 0.3, fog: [40, 180],
    override: { fog: '#c8b8c8', weight: 0.4 },
    grass: { count: 1800, colors: ['#6a8a4a', '#7a8a5a'] },
    props: [
      { kind: 'brokencolumn', count: 30, minR: 30, maxR: 110, scale: [0.9, 1.5], colors: ['#9a948a', '#8a8a7a', '#a8a090'], inField: 5 },
      { kind: 'arch', count: 8, minR: 55, maxR: 100, scale: [1, 1.5], colors: ['#8a847a', '#9a948a'] },
      { kind: 'crystal', count: 16, minR: 40, maxR: 110, scale: [0.7, 1.6], colors: ['#c77dff', '#7fe3ff'] },
      { kind: 'rock', count: 18, minR: 30, maxR: 120, scale: [0.6, 1.6], colors: ['#7a746e'] },
      { kind: 'deadtree', count: 12, minR: 60, maxR: 120, scale: [1, 1.6], colors: ['#ffffff'] },
    ],
    ambient: { preset: 'essence', color: '#e0a8ff', rate: 3, up: 0.3 }, ambience: 'wind',
  },
  arena: {
    ground: ['#ead6a4', '#dcc592', '#c4ac80'], rim: '#8a7a6a', amp: 0, rimH: 0, time: 0.64, fog: [120, 320], tiles: 'sand',
    water: { color: '#2ab0c8', deep: '#0a4a7a', level: -6, swirl: true },
    grass: { count: 0, colors: ['#9ab45a'] },
    props: [
      { kind: 'torch', count: 24, minR: 46, maxR: 46, scale: [1.2, 1.2], colors: ['#ffffff'] },
      { kind: 'banner', count: 16, minR: 75, maxR: 75, scale: [1.6, 1.8], colors: ['#ff4fa3', '#ffb347', '#2ab0c8', '#3ab06a'] },
    ],
    ambient: { preset: 'confetti', color: '#ff4fa3', color2: '#4fd8ff', rate: 2 }, ambience: 'crowd', bloom: 0.62,
  },
  vacio: {
    ground: ['#4a3a62', '#3a2a50', '#5a4474'], rim: '#1a1024', amp: 0.8, rimH: 0, time: 0.02, fog: [70, 240], tiles: 'void',
    override: { top: '#07040f', mid: '#1a0f33', horizon: '#4a2a80', fog: '#241440', stars: 1, sun: '#d9c8ff', sunI: 1.5, amb: '#a08ad8', ambI: 1.25, weight: 1 },
    grass: { count: 0, colors: ['#ffffff'] },
    props: [
      { kind: 'floatrock', count: 26, minR: 55, maxR: 130, scale: [1, 3], colors: ['#3a2a4a', '#2a1a3a', '#4a3a5a'], y: [2, 26] },
      { kind: 'crystal', count: 20, minR: 30, maxR: 75, scale: [0.8, 2], colors: ['#c77dff', '#9b5cff'], inField: 3 },
      { kind: 'brokencolumn', count: 10, minR: 48, maxR: 74, scale: [1, 1.6], colors: ['#3a2a4a'] },
    ],
    ambient: { preset: 'essence', color: '#c77dff', color2: '#7fe3ff', rate: 7, up: 0.8 }, ambience: 'void', bloom: 0.75,
  },
};

const HALF = 140;
const RES = 1;
const NGRID = (HALF * 2) / RES + 1;

export interface Obstacle { x: number; z: number; r: number }

export class Arena {
  readonly root = new THREE.Group();
  readonly def: BiomeDef;
  readonly obstacles: Obstacle[] = [];
  /** Circular field (coliseum) or square field half-size. */
  readonly round: boolean;
  readonly fieldR: number;
  private hm = new Float32Array(NGRID * NGRID);
  private props: PartMesh[] = [];
  private water: THREE.Mesh | null = null;
  private waterMat: THREE.ShaderMaterial | null = null;
  private spectators: PartMesh | null = null;
  private specBase: Float32Array | null = null;
  private terrain: THREE.Mesh;
  private disposables: Array<{ dispose(): void }> = [];
  cheer = 0;

  constructor(scene: THREE.Scene, readonly biome: BattleBiome, seed: number) {
    this.def = BIOMES[biome] ?? BIOMES.llanura;
    this.round = biome === 'arena';
    this.fieldR = this.round ? 44 : FIELD;
    scene.add(this.root);
    const rng = new Rng(seed * 7 + 13);
    this.buildHeight(seed);
    this.terrain = this.buildTerrain(seed);
    this.root.add(this.terrain);
    if (this.def.water) this.buildWater();
    if (biome === 'arena') this.buildColiseum(rng);
    for (const p of this.def.props) this.place(p, rng);
    if (this.def.grass.count) this.scatterSmall('grass', this.def.grass.count, this.def.grass.colors, rng, 0.9, 1.5);
    if (this.def.flowers) this.scatterSmall('flower', this.def.flowers.count, this.def.flowers.colors, rng, 0.9, 1.3);
  }

  // ───────────── height ─────────────

  private raw(x: number, z: number, seed: number): number {
    const b = this.biome, d = Math.hypot(x * 0.92, z);
    if (b === 'arena') {
      if (d < 47) return 0;
      if (d < 50) return 5.2;                               // inner wall top (visual; wall mesh covers)
      if (d < 74) return 1.5 + Math.floor((d - 50) / 3) * 1.35; // stepped stands
      if (d < 77) return 13;
      return -7;
    }
    let h = fbm(x * 0.018 + 3.1, z * 0.018 - 1.7, seed, 4) * this.def.amp;
    const field = 1 - smooth01((d - 42) / 34);
    h *= 1 - field * 0.62;
    if (b === 'marmol' || b === 'concordia') { h = d < 60 ? 0 : h + smooth01((d - 60) / 8) * 1.4; }
    if (b === 'vacio') {
      if (d > 76) return -60 * smooth01((d - 76) / 10) + h;
      return h * 0.6;
    }
    if (b === 'pantano') { const p = vnoise(x * 0.09 + 11, z * 0.09 - 7, seed + 3); if (p > 0.35 && d > 8) h -= (p - 0.35) * 1.8; }
    if (b === 'tropical') { const beach = smooth01((d - 88) / 20); h = h * (1 - beach) - beach * 3; }
    const rim = smooth01((d - 72) / 60);
    h += rim * rim * this.def.rimH * (0.75 + 0.5 * fbm(x * 0.03, z * 0.03, seed + 5, 3));
    return h;
  }

  private buildHeight(seed: number): void {
    for (let iz = 0; iz < NGRID; iz++) for (let ix = 0; ix < NGRID; ix++) {
      this.hm[iz * NGRID + ix] = this.raw(-HALF + ix * RES, -HALF + iz * RES, seed);
    }
  }

  /** Ground height (bilinear heightmap). */
  readonly heightAt = (x: number, z: number): number => {
    let fx = (x + HALF) / RES, fz = (z + HALF) / RES;
    if (fx < 0) fx = 0; else if (fx > NGRID - 1.001) fx = NGRID - 1.001;
    if (fz < 0) fz = 0; else if (fz > NGRID - 1.001) fz = NGRID - 1.001;
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz;
    const o = iz * NGRID + ix, hm = this.hm;
    const a = hm[o], b = hm[o + 1], c = hm[o + NGRID], d = hm[o + NGRID + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  };

  // ───────────── terrain mesh ─────────────

  private buildTerrain(seed: number): THREE.Mesh {
    const seg = 140;
    const g = new THREE.PlaneGeometry(HALF * 2, HALF * 2, seg, seg).rotateX(-Math.PI / 2);
    const pos = g.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    const c0 = [0, 0, 0], c1 = [0, 0, 0], c2 = [0, 0, 0], cr = [0, 0, 0], ct = [0, 0, 0];
    hexLinear(this.def.ground[0], c0); hexLinear(this.def.ground[1], c1); hexLinear(this.def.ground[2], c2);
    hexLinear(this.def.rim, cr); hexLinear(this.def.rimTop ?? this.def.rim, ct);
    const stone = [0, 0, 0]; hexLinear('#8a7e70', stone);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.heightAt(x, z);
      pos.setY(i, h);
      const n = fbm(x * 0.05, z * 0.05, seed + 9, 3) * 0.5 + 0.5;
      const n2 = vnoise(x * 0.23, z * 0.23, seed + 4) * 0.5 + 0.5;
      const d = Math.hypot(x, z);
      let r = c0[0] + (c1[0] - c0[0]) * n, gg = c0[1] + (c1[1] - c0[1]) * n, b = c0[2] + (c1[2] - c0[2]) * n;
      const low = Math.max(0, Math.min(1, -h * 0.8)) * 0.7 + (n2 < 0.25 ? 0.25 : 0);
      r += (c2[0] - r) * low; gg += (c2[1] - gg) * low; b += (c2[2] - b) * low;
      const rimK = smooth01((d - 70) / 40) * (this.def.rimH > 0 ? 1 : 0);
      r += (cr[0] - r) * rimK; gg += (cr[1] - gg) * rimK; b += (cr[2] - b) * rimK;
      if (this.def.rimTop && h > this.def.rimH * 0.55) { const k = smooth01((h - this.def.rimH * 0.55) / (this.def.rimH * 0.2)); r += (ct[0] - r) * k; gg += (ct[1] - gg) * k; b += (ct[2] - b) * k; }
      if (this.biome === 'arena' && d > 47) { const k = d < 77 ? 1 : 0.4; r += (stone[0] - r) * k; gg += (stone[1] - gg) * k; b += (stone[2] - b) * k; }
      col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const mat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientBands() });
    const tiles = this.def.tiles;
    if (tiles) {
      const t = tileTexture(tiles);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      const rep = tiles === 'marble' ? 46 : tiles === 'sand' ? 30 : 9;
      t.repeat.set(rep, rep);
      if (tiles === 'void') { mat.emissiveMap = t; mat.emissive = new THREE.Color('#b070ff'); mat.emissiveIntensity = 1.8; }
      else mat.map = t;
      this.disposables.push(t);
    }
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    this.disposables.push(g, mat);
    return mesh;
  }

  private buildWater(): void {
    const w = this.def.water!;
    const size = this.biome === 'arena' ? 900 : 700;
    const g = new THREE.PlaneGeometry(size, size, 1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 }, uShallow: { value: new THREE.Color(w.color) }, uDeep: { value: new THREE.Color(w.deep) }, uSwirl: { value: w.swirl ? 1 : 0 },
      }]),
      vertexShader: /* glsl */ `
        #include <common>
        #include <fog_pars_vertex>
        varying vec3 vW;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vW = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <fog_pars_fragment>
        uniform float uTime, uSwirl; uniform vec3 uShallow, uDeep;
        varying vec3 vW;
        float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }
        float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f *= f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + 1.0), f.x), f.y); }
        void main() {
          float d = length(vW.xz);
          vec2 p = vW.xz * 0.12;
          if (uSwirl > 0.5) {
            float a = atan(vW.z, vW.x) + uTime * 0.35 + 22.0 / (d * 0.08 + 1.0);
            p = vec2(a * 3.0, d * 0.09 - uTime * 0.25);
          } else p += vec2(uTime * 0.03, uTime * 0.02);
          float n = n2(p * 2.0) * 0.6 + n2(p * 5.0) * 0.4;
          vec3 col = mix(uDeep, uShallow, smoothstep(0.25, 0.8, n));
          float foam = step(0.78, n2(p * 3.3 + uTime * 0.05));
          col = mix(col, vec3(0.92, 0.97, 1.0), foam * 0.7);
          gl_FragColor = vec4(col, 0.92);
          #include <fog_fragment>
        }`,
      transparent: true, fog: true, depthWrite: true,
    });
    const m = new THREE.Mesh(g, mat);
    m.position.y = w.level;
    m.renderOrder = -1;
    this.root.add(m);
    this.water = m; this.waterMat = mat;
    this.disposables.push(g, mat);
  }

  // ───────────── props ─────────────

  private makeSet(kind: PropKind, count: number, castShadow: boolean): PartMesh {
    const mat = crowdMaterial({ rim: kind === 'crystal' || kind === 'floatrock' ? 0.4 : 0.12, bands: [0.5, 0.8, 1.0] });
    this.disposables.push(mat);
    const set = new PartMesh(this.root, propGeo(kind), mat, Math.max(1, count), { outline: !PROP_NO_OUTLINE.has(kind), castShadow });
    this.props.push(set);
    return set;
  }

  private place(p: PropPlacement, rng: Rng): void {
    const total = p.count + (p.inField ?? 0);
    const set = this.makeSet(p.kind, total, p.kind !== 'grass' && p.kind !== 'flower');
    const col = [0, 0, 0];
    const ringEven = p.minR === p.maxR;
    let placed = 0;
    for (let i = 0; i < total; i++) {
      let x = 0, z = 0;
      const field = i >= p.count;
      for (let tries = 0; tries < 12; tries++) {
        if (field) { x = rng.range(-36, 36); z = rng.range(-9, 9); }
        else {
          const a = ringEven ? (i / p.count) * Math.PI * 2 + 0.13 : rng.range(0, Math.PI * 2);
          const r = ringEven ? p.minR : rng.range(p.minR, p.maxR);
          x = Math.cos(a) * r; z = Math.sin(a) * r;
        }
        if (!field && !this.round && Math.abs(x) < FIELD - 4 && Math.abs(z) < FIELD - 4 && Math.hypot(x, z) < 50) continue;
        if (field && this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 3)) continue;
        break;
      }
      const k = set.next();
      if (k < 0) break;
      const sc = rng.range(p.scale[0], p.scale[1]);
      const yOff = p.y ? rng.range(p.y[0], p.y[1]) : 0;
      const yaw = p.kind === 'banner' || p.kind === 'torch' ? Math.atan2(-x, -z) : rng.range(0, Math.PI * 2);
      writeYaw(set.m, k * 16, x, this.heightAt(x, z) - (p.kind === 'rock' || p.kind === 'boulders' ? 0.2 * sc : 0) + yOff, z, yaw, sc, sc, sc);
      hexLinear(rng.pick(p.colors), col);
      const v = 0.88 + rng.next() * 0.24;
      set.setRGB(k, col[0] * v, col[1] * v, col[2] * v);
      set.setFx(k, 0, 0);
      const cr = PROP_COLLIDE[p.kind];
      if (cr && !p.y && Math.hypot(x, z) < this.fieldR + 8) this.obstacles.push({ x, z, r: cr * sc });
      placed++;
    }
    set.n = placed;
    set.end();
  }

  private scatterSmall(kind: PropKind, count: number, colors: string[], rng: Rng, s0: number, s1: number): void {
    const set = this.makeSet(kind, count, false);
    const col = [0, 0, 0];
    for (let i = 0; i < count; i++) {
      const k = set.next();
      if (k < 0) break;
      const r = Math.sqrt(rng.next()) * 115, a = rng.range(0, Math.PI * 2);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = this.heightAt(x, z);
      if (this.def.water && h < this.def.water.level + 0.05) { set.n--; continue; }
      const sc = rng.range(s0, s1);
      writeYaw(set.m, k * 16, x, h, z, rng.range(0, 6.28), sc, sc * rng.range(0.8, 1.3), sc);
      hexLinear(rng.pick(colors), col);
      const v = 0.85 + rng.next() * 0.3;
      set.setRGB(k, col[0] * v, col[1] * v, col[2] * v);
      set.setFx(k, 0, 0);
    }
    set.end();
  }

  private buildColiseum(rng: Rng): void {
    // inner wall ring (stone blocks with crenellations)
    const wallN = 60;
    const wmat = crowdMaterial({ rim: 0.08, bands: [0.5, 0.8, 1] });
    this.disposables.push(wmat);
    const wallSet = new PartMesh(this.root, wallGeo(), wmat, wallN, { outline: true, castShadow: true });
    this.props.push(wallSet);
    const col = [0, 0, 0]; hexLinear('#a89a86', col);
    for (let i = 0; i < wallN; i++) {
      const a = (i / wallN) * Math.PI * 2;
      const k = wallSet.next();
      writeYaw(wallSet.m, k * 16, Math.cos(a) * 47.6, 0, Math.sin(a) * 47.6, -a + Math.PI / 2, 1, 1, 1);
      const v = 0.9 + rng.next() * 0.2;
      wallSet.setRGB(k, col[0] * v, col[1] * v, col[2] * v); wallSet.setFx(k, 0, 0);
    }
    wallSet.end();
    // goblin crowd on the steps
    const n = 460;
    const smat = crowdMaterial({ rim: 0.25 });
    this.disposables.push(smat);
    const spec = new PartMesh(this.root, propGeo('spectator'), smat, n, {});
    this.props.push(spec);
    this.specBase = new Float32Array(n * 5);
    const cols = ['#e2455b', '#3ab06a', '#2ab0c8', '#ffb347', '#9b5cff', '#f0ead8', '#d9b36c'];
    let c = 0;
    for (let i = 0; i < n; i++) {
      const row = rng.int(0, 7), a = rng.range(0, Math.PI * 2);
      const r = 51.5 + row * 3 + rng.range(-0.4, 0.4);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = this.heightAt(x, z);
      const k = spec.next();
      if (k < 0) break;
      const s = rng.range(0.85, 1.25);
      this.specBase.set([x, y, z, Math.atan2(-x, -z), s], c * 5); c++;
      writeYaw(spec.m, k * 16, x, y, z, Math.atan2(-x, -z), s, s, s);
      hexLinear(rng.pick(cols), col);
      spec.setRGB(k, col[0], col[1], col[2]); spec.setFx(k, 0, 0);
    }
    spec.end();
    this.spectators = spec;
  }

  /** Cheer intensity 0..1 (arena crowd jumps). */
  update(dt: number, time: number): void {
    if (this.waterMat) this.waterMat.uniforms.uTime.value = time;
    const sp = this.spectators, base = this.specBase;
    if (sp && base) {
      this.cheer = Math.max(0.15, this.cheer - dt * 0.35);
      const n = sp.n;
      for (let k = 0; k < n; k++) {
        const o = k * 5, sd = (k * 0.618) % 1;
        const hop = Math.max(0, Math.sin(time * (6 + sd * 5) + sd * 20)) * 0.45 * this.cheer;
        writeYaw(sp.m, k * 16, base[o], base[o + 1] + hop, base[o + 2], base[o + 3] + Math.sin(time * 2 + sd * 9) * 0.3 * this.cheer, base[o + 4], base[o + 4] * (1 + hop * 0.3), base[o + 4]);
      }
      sp.end();
    }
  }

  /** Keeps (x,z) inside the playable field; returns true if clamped. */
  clampField(x: number, z: number, r: number, out: { x: number; z: number }): boolean {
    if (this.round) {
      const d = Math.hypot(x, z), m = this.fieldR - r;
      if (d > m) { out.x = (x / d) * m; out.z = (z / d) * m; return true; }
    } else {
      const m = FIELD + 6 - r;
      const cx = Math.max(-m, Math.min(m, x)), cz = Math.max(-m, Math.min(m, z));
      if (cx !== x || cz !== z) { out.x = cx; out.z = cz; return true; }
    }
    out.x = x; out.z = z;
    return false;
  }

  dispose(): void {
    for (const p of this.props) p.dispose();
    this.props.length = 0;
    this.terrain.geometry.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    this.root.removeFromParent();
  }
}

function wallGeo(): THREE.BufferGeometry {
  const b = new GB().add(new THREE.BoxGeometry(1, 1, 1), '#ffffff', [0, 2.7, 0], [5.2, 5.4, 1.6], [0, 0, 0], 1);
  for (let i = -1; i <= 1; i++) b.add(new THREE.BoxGeometry(1, 1, 1), '#ffffff', [i * 1.8, 5.8, 0], [1.2, 0.8, 1.7], [0, 0, 0], 1);
  return b.build();
}

let bands: THREE.DataTexture | null = null;
function gradientBands(): THREE.DataTexture {
  if (bands) return bands;
  const data = new Uint8Array([140, 140, 140, 255, 205, 205, 205, 255, 255, 255, 255, 255]);
  bands = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  bands.minFilter = THREE.NearestFilter; bands.magFilter = THREE.NearestFilter; bands.generateMipmaps = false; bands.needsUpdate = true;
  return bands;
}

function tileTexture(kind: 'marble' | 'sand' | 'void'): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  if (kind === 'marble') {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? '#f4f0e8' : '#e6e0d4'; g.fillRect(i * 128, j * 128, 128, 128);
    }
    g.strokeStyle = 'rgba(160,140,110,0.55)'; g.lineWidth = 3; g.strokeRect(0, 0, 128, 128); g.strokeRect(128, 128, 128, 128); g.strokeRect(128, 0, 128, 128); g.strokeRect(0, 128, 128, 128);
    g.strokeStyle = 'rgba(150,140,130,0.25)'; g.lineWidth = 1;
    for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(Math.random() * S, Math.random() * S); g.bezierCurveTo(Math.random() * S, Math.random() * S, Math.random() * S, Math.random() * S, Math.random() * S, Math.random() * S); g.stroke(); }
  } else if (kind === 'sand') {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
    for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${150 + Math.random() * 60},${120 + Math.random() * 50},${80 + Math.random() * 40},0.18)`; g.fillRect(Math.random() * S, Math.random() * S, 2, 2); }
    g.strokeStyle = 'rgba(160,120,70,0.18)'; g.lineWidth = 2;
    for (let k = 0; k < 10; k++) { g.beginPath(); const y = Math.random() * S; g.moveTo(0, y); g.quadraticCurveTo(S / 2, y + (Math.random() - 0.5) * 30, S, y); g.stroke(); }
  } else {
    g.fillStyle = '#000000'; g.fillRect(0, 0, S, S);
    g.strokeStyle = '#ffffff'; g.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      let x = Math.random() * S, y = Math.random() * S;
      g.lineWidth = 1 + Math.random() * 1.5;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 6; s++) { x += (Math.random() - 0.5) * 70; y += (Math.random() - 0.5) * 70; g.lineTo(x, y); }
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
