/**
 * Procedural anime/TABS character rig (non-instanced; for heroes, NPCs, cutscenes, overworld tokens).
 * Each body segment is ONE merged mesh with vertex colors (+ one outline hull) → ~12 draw calls ×2 per character.
 *
 *   const c = buildCharacter({ seed: 'elias', race: 'excepcion', special: 'elias' });
 *   scene.add(c.root);
 *   c.update(dt, { speed: 3 });      // procedural walk/idle
 *   c.play('cast'); c.setExpression('angry'); c.hit(dir);
 *
 * Root is at the feet, facing +Z. Height ≈ 1.8 * scale for humans.
 * The battle module renders large crowds with its own instanced renderer matching this style.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { JobId, RaceId, WeaponKind } from '../data/types';
import { toon, outlineMaterial, glow } from '../render/toon';
import { Rng } from '../core/rng';
import { createFaceAtlas, type FaceAtlas, type FaceExpr } from '../ui/art/faceAtlas';

// ───────────────────────────── specs ─────────────────────────────

export type Headgear = 'casco' | 'sombrero_alto' | 'sombrero_pico' | 'capucha' | 'corona' | 'mitra' | 'velo' | 'tricornio' | 'copa' | 'visera' | 'turbante' | 'ninguno';
export type HairStyle = 'spiky' | 'long' | 'short' | 'bun' | 'ponytail' | 'bald' | 'messy' | 'crest';
export type Special = 'elias' | 'elias_god' | 'aurel' | 'aurel_child' | 'aurel_old' | 'shadow' | 'tiburcio' | 'fortuna' | 'ione' | 'mother' | 'father';

export interface CharacterSpec {
  seed: string;
  race: RaceId;
  job?: JobId;
  gender?: 'f' | 'm' | 'x';
  age?: 'child' | 'young' | 'adult' | 'old';
  special?: Special;
  scale?: number;
  colors?: { skin?: string; hair?: string; outfit?: string; outfit2?: string; accent?: string; eyes?: string };
  hair?: HairStyle;
  headgear?: Headgear;
  weapon?: WeaponKind;
  shield?: boolean;
  cape?: boolean;
  robe?: boolean;
  outline?: boolean;
  faceVariant?: number;
  /** Glowing eyes color (villain, mind-controlled...). */
  eyeGlow?: string;
}

interface Body { h: number; w: number; head: number; limbs: number; belly: number; scale: number }
const RACE_BODY: Record<RaceId, Body> = {
  humano: { h: 1, w: 1, head: 1, limbs: 1, belly: 0, scale: 1 },
  caballero: { h: 1.02, w: 1.15, head: 0.95, limbs: 1, belly: 0, scale: 1.05 },
  elfo: { h: 1.08, w: 0.88, head: 0.95, limbs: 1.12, belly: 0, scale: 1.05 },
  enano: { h: 0.78, w: 1.3, head: 1.12, limbs: 0.78, belly: 0.25, scale: 0.8 },
  gigante: { h: 1.05, w: 1.3, head: 0.8, limbs: 1.12, belly: 0.1, scale: 2.6 },
  ogro: { h: 0.95, w: 1.55, head: 0.92, limbs: 0.95, belly: 0.65, scale: 1.7 },
  duende: { h: 0.9, w: 1.0, head: 1.4, limbs: 0.9, belly: 0.1, scale: 0.62 },
  mago: { h: 1.02, w: 0.95, head: 1, limbs: 1, belly: 0, scale: 1 },
  bruja: { h: 1, w: 0.9, head: 1, limbs: 1, belly: 0, scale: 0.97 },
  trol: { h: 1.12, w: 0.88, head: 0.9, limbs: 1.35, belly: 0, scale: 1.35 },
  clerigo: { h: 1, w: 1, head: 1, limbs: 1, belly: 0.05, scale: 1 },
  picaro: { h: 0.98, w: 0.9, head: 1, limbs: 1.02, belly: 0, scale: 0.97 },
  sirena: { h: 1.02, w: 0.9, head: 1, limbs: 1.05, belly: 0, scale: 1 },
  draconido: { h: 1.08, w: 1.12, head: 0.95, limbs: 1.05, belly: 0, scale: 1.15 },
  excepcion: { h: 1.1, w: 0.9, head: 0.96, limbs: 1.08, belly: 0, scale: 1.05 },
};

const RACE_SKIN: Record<RaceId, string[]> = {
  humano: ['#f2d3b8', '#e8bf9c', '#c98f68', '#a46a48', '#7a4b33'],
  caballero: ['#f2d3b8', '#e0b08a', '#b87d57'],
  elfo: ['#f8e6d8', '#f1dccb', '#e6d0c8'],
  enano: ['#e8b392', '#d99a7a', '#c07f5f'],
  gigante: ['#9a938c', '#8a8680', '#a8a095'],
  ogro: ['#8f9f6a', '#7f9160', '#a0a476'],
  duende: ['#86c250', '#6fae45', '#9bcf5e'],
  mago: ['#f2d3b8', '#e8bf9c', '#c98f68'],
  bruja: ['#f1dccb', '#d9e6c8', '#e8bf9c'],
  trol: ['#4fa3a0', '#3f8f9a', '#5ab0a0'],
  clerigo: ['#f2d3b8', '#e8bf9c', '#c98f68'],
  picaro: ['#f2d3b8', '#d8a882', '#a46a48'],
  sirena: ['#bfe8e0', '#a8dcd8', '#d0f0e8'],
  draconido: ['#a9483a', '#8a3a4a', '#3a6a5a'],
  excepcion: ['#f1e6e0'],
};
const HAIR_COLORS = ['#1c1420', '#3a2418', '#6a3a1e', '#b8702a', '#e8c46a', '#f0e6d0', '#c0392b', '#2c3e70', '#6a4c9c', '#2a6a4a', '#d7d7e0'];

const JOB_OUTFIT: Partial<Record<JobId, { o: string; o2: string; head: Headgear; weapon: WeaponKind; shield?: boolean; cape?: boolean; robe?: boolean }>> = {
  guerrero: { o: '#8a4a3a', o2: '#b9b3a8', head: 'casco', weapon: 'espada', shield: true },
  soldado: { o: '#5a6a8a', o2: '#b9b3a8', head: 'casco', weapon: 'lanza', shield: true },
  arquero: { o: '#3f6a3a', o2: '#8a6a3a', head: 'capucha', weapon: 'arco' },
  curandero: { o: '#e8e2d0', o2: '#6fbf8a', head: 'ninguno', weapon: 'baston', robe: true },
  hechicero: { o: '#3a2a7a', o2: '#d9b36c', head: 'sombrero_alto', weapon: 'baston', robe: true, cape: true },
  mercader: { o: '#8a6a2a', o2: '#e8d8a8', head: 'turbante', weapon: 'ninguna' },
  cortesana: { o: '#8a2a5a', o2: '#e8c46a', head: 'velo', weapon: 'abanico', robe: true },
  herrero: { o: '#4a3a30', o2: '#8a8a8a', head: 'ninguno', weapon: 'martillo' },
  erudito: { o: '#4a3a6a', o2: '#d9c9a8', head: 'ninguno', weapon: 'libro', robe: true },
  cazador: { o: '#5a4a2a', o2: '#3a5a2a', head: 'capucha', weapon: 'arco' },
  sacerdote: { o: '#f0ead8', o2: '#d9b36c', head: 'mitra', weapon: 'maza', robe: true },
  bardo: { o: '#b04a3a', o2: '#e8c46a', head: 'copa', weapon: 'ninguna', cape: true },
  ladron: { o: '#2a2a3a', o2: '#5a4a3a', head: 'capucha', weapon: 'daga' },
  minero: { o: '#6a5a4a', o2: '#e8c46a', head: 'casco', weapon: 'martillo' },
  chaman: { o: '#6a4a2a', o2: '#c05a3a', head: 'ninguno', weapon: 'baston' },
  noble: { o: '#5a1a3a', o2: '#d9b36c', head: 'ninguno', weapon: 'espada', cape: true },
  campesino: { o: '#8a7a5a', o2: '#5a6a3a', head: 'ninguno', weapon: 'hoz' },
  banquero: { o: '#2a5a3a', o2: '#d9b36c', head: 'copa', weapon: 'ninguna' },
  crupier: { o: '#1a1a24', o2: '#b0303a', head: 'visera', weapon: 'ninguna' },
  capitan: { o: '#2a3a6a', o2: '#d9b36c', head: 'tricornio', weapon: 'espada', cape: true },
  espia: { o: '#1a1a24', o2: '#4a3a5a', head: 'capucha', weapon: 'daga' },
  asesino: { o: '#18141e', o2: '#7a1a2a', head: 'capucha', weapon: 'daga', cape: true },
  alquimista: { o: '#4a5a3a', o2: '#b08a3a', head: 'ninguno', weapon: 'libro', robe: true },
  pirata: { o: '#6a2a2a', o2: '#e8d8a8', head: 'tricornio', weapon: 'espada' },
  guardian: { o: '#5a6a7a', o2: '#d9b36c', head: 'casco', weapon: 'lanza', shield: true },
  rey: { o: '#6a1a2a', o2: '#d9b36c', head: 'corona', weapon: 'espada', cape: true },
  reina: { o: '#4a1a5a', o2: '#d9b36c', head: 'corona', weapon: 'ninguna', cape: true, robe: true },
  tabernero: { o: '#7a5a3a', o2: '#e8e2d0', head: 'ninguno', weapon: 'ninguna' },
  monje: { o: '#b0703a', o2: '#6a4a2a', head: 'ninguno', weapon: 'puños', robe: true },
  delegado: { o: '#e8e2d0', o2: '#d9b36c', head: 'ninguno', weapon: 'ninguna', robe: true, cape: true },
  estudiante: { o: '#2a2a4a', o2: '#b0303a', head: 'ninguno', weapon: 'baston', robe: true },
};

// ───────────────────────────── geometry cache ─────────────────────────────

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}
const G_SPHERE = () => cached('sphere', () => new THREE.SphereGeometry(1, 18, 14));
const G_CAPSULE = () => cached('capsule', () => new THREE.CapsuleGeometry(1, 1, 5, 12));
const G_CONE = () => cached('cone', () => new THREE.ConeGeometry(1, 1, 12, 1));
const G_CYL = () => cached('cyl', () => new THREE.CylinderGeometry(1, 1, 1, 12, 1));
const G_BOX = () => cached('box', () => new THREE.BoxGeometry(1, 1, 1));
const G_TORUS = () => cached('torus', () => new THREE.TorusGeometry(1, 0.18, 8, 24));

/** Collects colored primitives and merges them into one geometry. */
class Seg {
  private parts: THREE.BufferGeometry[] = [];
  add(base: THREE.BufferGeometry, color: string, pos: [number, number, number], scale: [number, number, number] | number, rot: [number, number, number] = [0, 0, 0]): this {
    const g = base.clone();
    const s = typeof scale === 'number' ? [scale, scale, scale] : scale;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(s[0], s[1], s[2]));
    g.applyMatrix4(m);
    const col = new THREE.Color(color);
    const n = g.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    this.parts.push(g);
    return this;
  }
  get empty(): boolean { return this.parts.length === 0; }
  build(mat: THREE.Material, outline: boolean, thickness: number): THREE.Mesh | null {
    if (!this.parts.length) return null;
    const norm = this.parts.map((p) => (p.index ? p.toNonIndexed() : p));
    const merged = mergeGeometries(norm, false);
    norm.forEach((p) => p.dispose());
    this.parts.forEach((p) => p.dispose());
    if (!merged) return null;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    if (outline) {
      // smooth normals for the hull so edges don't split
      const hullGeo = merged.clone();
      hullGeo.deleteAttribute('uv');
      const o = new THREE.Mesh(hullGeo, outlineMaterial(thickness));
      o.userData.isOutline = true;
      o.castShadow = false;
      mesh.add(o);
    }
    return mesh;
  }
}

// ───────────────────────────── shared resources ─────────────────────────────

let bodyMat: THREE.MeshToonMaterial | null = null;
let atlas: FaceAtlas | null = null;
let atlasTex: THREE.CanvasTexture | null = null;
function sharedBodyMat(): THREE.MeshToonMaterial {
  if (!bodyMat) bodyMat = toon('#ffffff', { vertexColors: true, rim: 0.28, rimColor: '#fff4e8', unique: true });
  return bodyMat;
}
function faceAtlas(): { atlas: FaceAtlas; tex: THREE.CanvasTexture } {
  if (!atlas || !atlasTex) {
    atlas = createFaceAtlas(128);
    atlasTex = new THREE.CanvasTexture(atlas.canvas);
    atlasTex.colorSpace = THREE.SRGBColorSpace;
    atlasTex.anisotropy = 4;
  }
  return { atlas, tex: atlasTex };
}

function faceCapGeometry(): THREE.BufferGeometry {
  return cached('facecap', () => {
    // front-facing spherical cap with planar UVs (x,y → u,v)
    const g = new THREE.SphereGeometry(1, 24, 18, Math.PI * 0.5 - 1.05, 2.1, Math.PI * 0.5 - 0.95, 1.9);
    const pos = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      uv.setXY(i, x * 0.62 + 0.5, y * 0.62 + 0.5);
    }
    uv.needsUpdate = true;
    return g;
  });
}

// ───────────────────────────── rig ─────────────────────────────

export type Pose = 'idle' | 'walk' | 'cast' | 'channel' | 'attack' | 'sit' | 'kneel' | 'point' | 'fly' | 'dead' | 'cheer' | 'lie';

interface Joint { g: THREE.Group; rest: THREE.Euler }

export class CharacterRig {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();       // everything except shadow; lean/wobble applied here
  readonly spec: CharacterSpec;
  readonly height: number;
  readonly scale: number;
  hips!: Joint; chest!: Joint; head!: Joint;
  armL!: Joint; armR!: Joint; foreL!: Joint; foreR!: Joint;
  legL!: Joint; legR!: Joint; shinL!: Joint; shinR!: Joint;
  cape: THREE.Mesh | null = null;
  weaponMesh: THREE.Object3D | null = null;
  faceMesh!: THREE.Mesh;
  private faceTex!: THREE.Texture;
  private eyeGlowMesh: THREE.Mesh | null = null;
  private meshes: THREE.Mesh[] = [];
  private phase = 0;
  private speedS = 0;
  private lean = 0;
  private leanV = 0;
  private hitT = 0;
  private hitDir = new THREE.Vector3();
  private actionT = 0;
  private actionDur = 0;
  private action: Pose | null = null;
  pose: Pose = 'idle';
  private t = Math.random() * 10;
  private expr: FaceExpr = 'neutral';
  private variant = 0;
  private opacity = 1;
  private dims!: { leg: number; torso: number; headR: number; shoulder: number; arm: number; hipW: number };

  constructor(spec: CharacterSpec) {
    this.spec = spec;
    const body = RACE_BODY[spec.race] ?? RACE_BODY.humano;
    const ageScale = spec.age === 'child' ? 0.72 : spec.age === 'old' ? 0.96 : 1;
    this.scale = (spec.scale ?? 1) * body.scale * ageScale;
    this.build(spec, body);
    this.height = (this.dims.leg + this.dims.torso + this.dims.headR * 2) * this.scale;
    this.root.add(this.body);
    this.body.scale.setScalar(this.scale);
    this.root.userData.rig = this;
  }

  private build(spec: CharacterSpec, b: Body): void {
    const rng = new Rng(spec.seed);
    const child = spec.age === 'child';
    const f = spec.gender === 'f';
    const job = spec.job ? JOB_OUTFIT[spec.job] : undefined;
    const sp = spec.special;
    // colors
    let skin = spec.colors?.skin ?? rng.pick(RACE_SKIN[spec.race] ?? RACE_SKIN.humano);
    let hair = spec.colors?.hair ?? (spec.age === 'old' ? '#d7d7e0' : rng.pick(HAIR_COLORS));
    let outfit = spec.colors?.outfit ?? job?.o ?? rng.pick(['#5a4a7a', '#3a5a6a', '#6a3a3a', '#4a5a3a', '#6a5a3a']);
    let outfit2 = spec.colors?.outfit2 ?? job?.o2 ?? '#d9c9a8';
    let accent = spec.colors?.accent ?? '#d9b36c';
    let headgear: Headgear = spec.headgear ?? job?.head ?? 'ninguno';
    let weapon: WeaponKind = spec.weapon ?? job?.weapon ?? 'ninguna';
    let hairStyle: HairStyle = spec.hair ?? rng.pick<HairStyle>(f ? ['long', 'ponytail', 'bun', 'long', 'short'] : ['spiky', 'short', 'messy', 'spiky']);
    let cape = spec.cape ?? job?.cape ?? false;
    let robe = spec.robe ?? job?.robe ?? false;
    let shield = spec.shield ?? job?.shield ?? false;
    const pants = '#3a3040';
    const boots = '#2a2024';

    if (sp === 'elias' || sp === 'elias_god') {
      skin = '#f1e6e0'; hair = '#15101c'; outfit = '#121018'; outfit2 = '#6a3bc0'; accent = '#c9c9d9';
      headgear = 'ninguno'; weapon = 'ninguna'; hairStyle = 'long'; cape = true; robe = true; shield = false;
    } else if (sp === 'aurel' || sp === 'aurel_old') {
      skin = '#f0cfae'; hair = sp === 'aurel_old' ? '#c8b89a' : '#f0c75a'; outfit = '#eae4d6'; outfit2 = '#d9a73c'; accent = '#ffd36b';
      headgear = 'ninguno'; weapon = 'espada'; hairStyle = 'messy'; cape = true; shield = false; robe = false;
    } else if (sp === 'aurel_child') {
      skin = '#f0cfae'; hair = '#f0c75a'; outfit = '#6a8ab0'; outfit2 = '#e8e2d0'; headgear = 'ninguno'; weapon = 'ninguna'; hairStyle = 'messy'; cape = false; robe = false; shield = false;
    } else if (sp === 'shadow') {
      skin = '#050308'; hair = '#050308'; outfit = '#050308'; outfit2 = '#0d0714'; accent = '#0d0714'; headgear = 'ninguno'; weapon = 'ninguna'; hairStyle = 'long'; cape = true; robe = true;
    } else if (sp === 'tiburcio') {
      headgear = 'copa'; outfit = '#2a6a3a'; outfit2 = '#d9b36c'; weapon = 'ninguna'; hairStyle = 'bald';
    } else if (sp === 'ione') {
      hair = '#d7d7e0'; outfit = '#f0ead8'; outfit2 = '#9fbf7a'; hairStyle = 'bun'; robe = true; cape = true; headgear = 'ninguno'; weapon = 'ninguna';
    } else if (sp === 'fortuna') {
      hair = '#5ab0a8'; outfit = '#2a1a3a'; outfit2 = '#d9b36c'; headgear = 'velo'; robe = true; weapon = 'ninguna';
    }
    if (spec.race === 'bruja' && headgear === 'ninguno') headgear = 'sombrero_pico';
    if (spec.race === 'mago' && headgear === 'ninguno' && !sp) headgear = 'sombrero_alto';
    if (spec.race === 'caballero' && headgear === 'ninguno' && !sp) headgear = 'casco';
    if (spec.race === 'gigante' || spec.race === 'ogro') { if (headgear === 'casco') headgear = 'ninguno'; if (weapon === 'espada' || weapon === 'lanza') weapon = spec.race === 'ogro' ? 'garrote' : 'martillo'; hairStyle = spec.race === 'ogro' ? 'bald' : hairStyle; }
    if (spec.race === 'trol') hairStyle = 'crest';
    if (spec.race === 'duende' && hairStyle !== 'bald') hairStyle = rng.pick<HairStyle>(['bald', 'short', 'messy']);
    const armored = headgear === 'casco' || spec.race === 'caballero' || spec.job === 'guerrero' || spec.job === 'guardian' || sp === 'aurel' || sp === 'aurel_old';
    const armor = sp === 'aurel' || sp === 'aurel_old' ? '#f4f0e6' : '#b9b8c2';

    // dimensions (unscaled; body group is scaled)
    const leg = 0.72 * b.h * b.limbs * (child ? 0.85 : 1);
    const torso = 0.55 * b.h;
    const headR = 0.25 * b.head * (child ? 1.12 : 1);
    const shoulder = 0.24 * b.w;
    const hipW = 0.11 * b.w;
    const arm = 0.29 * b.limbs;
    this.dims = { leg, torso, headR, shoulder, arm, hipW };
    const th = 0.018;
    const mat = sharedBodyMat();
    const outline = spec.outline !== false;

    const joint = (parent: THREE.Object3D, x: number, y: number, z: number): Joint => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      return { g, rest: new THREE.Euler() };
    };
    const put = (j: Joint, seg: Seg) => { const m = seg.build(mat, outline, th / Math.max(0.6, this.scale ** 0.3)); if (m) { j.g.add(m); this.meshes.push(m); } };

    // ── hips / pelvis
    this.hips = joint(this.body, 0, leg, 0);
    const pelvis = new Seg().add(G_SPHERE(), robe ? outfit : pants, [0, 0.02, 0], [hipW * 1.9, 0.14, 0.15 * b.w]);
    if (robe) pelvis.add(G_CONE(), outfit, [0, -leg * 0.42, 0], [hipW * 3.3 + b.belly * 0.2, leg * 0.95, 0.26 * b.w + b.belly * 0.2], [0, 0, 0]);
    if (robe) pelvis.add(G_CYL(), outfit2, [0, -leg * 0.88, 0], [hipW * 3.25 + b.belly * 0.2, 0.03, 0.255 * b.w + b.belly * 0.2]);
    put(this.hips, pelvis);

    // ── chest
    this.chest = joint(this.hips.g, 0, 0.06, 0);
    const chest = new Seg();
    const tw = 0.2 * b.w, td = 0.14 * b.w;
    chest.add(G_CAPSULE(), outfit, [0, torso * 0.45, 0], [tw, torso * 0.36, td]);
    if (b.belly > 0) chest.add(G_SPHERE(), outfit, [0, torso * 0.28, 0.05], [tw * (1 + b.belly * 0.6), torso * 0.34 * (1 + b.belly * 0.3), td * (1 + b.belly * 1.2)]);
    chest.add(G_CYL(), outfit2, [0, torso * 0.12, 0], [tw * 1.02 + b.belly * 0.08, 0.05, td * 1.05 + b.belly * 0.1]); // belt
    chest.add(G_BOX(), accent, [0, torso * 0.12, td * 1.02 + b.belly * 0.1], [0.07, 0.06, 0.02]); // buckle
    if (armored) {
      chest.add(G_SPHERE(), armor, [0, torso * 0.58, 0.02], [tw * 1.08, torso * 0.3, td * 1.12]);
      chest.add(G_SPHERE(), armor, [-shoulder * 0.95, torso * 0.8, 0], [0.12, 0.08, 0.12]);
      chest.add(G_SPHERE(), armor, [shoulder * 0.95, torso * 0.8, 0], [0.12, 0.08, 0.12]);
      if (sp === 'aurel' || sp === 'aurel_old') chest.add(G_CYL(), '#ffcf5a', [0, torso * 0.6, td * 1.1], [0.07, 0.02, 0.07], [Math.PI / 2, 0, 0]);
    } else {
      chest.add(G_SPHERE(), outfit2, [0, torso * 0.78, 0.02], [tw * 0.7, 0.07, td * 0.9]); // collar
    }
    if (sp === 'elias' || sp === 'elias_god') {
      // high collar + silver trim + eclipse sigil
      chest.add(G_CYL(), outfit, [0, torso * 0.92, -0.02], [0.2, 0.18, 0.15]);
      chest.add(G_CYL(), outfit2, [0, torso * 0.92, -0.02], [0.185, 0.17, 0.135]);
      chest.add(G_BOX(), accent, [0, torso * 0.5, td * 1.02], [0.02, torso * 0.7, 0.01]);
    }
    if (spec.race === 'duende' && sp === 'tiburcio') chest.add(G_BOX(), '#e8d8a8', [0, torso * 0.5, td * 0.95], [0.12, torso * 0.4, 0.02]);
    put(this.chest, chest);

    // cape (separate mesh so it can sway)
    if (cape) {
      const capeCol = sp === 'elias' || sp === 'elias_god' ? '#1a0f2a' : sp === 'shadow' ? '#050308' : sp === 'aurel' || sp === 'aurel_old' ? '#e8e2d0' : outfit2;
      const capeIn = sp === 'elias' || sp === 'elias_god' ? '#5a2aa0' : sp === 'aurel' || sp === 'aurel_old' ? '#c0392b' : outfit;
      const cg = new Seg()
        .add(G_BOX(), capeCol, [0, -torso * 0.45 - leg * 0.35, -0.02], [tw * 2.3, torso * 0.9 + leg * 0.7, 0.03])
        .add(G_BOX(), capeIn, [0, -torso * 0.45 - leg * 0.35, 0.005], [tw * 2.2, torso * 0.88 + leg * 0.68, 0.02]);
      const capeJ = joint(this.chest.g, 0, torso * 0.88, -td - 0.04);
      const m = cg.build(mat, outline, th);
      if (m) { capeJ.g.add(m); this.cape = m; this.meshes.push(m); m.userData.joint = capeJ.g; }
    }

    // ── head
    this.head = joint(this.chest.g, 0, torso * 0.92, 0);
    const headSeg = new Seg();
    headSeg.add(G_SPHERE(), skin, [0, headR * 0.95, 0], [headR, headR * 1.02, headR * 0.98]);
    headSeg.add(G_CYL(), skin, [0, headR * 0.05, 0], [headR * 0.35, headR * 0.35, headR * 0.35]); // neck
    // ears
    const earY = headR * 0.95;
    if (spec.race === 'elfo') {
      headSeg.add(G_CONE(), skin, [-headR * 1.05, earY + 0.04, -0.02], [0.05, headR * 1.2, 0.03], [0, 0, Math.PI / 2 + 0.35]);
      headSeg.add(G_CONE(), skin, [headR * 1.05, earY + 0.04, -0.02], [0.05, headR * 1.2, 0.03], [0, 0, -Math.PI / 2 - 0.35]);
    } else if (spec.race === 'duende') {
      headSeg.add(G_CONE(), skin, [-headR * 1.2, earY + 0.02, 0], [0.12, headR * 1.5, 0.05], [0, 0, Math.PI / 2 + 0.15]);
      headSeg.add(G_CONE(), skin, [headR * 1.2, earY + 0.02, 0], [0.12, headR * 1.5, 0.05], [0, 0, -Math.PI / 2 - 0.15]);
    } else if (spec.race === 'sirena') {
      headSeg.add(G_CONE(), '#5ab0c8', [-headR * 0.98, earY, -0.02], [0.08, headR * 0.7, 0.02], [0, 0, Math.PI / 2 + 0.6]);
      headSeg.add(G_CONE(), '#5ab0c8', [headR * 0.98, earY, -0.02], [0.08, headR * 0.7, 0.02], [0, 0, -Math.PI / 2 - 0.6]);
    } else if (spec.race === 'trol') {
      headSeg.add(G_CONE(), skin, [-headR * 1.05, earY + 0.05, 0], [0.07, headR * 0.9, 0.03], [0, 0, Math.PI / 2 + 0.6]);
      headSeg.add(G_CONE(), skin, [headR * 1.05, earY + 0.05, 0], [0.07, headR * 0.9, 0.03], [0, 0, -Math.PI / 2 - 0.6]);
    } else {
      headSeg.add(G_SPHERE(), skin, [-headR * 0.98, earY, 0], [0.04, 0.07, 0.05]);
      headSeg.add(G_SPHERE(), skin, [headR * 0.98, earY, 0], [0.04, 0.07, 0.05]);
    }
    // tusks / beard / horns / halo
    if (spec.race === 'ogro' || spec.race === 'trol') {
      const tl = spec.race === 'trol' ? 0.14 : 0.09;
      headSeg.add(G_CONE(), '#f4ecd8', [-headR * 0.35, headR * 0.45, headR * 0.82], [0.035, tl, 0.035], [-0.3, 0, 0.15]);
      headSeg.add(G_CONE(), '#f4ecd8', [headR * 0.35, headR * 0.45, headR * 0.82], [0.035, tl, 0.035], [-0.3, 0, -0.15]);
    }
    if (spec.race === 'enano' && !(f && rng.chance(0.5))) {
      headSeg.add(G_CONE(), hair, [0, headR * 0.25, headR * 0.72], [headR * 0.75, headR * 1.2, headR * 0.45], [Math.PI, 0, 0]);
      headSeg.add(G_SPHERE(), '#d9b36c', [0, headR * -0.28, headR * 0.72], [0.035, 0.035, 0.035]);
    }
    if (spec.race === 'draconido') {
      headSeg.add(G_CONE(), '#e8dcc0', [-headR * 0.5, headR * 1.8, -headR * 0.3], [0.06, headR * 0.8, 0.06], [-0.6, 0, 0.3]);
      headSeg.add(G_CONE(), '#e8dcc0', [headR * 0.5, headR * 1.8, -headR * 0.3], [0.06, headR * 0.8, 0.06], [-0.6, 0, -0.3]);
    }
    if (spec.race === 'gigante') headSeg.add(G_SPHERE(), '#7a746e', [0, headR * 1.25, headR * 0.55], [headR * 0.8, headR * 0.18, headR * 0.3]); // heavy brow
    // hair
    this.buildHair(headSeg, hairStyle, hair, headR, rng, sp);
    // headgear
    this.buildHeadgear(headSeg, headgear, headR, outfit, outfit2, accent, armor);
    put(this.head, headSeg);
    if (spec.job === 'sacerdote' || spec.race === 'clerigo' && rng.chance(0.4)) {
      const halo = new THREE.Mesh(G_TORUS(), glow('#ffe7a0', 2.2));
      halo.scale.setScalar(headR * 0.75); halo.rotation.x = Math.PI / 2; halo.position.set(0, headR * 2.35, 0);
      this.head.g.add(halo);
    }

    // face decal
    const { atlas: at, tex } = faceAtlas();
    this.faceTex = tex.clone();
    this.faceTex.needsUpdate = true;
    this.faceTex.repeat.set(1 / at.cols, 1 / at.rows);
    this.variant = spec.faceVariant ?? (sp === 'elias' || sp === 'elias_god' ? 1 : rng.int(0, at.variants - 1));
    const faceMat = new THREE.MeshBasicMaterial({ map: this.faceTex, transparent: true, alphaTest: 0.05, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: true });
    this.faceMesh = new THREE.Mesh(faceCapGeometry(), faceMat);
    this.faceMesh.scale.setScalar(headR * 1.015);
    this.faceMesh.position.set(0, headR * 0.95, 0);
    this.faceMesh.renderOrder = 2;
    this.head.g.add(this.faceMesh);
    this.setExpression('neutral');
    if (sp === 'shadow') this.faceMesh.visible = false;
    const eg = spec.eyeGlow ?? (sp === 'shadow' ? '#b48cff' : sp === 'elias_god' ? '#e9dcff' : undefined);
    if (eg) this.setEyeGlow(eg);

    // ── arms
    const armCol = armored ? armor : outfit;
    const sleeve = robe ? outfit : armCol;
    const mkArm = (side: -1 | 1): [Joint, Joint] => {
      const a = joint(this.chest.g, side * shoulder, torso * 0.8, 0);
      const upper = new Seg().add(G_CAPSULE(), sleeve, [0, -arm * 0.5, 0], [0.065 * b.w + b.belly * 0.03, arm * 0.36, 0.065 * b.w + b.belly * 0.03]);
      if (armored) upper.add(G_SPHERE(), armor, [0, -0.02, 0], [0.1 * b.w, 0.08, 0.1 * b.w]);
      put(a, upper);
      const fo = joint(a.g, 0, -arm, 0);
      const lower = new Seg()
        .add(G_CAPSULE(), robe ? outfit : armCol, [0, -arm * 0.45, 0], [0.058 * b.w, arm * 0.32, 0.058 * b.w])
        .add(G_SPHERE(), robe && (sp === 'elias' || sp === 'elias_god') ? outfit2 : outfit2, [0, -arm * 0.12, 0], [0.07 * b.w, 0.045, 0.07 * b.w])
        .add(G_SPHERE(), spec.race === 'gigante' || spec.race === 'ogro' ? skin : armored ? '#8a8a96' : skin, [0, -arm * 0.95, 0], [0.07 * b.w * (spec.race === 'ogro' ? 1.3 : 1), 0.075, 0.07 * b.w]);
      put(fo, lower);
      return [a, fo];
    };
    [this.armL, this.foreL] = mkArm(-1);
    [this.armR, this.foreR] = mkArm(1);

    // ── legs
    const mkLeg = (side: -1 | 1): [Joint, Joint] => {
      const l = joint(this.hips.g, side * hipW, 0, 0);
      const upper = new Seg().add(G_CAPSULE(), armored ? '#6a6a78' : pants, [0, -leg * 0.25, 0], [0.075 * b.w, leg * 0.2, 0.075 * b.w]);
      put(l, upper);
      const s = joint(l.g, 0, -leg * 0.5, 0);
      const lower = new Seg()
        .add(G_CAPSULE(), boots, [0, -leg * 0.23, 0], [0.068 * b.w, leg * 0.2, 0.068 * b.w])
        .add(G_SPHERE(), boots, [0, -leg * 0.47, 0.05], [0.08 * b.w, 0.05, 0.12 * b.w]);
      put(s, lower);
      return [l, s];
    };
    [this.legL, this.shinL] = mkLeg(-1);
    [this.legR, this.shinR] = mkLeg(1);

    // ── weapon & shield
    if (weapon !== 'ninguna' && weapon !== 'puños') {
      const w = buildWeapon(weapon, accent, sp);
      w.position.set(0, -arm * 0.95, 0.02);
      this.foreR.g.add(w);
      this.weaponMesh = w;
    }
    if (shield) {
      const s = new Seg()
        .add(G_CYL(), outfit2, [0, 0, 0], [0.22, 0.04, 0.26], [Math.PI / 2, 0, 0])
        .add(G_CYL(), outfit, [0, 0, 0.015], [0.18, 0.04, 0.22], [Math.PI / 2, 0, 0])
        .add(G_SPHERE(), accent, [0, 0, 0.04], [0.05, 0.05, 0.03]);
      const m = s.build(mat, outline, th);
      if (m) { m.position.set(-0.05, -arm * 0.75, 0.1); m.rotation.y = -0.3; this.foreL.g.add(m); this.meshes.push(m); }
    }
    if (sp === 'shadow') this.setShadowForm();

    // rest pose
    this.armL.g.rotation.z = 0.12; this.armR.g.rotation.z = -0.12;
    for (const j of [this.hips, this.chest, this.head, this.armL, this.armR, this.foreL, this.foreR, this.legL, this.legR, this.shinL, this.shinR]) j.rest.copy(j.g.rotation);
    // blob shadow
    const blob = new THREE.Mesh(cached('blob', () => new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2)), blobMat());
    blob.scale.setScalar(0.42 * b.w + b.belly * 0.2);
    blob.position.y = 0.02;
    blob.renderOrder = 1;
    blob.userData.blob = true;
    blob.userData.noOutline = true;
    this.body.add(blob);
  }

  private buildHair(seg: Seg, style: HairStyle, color: string, r: number, rng: Rng, sp?: Special): void {
    if (style === 'bald') return;
    const cy = r * 0.95;
    // cap
    seg.add(G_SPHERE(), color, [0, cy + r * 0.12, -r * 0.08], [r * 1.07, r * 0.98, r * 1.05]);
    // fringe spikes over forehead
    const fr = style === 'messy' || style === 'spiky' ? 5 : 4;
    for (let i = 0; i < fr; i++) {
      const t = i / (fr - 1) - 0.5;
      seg.add(G_CONE(), color, [t * r * 1.3, cy + r * 0.62, r * 0.72], [r * 0.2, r * (0.55 + rng.range(0, 0.2)), r * 0.14], [Math.PI * 0.62, 0, t * 0.9]);
    }
    if (style === 'spiky' || style === 'messy') {
      const n = style === 'spiky' ? 8 : 6;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const up = rng.range(0.2, 0.9);
        seg.add(G_CONE(), color, [Math.sin(a) * r * 0.7, cy + r * (0.55 + up * 0.3), Math.cos(a) * r * 0.55 - r * 0.2], [r * 0.2, r * (0.6 + up * 0.4), r * 0.2], [Math.cos(a) * -0.9 - 0.3, 0, Math.sin(a) * 0.9]);
      }
    } else if (style === 'crest') {
      for (let i = 0; i < 5; i++) seg.add(G_CONE(), color, [0, cy + r * 0.9 - i * 0.02, r * 0.4 - i * r * 0.3], [r * 0.14, r * 0.9, r * 0.25], [-0.5 - i * 0.2, 0, 0]);
    } else if (style === 'bun') {
      seg.add(G_SPHERE(), color, [0, cy + r * 0.9, -r * 0.55], [r * 0.45, r * 0.45, r * 0.45]);
    } else if (style === 'ponytail') {
      seg.add(G_SPHERE(), color, [0, cy + r * 0.6, -r * 0.95], [r * 0.2, r * 0.2, r * 0.2]);
      seg.add(G_CONE(), color, [0, cy - r * 0.2, -r * 1.2], [r * 0.3, r * 1.4, r * 0.28], [Math.PI + 0.25, 0, 0]);
    }
    if (style === 'long') {
      const len = sp === 'elias' || sp === 'elias_god' ? 1.9 : 1.6;
      seg.add(G_CAPSULE(), color, [0, cy - r * 0.45, -r * 0.55], [r * 0.95, r * len * 0.5, r * 0.55]);
      seg.add(G_CONE(), color, [-r * 0.85, cy - r * 0.2, r * 0.1], [r * 0.25, r * 1.3, r * 0.18], [0.1, 0, -0.12]);
      seg.add(G_CONE(), color, [r * 0.85, cy - r * 0.2, r * 0.1], [r * 0.25, r * 1.3, r * 0.18], [0.1, 0, 0.12]);
      if (sp === 'elias' || sp === 'elias_god') seg.add(G_CONE(), '#d8d8e8', [r * 0.45, cy + r * 0.55, r * 0.78], [r * 0.12, r * 0.75, r * 0.1], [Math.PI * 0.6, 0, -0.4]); // silver streak
    } else if (style === 'short' || style === 'messy' || style === 'spiky') {
      seg.add(G_SPHERE(), color, [0, cy - r * 0.05, -r * 0.45], [r * 0.95, r * 0.8, r * 0.7]);
    }
  }

  private buildHeadgear(seg: Seg, hg: Headgear, r: number, o: string, o2: string, accent: string, armor: string): void {
    const top = r * 0.95 + r;
    switch (hg) {
      case 'casco':
        seg.add(G_SPHERE(), armor, [0, r * 1.1, -r * 0.02], [r * 1.12, r * 1.05, r * 1.12]);
        seg.add(G_BOX(), '#5a5a66', [0, r * 1.25, r * 0.9], [r * 1.3, r * 0.14, r * 0.3]);
        seg.add(G_CONE(), o2, [0, top + r * 0.25, 0], [r * 0.12, r * 0.5, r * 0.12]);
        break;
      case 'sombrero_alto':
        seg.add(G_CYL(), o, [0, top - r * 0.05, 0], [r * 1.5, r * 0.06, r * 1.5]);
        seg.add(G_CONE(), o, [0, top + r * 0.75, -r * 0.05], [r * 0.85, r * 1.7, r * 0.85], [-0.12, 0, 0]);
        seg.add(G_CYL(), o2, [0, top + r * 0.08, 0], [r * 0.86, r * 0.14, r * 0.86]);
        break;
      case 'sombrero_pico':
        seg.add(G_CYL(), '#1a1420', [0, top - r * 0.05, 0], [r * 1.75, r * 0.05, r * 1.75]);
        seg.add(G_CONE(), '#1a1420', [0, top + r * 0.7, -r * 0.2], [r * 0.85, r * 1.7, r * 0.85], [-0.35, 0, 0.2]);
        seg.add(G_CYL(), '#6a3a8a', [0, top + r * 0.1, 0], [r * 0.87, r * 0.13, r * 0.87]);
        break;
      case 'capucha':
        seg.add(G_SPHERE(), o, [0, r * 1.05, -r * 0.12], [r * 1.18, r * 1.15, r * 1.18]);
        seg.add(G_CONE(), o, [0, r * 1.05, -r * 1.0], [r * 0.5, r * 0.8, r * 0.3], [-Math.PI / 2 - 0.4, 0, 0]);
        break;
      case 'corona':
        seg.add(G_CYL(), '#e8c04a', [0, top - r * 0.05, 0], [r * 0.72, r * 0.2, r * 0.72]);
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; seg.add(G_CONE(), '#f5d56a', [Math.sin(a) * r * 0.66, top + r * 0.18, Math.cos(a) * r * 0.66], [r * 0.1, r * 0.3, r * 0.1]); }
        seg.add(G_SPHERE(), '#e2455b', [0, top + r * 0.02, r * 0.7], [r * 0.09, r * 0.09, r * 0.06]);
        break;
      case 'mitra':
        seg.add(G_CONE(), '#f4f0e6', [0, top + r * 0.45, 0], [r * 0.7, r * 1.2, r * 0.55]);
        seg.add(G_BOX(), accent, [0, top + r * 0.4, r * 0.4], [r * 0.12, r * 0.9, r * 0.02]);
        break;
      case 'velo':
        seg.add(G_SPHERE(), o, [0, r * 1.15, -r * 0.1], [r * 1.12, r * 1.02, r * 1.12]);
        seg.add(G_CYL(), accent, [0, r * 1.4, 0], [r * 1.02, r * 0.06, r * 1.02]);
        seg.add(G_BOX(), o2, [0, r * 0.62, r * 0.9], [r * 1.05, r * 0.5, r * 0.02]);
        break;
      case 'tricornio':
        seg.add(G_CYL(), '#1a1420', [0, top - r * 0.05, 0], [r * 1.4, r * 0.08, r * 1.4]);
        seg.add(G_CYL(), '#1a1420', [0, top + r * 0.2, 0], [r * 0.75, r * 0.45, r * 0.75]);
        seg.add(G_BOX(), '#d9b36c', [0, top + r * 0.02, r * 1.0], [r * 0.9, r * 0.05, r * 0.05]);
        break;
      case 'copa':
        seg.add(G_CYL(), '#16121c', [0, top - r * 0.02, 0], [r * 1.25, r * 0.05, r * 1.25]);
        seg.add(G_CYL(), '#16121c', [0, top + r * 0.55, 0], [r * 0.72, r * 1.1, r * 0.72]);
        seg.add(G_CYL(), '#b0303a', [0, top + r * 0.12, 0], [r * 0.73, r * 0.16, r * 0.73]);
        break;
      case 'visera':
        seg.add(G_CYL(), '#1a1420', [0, top - r * 0.2, 0], [r * 1.02, r * 0.14, r * 1.02]);
        seg.add(G_BOX(), '#3ab06a', [0, top - r * 0.2, r * 0.95], [r * 0.9, r * 0.03, r * 0.6]);
        break;
      case 'turbante':
        seg.add(G_SPHERE(), o2, [0, top - r * 0.1, -r * 0.05], [r * 1.15, r * 0.65, r * 1.15]);
        seg.add(G_SPHERE(), accent, [0, top - r * 0.05, r * 0.95], [r * 0.12, r * 0.12, r * 0.08]);
        break;
      default:
        break;
    }
  }

  // ───────────── appearance ─────────────
  setExpression(expr: FaceExpr): void {
    this.expr = expr;
    const { atlas: at } = faceAtlas();
    const uv = at.uv(at.index(expr, this.variant));
    this.faceTex.offset.set(uv.u, uv.v);
  }
  get expression(): FaceExpr { return this.expr; }

  setEyeGlow(color: string | null): void {
    if (this.eyeGlowMesh) { this.head.g.remove(this.eyeGlowMesh); this.eyeGlowMesh = null; }
    if (!color) return;
    const r = this.dims.headR;
    const g = new THREE.Group();
    const m = glow(color, 3.5);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(G_SPHERE(), m);
      e.scale.set(r * 0.13, r * 0.07, r * 0.05);
      e.position.set(s * r * 0.33, r * 0.98, r * 0.93);
      g.add(e);
    }
    this.eyeGlowMesh = g as unknown as THREE.Mesh;
    this.head.g.add(g);
  }

  private setShadowForm(): void {
    for (const m of this.meshes) {
      const out = m.children.find((c) => c.userData.isOutline);
      if (out) out.visible = false;
    }
  }

  /** Invisibility / fade: 1 = normal, 0 = invisible. Uses per-rig material clones on demand. */
  setOpacity(a: number): void {
    if (Math.abs(a - this.opacity) < 0.001) return;
    this.opacity = a;
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      let mat = mesh.material as THREE.Material & { opacity: number };
      if (!mesh.userData.ownMat) {
        mat = mat.clone() as THREE.Material & { opacity: number };
        mesh.material = mat;
        mesh.userData.ownMat = true;
      }
      mat.transparent = a < 1 || mesh === this.faceMesh || !!mesh.userData.blob;
      mat.opacity = mesh.userData.isOutline ? a * a : a;
      mat.depthWrite = a >= 0.99 && mesh !== this.faceMesh && !mesh.userData.blob;
    });
  }

  // ───────────── animation ─────────────
  /** Trigger a one-shot action pose ('attack', 'cast', 'point', 'cheer'). */
  play(action: Pose, duration = 0.4): void { this.action = action; this.actionT = 0; this.actionDur = duration; }
  /** Flinch from a hit coming from `dir` (world, normalized). */
  hit(dir?: THREE.Vector3): void { this.hitT = 0.25; if (dir) this.hitDir.copy(dir); }

  /**
   * Procedural animation. speed in m/s (world), used for walk cycle. Call every frame.
   */
  update(dt: number, opts: { speed?: number; airborne?: boolean } = {}): void {
    this.t += dt;
    const speed = opts.speed ?? 0;
    this.speedS += (speed - this.speedS) * (1 - Math.exp(-10 * dt));
    const sp = this.speedS / this.scale;
    const moving = sp > 0.15;
    const stride = Math.min(1, sp / 3.5);
    this.phase += dt * (4 + sp * 2.2);
    const s = Math.sin(this.phase), c = Math.cos(this.phase);

    // reset to rest
    const R = (j: Joint) => j.g.rotation.copy(j.rest);
    for (const j of [this.hips, this.chest, this.head, this.armL, this.armR, this.foreL, this.foreR, this.legL, this.legR, this.shinL, this.shinR]) R(j);
    this.hips.g.position.y = this.dims.leg;
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);

    // wobble spring (TABS-like lean on acceleration)
    const targetLean = moving ? stride * 0.22 : 0;
    this.leanV += ((targetLean - this.lean) * 90 - this.leanV * 9) * dt;
    this.lean += this.leanV * dt;

    const pose = this.pose;
    if (pose === 'sit') {
      this.hips.g.position.y = this.dims.leg * 0.55;
      this.legL.g.rotation.x = -1.45; this.legR.g.rotation.x = -1.45;
      this.shinL.g.rotation.x = 1.45; this.shinR.g.rotation.x = 1.45;
      this.armL.g.rotation.x = -0.5; this.armR.g.rotation.x = -0.5;
      this.foreL.g.rotation.x = -0.5; this.foreR.g.rotation.x = -0.5;
      this.chest.g.rotation.x = 0.08 + Math.sin(this.t * 1.4) * 0.015;
    } else if (pose === 'kneel') {
      this.hips.g.position.y = this.dims.leg * 0.6;
      this.legL.g.rotation.x = -1.5; this.shinL.g.rotation.x = 1.5;
      this.legR.g.rotation.x = 0.2; this.shinR.g.rotation.x = 1.3;
      this.chest.g.rotation.x = 0.35; this.head.g.rotation.x = 0.3;
      this.armL.g.rotation.x = 0.2; this.armR.g.rotation.x = 0.2;
    } else if (pose === 'lie' || pose === 'dead') {
      this.body.rotation.x = -Math.PI / 2;
      this.body.position.y = 0.2;
      this.armL.g.rotation.z = 1.2; this.armR.g.rotation.z = -1.2;
    } else if (pose === 'fly') {
      this.body.rotation.x = 0.4;
      this.armL.g.rotation.z = 0.9 + s * 0.1; this.armR.g.rotation.z = -0.9 - s * 0.1;
      this.legL.g.rotation.x = 0.3; this.legR.g.rotation.x = -0.1;
    } else {
      // walk / idle
      if (moving) {
        this.legL.g.rotation.x = s * 0.75 * stride;
        this.legR.g.rotation.x = -s * 0.75 * stride;
        this.shinL.g.rotation.x = Math.max(0, -c) * 0.9 * stride + 0.05;
        this.shinR.g.rotation.x = Math.max(0, c) * 0.9 * stride + 0.05;
        this.armL.g.rotation.x = -s * 0.6 * stride;
        this.armR.g.rotation.x = s * 0.6 * stride;
        this.foreL.g.rotation.x = -0.35 * stride; this.foreR.g.rotation.x = -0.35 * stride;
        this.hips.g.position.y = this.dims.leg + Math.abs(c) * 0.06 * stride;
        this.hips.g.rotation.y = s * 0.12 * stride;
        this.chest.g.rotation.y = -s * 0.18 * stride;
        this.chest.g.rotation.x = this.lean;
        this.head.g.rotation.x = -this.lean * 0.6 + Math.sin(this.phase * 2) * 0.03;
        this.body.rotation.z = s * 0.04 * stride;
      } else {
        const br = Math.sin(this.t * 1.8);
        this.chest.g.rotation.x = br * 0.02 + this.lean;
        this.head.g.rotation.x = -br * 0.02;
        this.head.g.rotation.y = Math.sin(this.t * 0.37) * 0.15;
        this.armL.g.rotation.z = 0.12 + br * 0.02; this.armR.g.rotation.z = -0.12 - br * 0.02;
        this.foreL.g.rotation.x = -0.12; this.foreR.g.rotation.x = -0.12;
      }
      if (pose === 'channel' || pose === 'cast') {
        this.armL.g.rotation.x = -1.3; this.armR.g.rotation.x = -1.3;
        this.armL.g.rotation.z = 0.25; this.armR.g.rotation.z = -0.25;
        this.foreL.g.rotation.x = -0.2; this.foreR.g.rotation.x = -0.2;
        this.chest.g.rotation.x += 0.05 + Math.sin(this.t * 8) * 0.01;
      } else if (pose === 'point') {
        this.armR.g.rotation.x = -1.45; this.foreR.g.rotation.x = 0;
      } else if (pose === 'cheer') {
        this.armL.g.rotation.z = 2.6; this.armR.g.rotation.z = -2.6;
        this.hips.g.position.y += Math.abs(Math.sin(this.t * 7)) * 0.08;
      }
    }

    // one-shot action overlay
    if (this.action) {
      this.actionT += dt;
      const k = Math.min(1, this.actionT / this.actionDur);
      const env = Math.sin(k * Math.PI);
      if (this.action === 'attack') {
        const wind = k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65;
        this.armR.g.rotation.x = -2.4 * (k < 0.35 ? wind : 1 - Math.min(1, (k - 0.35) * 3)) + (k >= 0.35 ? 0.9 * env : 0);
        this.armR.g.rotation.z = -0.4 * env;
        this.chest.g.rotation.y += (k < 0.35 ? -0.4 * wind : 0.5 * env);
        this.chest.g.rotation.x += 0.15 * env;
      } else if (this.action === 'cast') {
        this.armR.g.rotation.x = -1.6 * env; this.armL.g.rotation.x = -0.9 * env;
        this.foreR.g.rotation.x = -0.2 * env;
        this.chest.g.rotation.x += -0.1 * env;
      } else if (this.action === 'point') {
        this.armR.g.rotation.x = -1.5 * env;
      } else if (this.action === 'cheer') {
        this.armL.g.rotation.z = 2.5 * env; this.armR.g.rotation.z = -2.5 * env;
      }
      if (k >= 1) this.action = null;
    }

    // hit flinch
    if (this.hitT > 0) {
      this.hitT -= dt;
      const k = Math.max(0, this.hitT / 0.25);
      this.chest.g.rotation.x -= 0.45 * k;
      this.head.g.rotation.x -= 0.3 * k;
      this.body.position.x += this.hitDir.x * 0.1 * k;
      this.body.position.z += this.hitDir.z * 0.1 * k;
    }
    if (opts.airborne) { this.armL.g.rotation.z = 1.4; this.armR.g.rotation.z = -1.4; this.legL.g.rotation.x = -0.4; this.legR.g.rotation.x = 0.3; }

    // cape sway
    if (this.cape) {
      const j = this.cape.userData.joint as THREE.Group;
      j.rotation.x = 0.12 + stride * 0.45 + Math.sin(this.t * 2.3) * 0.04 + (moving ? Math.abs(s) * 0.08 : 0);
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        if (m.userData.ownMat) (m.material as THREE.Material).dispose();
        if (m.geometry && !isCachedGeo(m.geometry)) m.geometry.dispose();
      }
    });
    (this.faceMesh.material as THREE.Material).dispose();
    this.faceTex.dispose();
  }
}

function isCachedGeo(g: THREE.BufferGeometry): boolean {
  for (const v of geoCache.values()) if (v === g) return true;
  return false;
}

let _blobMat: THREE.MeshBasicMaterial | null = null;
function blobMat(): THREE.MeshBasicMaterial {
  if (!_blobMat) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(0,0,0,0.45)'); grd.addColorStop(0.6, 'rgba(0,0,0,0.25)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    _blobMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  }
  return _blobMat;
}

/** Weapon meshes (held in the right hand, pointing forward/down the arm). */
export function buildWeapon(kind: WeaponKind, accent = '#d9b36c', special?: Special): THREE.Group {
  const g = new THREE.Group();
  const mat = sharedBodyMat();
  const s = new Seg();
  const steel = '#dfe3ea', wood = '#7a5436', dark = '#2a2230';
  switch (kind) {
    case 'espada':
      s.add(G_BOX(), special === 'aurel' || special === 'aurel_old' ? '#fff6d8' : steel, [0, -0.02, 0.45], [0.05, 0.02, 0.8]);
      s.add(G_BOX(), accent, [0, 0, 0.04], [0.22, 0.04, 0.05]);
      s.add(G_CYL(), dark, [0, 0, -0.06], [0.025, 0.16, 0.025], [Math.PI / 2, 0, 0]);
      break;
    case 'hacha':
      s.add(G_CYL(), wood, [0, 0, 0.25], [0.025, 0.7, 0.025], [Math.PI / 2, 0, 0]);
      s.add(G_BOX(), steel, [0.12, 0, 0.52], [0.22, 0.03, 0.2]);
      break;
    case 'lanza':
      s.add(G_CYL(), wood, [0, 0, 0.5], [0.022, 1.5, 0.022], [Math.PI / 2, 0, 0]);
      s.add(G_CONE(), steel, [0, 0, 1.3], [0.05, 0.22, 0.05], [Math.PI / 2, 0, 0]);
      break;
    case 'arco':
      s.add(G_TORUS(), wood, [0, 0, 0.05], [0.42, 0.42, 0.5], [0, Math.PI / 2, 0]);
      break;
    case 'ballesta': case 'trabuco': case 'pistola':
      s.add(G_BOX(), wood, [0, 0, 0.2], [0.06, 0.08, 0.45]);
      s.add(G_CYL(), '#5a5a66', [0, 0.03, 0.42], [0.035, 0.35, 0.035], [Math.PI / 2, 0, 0]);
      if (kind === 'ballesta') s.add(G_BOX(), wood, [0, 0, 0.38], [0.45, 0.03, 0.04]);
      break;
    case 'baston':
      s.add(G_CYL(), wood, [0, 0, 0.3], [0.025, 1.3, 0.025], [Math.PI / 2, 0, 0]);
      break;
    case 'daga':
      s.add(G_BOX(), steel, [0, 0, 0.2], [0.04, 0.015, 0.3]);
      s.add(G_BOX(), accent, [0, 0, 0.04], [0.1, 0.03, 0.03]);
      break;
    case 'martillo': case 'maza':
      s.add(G_CYL(), wood, [0, 0, 0.25], [0.03, 0.7, 0.03], [Math.PI / 2, 0, 0]);
      if (kind === 'martillo') s.add(G_BOX(), '#8a8a96', [0, 0, 0.6], [0.28, 0.16, 0.16]);
      else s.add(G_SPHERE(), '#8a8a96', [0, 0, 0.6], [0.11, 0.11, 0.11]);
      break;
    case 'garrote':
      s.add(G_CONE(), wood, [0, 0, 0.4], [0.12, 0.9, 0.12], [-Math.PI / 2, 0, 0]);
      break;
    case 'abanico':
      s.add(G_CYL(), '#b0303a', [0, 0, 0.12], [0.2, 0.01, 0.2], [0, 0, Math.PI / 2]);
      break;
    case 'escoba':
      s.add(G_CYL(), wood, [0, 0, 0.2], [0.022, 1.2, 0.022], [Math.PI / 2, 0, 0]);
      s.add(G_CONE(), '#c8a84a', [0, 0, -0.45], [0.12, 0.35, 0.12], [-Math.PI / 2, 0, 0]);
      break;
    case 'libro':
      s.add(G_BOX(), '#6a2a3a', [0, 0.05, 0.1], [0.22, 0.05, 0.28]);
      s.add(G_BOX(), '#f3ead8', [0, 0.05, 0.1], [0.2, 0.055, 0.26]);
      break;
    case 'hoz':
      s.add(G_CYL(), wood, [0, 0, 0.12], [0.02, 0.35, 0.02], [Math.PI / 2, 0, 0]);
      s.add(G_TORUS(), steel, [0.12, 0, 0.3], [0.14, 0.14, 0.3], [Math.PI / 2, 0, 0]);
      break;
    default: break;
  }
  const m = s.build(mat, true, 0.012);
  if (m) g.add(m);
  if (kind === 'baston') {
    const orb = new THREE.Mesh(G_SPHERE(), glow('#b48cff', 2.5));
    orb.scale.setScalar(0.08); orb.position.set(0, 0, 0.98);
    g.add(orb);
  }
  g.rotation.x = Math.PI / 2 - 0.2;
  return g;
}

export function buildCharacter(spec: CharacterSpec): CharacterRig { return new CharacterRig(spec); }
