/**
 * Tiny procedural modeling kit: collect colored toon primitives in a local frame, then merge them into a few
 * big meshes (solid + outline hull, glowing windows, lantern points, flag spots, spinners).
 * Used by the overworld (all locations merged → ~6 draw calls) and the location scene (one big model).
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export type V3 = [number, number, number];

export interface LightSpot { x: number; y: number; z: number; color: string; size: number; always: number; phase: number }
export interface FlagSpot { x: number; y: number; z: number; rot: number; scale: number; key: string }
export interface Spinner { geo: THREE.BufferGeometry; x: number; y: number; z: number; axis: 'x' | 'y' | 'z'; speed: number; rotY: number }

const unit = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.IcosahedronGeometry(1, 1),
  sphereHi: new THREE.SphereGeometry(1, 14, 10),
  oct: new THREE.OctahedronGeometry(1, 0),
  /** Square pyramid, base 1×1 on y=0, apex at y=1. */
  pyramid: new THREE.CylinderGeometry(0.0001, Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0),
  /** Triangular prism (gable roof): ridge along x, base 1 (z) on y=0, apex y=1. */
  prism: new THREE.CylinderGeometry(1, 1, 1, 3, 1).rotateZ(-Math.PI / 2).rotateX(-Math.PI / 2).scale(1, 1 / 1.5, 1 / 1.732).translate(0, 1 / 3, 0),
};
const cylCache = new Map<string, THREE.BufferGeometry>();
function cylGeo(rt: number, rb: number, seg: number, open = false): THREE.BufferGeometry {
  const k = `${rt.toFixed(3)}|${rb.toFixed(3)}|${seg}|${open ? 1 : 0}`;
  let g = cylCache.get(k);
  if (!g) { g = new THREE.CylinderGeometry(rt, rb, 1, seg, 1, open); cylCache.set(k, g); }
  return g;
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const vp = new THREE.Vector3();
const vs = new THREE.Vector3();
const col = new THREE.Color();

/** Local frame: position (x,y,z), yaw, uniform scale. Child builders share the parent's lists. */
export class ModelBuilder {
  solid: THREE.BufferGeometry[] = [];
  /** Windows: dark by day, lit at night. */
  glass: THREE.BufferGeometry[] = [];
  /** Always-glowing emissive bits (crystals, orbs, lava, neon strips). */
  glow: THREE.BufferGeometry[] = [];
  lights: LightSpot[] = [];
  flags: FlagSpot[] = [];
  spinners: Spinner[] = [];
  constructor(public ox = 0, public oy = 0, public oz = 0, public rot = 0, public s = 1, private root?: ModelBuilder) {}

  /** A sub-frame (translated/rotated/scaled) writing into the same lists. */
  sub(x: number, y: number, z: number, rot = 0, s = 1): ModelBuilder {
    const [wx, wy, wz] = this.toWorld(x, y, z);
    const b = new ModelBuilder(wx, wy, wz, this.rot + rot, this.s * s, this.root ?? this);
    return b;
  }
  private get R(): ModelBuilder { return this.root ?? this; }

  toWorld(x: number, y: number, z: number): V3 {
    const c = Math.cos(this.rot), sn = Math.sin(this.rot);
    return [this.ox + (x * c + z * sn) * this.s, this.oy + y * this.s, this.oz + (-x * sn + z * c) * this.s];
  }

  private push(list: 'solid' | 'glass' | 'glow', base: THREE.BufferGeometry, color: string, pos: V3, scale: V3, rot: V3 = [0, 0, 0]): this {
    const g = base.clone();
    const [wx, wy, wz] = this.toWorld(pos[0], pos[1], pos[2]);
    e.set(rot[0], rot[1] + this.rot, rot[2], 'YXZ');
    q.setFromEuler(e);
    m4.compose(vp.set(wx, wy, wz), q, vs.set(scale[0] * this.s, scale[1] * this.s, scale[2] * this.s));
    g.applyMatrix4(m4);
    col.set(color);
    const n = g.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g.deleteAttribute('uv');
    const nonIdx = g.index ? g.toNonIndexed() : g;
    if (nonIdx !== g) g.dispose();
    this.R[list].push(nonIdx);
    return this;
  }

  box(color: string, pos: V3, size: V3, rot?: V3): this { return this.push('solid', unit.box, color, pos, size, rot); }
  /** Cylinder standing on `pos` (pos = base center). */
  cyl(color: string, pos: V3, rTop: number, rBot: number, h: number, seg = 10, rot?: V3): this {
    return this.push('solid', cylGeo(rTop, rBot, seg), color, [pos[0], pos[1] + h / 2, pos[2]], [1, h, 1], rot);
  }
  /** Cone standing on `pos`. */
  cone(color: string, pos: V3, r: number, h: number, seg = 8, rot?: V3): this {
    return this.push('solid', cylGeo(0.0001, r, seg), color, [pos[0], pos[1] + h / 2, pos[2]], [1, h, 1], rot);
  }
  /** Four-sided pyramid roof on `pos` (w × d footprint). */
  roof(color: string, pos: V3, w: number, d: number, h: number, rotY = 0): this {
    return this.push('solid', unit.pyramid, color, pos, [w, h, d], [0, rotY, 0]);
  }
  /** Gabled roof (triangular prism): ridge along local x (length w), depth d, height h. */
  gable(color: string, pos: V3, w: number, d: number, h: number, rotY = 0): this {
    return this.push('solid', unit.prism, color, pos, [w, h, d], [0, rotY, 0]);
  }
  sphere(color: string, pos: V3, r: number | V3, hi = false): this {
    const s: V3 = typeof r === 'number' ? [r, r, r] : r;
    return this.push('solid', hi ? unit.sphereHi : unit.sphere, color, pos, s);
  }
  crystal(color: string, pos: V3, r: number, h: number, rot: V3 = [0, 0, 0]): this { return this.push('glow', unit.oct, color, pos, [r, h, r], rot); }
  glowBox(color: string, pos: V3, size: V3, rot?: V3): this { return this.push('glow', unit.box, color, pos, size, rot); }
  glowSphere(color: string, pos: V3, r: number): this { return this.push('glow', unit.sphere, color, pos, [r, r, r]); }
  glowCyl(color: string, pos: V3, rTop: number, rBot: number, h: number, seg = 10): this {
    return this.push('glow', cylGeo(rTop, rBot, seg), color, [pos[0], pos[1] + h / 2, pos[2]], [1, h, 1]);
  }

  /** A small lit window on a wall facing `face` (yaw). */
  window(pos: V3, face: number, w = 0.16, h = 0.22, color = '#ffc86a'): this {
    return this.push('glass', unit.box, color, pos, [w, h, 0.04], [0, face, 0]);
  }
  light(pos: V3, color = '#ffc86a', size = 1, always = 0): this {
    const [x, y, z] = this.toWorld(pos[0], pos[1], pos[2]);
    this.R.lights.push({ x, y, z, color, size: size * this.s, always, phase: Math.random() * 10 });
    return this;
  }
  /** Pole + flag spot. `key` groups flags by owner ('loc:<id>' or 'cont:<id>'). */
  flag(pos: V3, poleH: number, key: string, scale = 1, face = 0): this {
    this.cyl('#4a3a2a', pos, 0.025, 0.035, poleH, 5);
    this.sphere('#d9b36c', [pos[0], pos[1] + poleH, pos[2]], 0.05);
    const [x, y, z] = this.toWorld(pos[0], pos[1] + poleH - 0.05, pos[2]);
    this.R.flags.push({ x, y, z, rot: this.rot + face, scale: scale * this.s, key });
    return this;
  }
  spin(geo: THREE.BufferGeometry, color: string, pos: V3, axis: Spinner['axis'], speed: number, rotY = 0): this {
    const g = geo.clone();
    col.set(color);
    const n = g.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g.scale(this.s, this.s, this.s);
    const [x, y, z] = this.toWorld(pos[0], pos[1], pos[2]);
    this.R.spinners.push({ geo: g, x, y, z, axis, speed, rotY: this.rot + rotY });
    return this;
  }
}

/** Merge a list of colored non-indexed geometries, adding a constant `aCont` attribute. */
export function mergeColored(list: THREE.BufferGeometry[], contOf?: (g: THREE.BufferGeometry) => number): THREE.BufferGeometry | null {
  if (!list.length) return null;
  for (const g of list) {
    const n = g.getAttribute('position').count;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('aCont')) {
      const c = contOf ? contOf(g) : 5;
      g.setAttribute('aCont', new THREE.BufferAttribute(new Float32Array(n).fill(c), 1));
    }
  }
  const merged = mergeGeometries(list, false);
  list.forEach((g) => g.dispose());
  if (!merged) return null;
  merged.computeBoundingSphere();
  return merged;
}

/** Smooth-normal hull geometry for inverted-hull outlines (no gaps at box corners). */
export function hullGeometry(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', src.getAttribute('position').clone());
  const m = mergeVertices(g, 1e-3);
  m.computeVertexNormals();
  g.dispose();
  return m;
}

/** Tag every geometry currently in a builder's solid/glass lists with a continent index (for corruption). */
export function tagContinent(list: THREE.BufferGeometry[], from: number, ci: number): void {
  for (let i = from; i < list.length; i++) {
    const g = list[i];
    const n = g.getAttribute('position').count;
    g.setAttribute('aCont', new THREE.BufferAttribute(new Float32Array(n).fill(ci), 1));
  }
}
