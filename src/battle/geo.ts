/**
 * Geometry library for the instanced crowd and props.
 * Every geometry carries: position, normal, color (linear RGB, may exceed 1 for glowing bits) and aTint:
 *   aTint 0 = keep vertex color · 1 = × instanceColor · 2 = × aCol2 (second per-instance color).
 * Spaces:
 *   - segment parts (torso, limbs): unit height centered on Y (spans joint A→B), unit width → scaled by writeSeg.
 *   - head space: head sphere radius 1 at origin, face toward +Z (hair, headgear, race extras share the head matrix).
 *   - hand space: origin at the hand, +Y = weapon direction, +Z = flat side forward.
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const P = {
  sphere: new THREE.SphereGeometry(1, 9, 6),
  sphereHi: new THREE.SphereGeometry(1, 11, 8),
  sphereLo: new THREE.SphereGeometry(1, 6, 4),
  cone: new THREE.ConeGeometry(1, 1, 7, 1),
  coneLo: new THREE.ConeGeometry(1, 1, 3, 1, true),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 9, 1),
  cylLo: new THREE.CylinderGeometry(1, 1, 1, 6, 1),
  box: new THREE.BoxGeometry(1, 1, 1),
  ico: new THREE.IcosahedronGeometry(1, 0),
  ico1: new THREE.IcosahedronGeometry(1, 1),
  dodeca: new THREE.DodecahedronGeometry(1, 0),
  octa: new THREE.OctahedronGeometry(1, 0),
  capsule: new THREE.CapsuleGeometry(1, 1, 3, 8),
};
export const PRIM = P;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

export type V3 = [number, number, number];

/** Collects colored primitives and merges them into one geometry. */
export class GB {
  private parts: THREE.BufferGeometry[] = [];
  add(base: THREE.BufferGeometry, color: string, pos: V3, scale: number | V3, rot: V3 = [0, 0, 0], tint = 0, glowMul = 1): this {
    const g = (base.index ? base.toNonIndexed() : base.clone());
    const s = typeof scale === 'number' ? [scale, scale, scale] : scale;
    _m.compose(_v.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])), _s.set(s[0], s[1], s[2]));
    g.applyMatrix4(_m);
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    if (g.getAttribute('uv1')) g.deleteAttribute('uv1');
    const n = g.getAttribute('position').count;
    _c.set(color);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r * glowMul; col[i * 3 + 1] = _c.g * glowMul; col[i * 3 + 2] = _c.b * glowMul; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const t = new Float32Array(n).fill(tint);
    g.setAttribute('aTint', new THREE.BufferAttribute(t, 1));
    this.parts.push(g);
    return this;
  }
  /** Adds an arbitrary pre-made geometry (already positioned). */
  raw(g: THREE.BufferGeometry, color: string, tint = 0, glowMul = 1): this {
    return this.add(g, color, [0, 0, 0], 1, [0, 0, 0], tint, glowMul);
  }
  build(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.parts, false) ?? new THREE.BufferGeometry();
    this.parts.forEach((p) => p.dispose());
    this.parts.length = 0;
    merged.computeBoundingSphere();
    return merged;
  }
}

/** Smooth-normal hull (position + normal only) for inverted-hull outlines. */
export function hullOf(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', geo.getAttribute('position').clone());
  const m = mergeVertices(g, 1e-3);
  m.computeVertexNormals();
  g.dispose();
  return m;
}

// ───────────────────────────── body parts ─────────────────────────────

const LEATHER = '#3a2a24', GOLD = '#d9b36c', STEEL = '#dfe3ea', IRON = '#8a8a96', WOOD = '#7a5436', DARK = '#1a1420', BONE = '#f4ecd8';

export function torsoGeo(): THREE.BufferGeometry {
  const cap = new THREE.CapsuleGeometry(0.5, 0.5, 3, 10).scale(1, 1 / 1.5, 1);
  return new GB()
    .add(cap, '#ffffff', [0, 0, 0], 1, [0, 0, 0], 1)
    .add(P.cyl, LEATHER, [0, -0.22, 0], [0.49, 0.07, 0.49])
    .add(P.box, GOLD, [0, -0.22, 0.47], [0.12, 0.08, 0.06])
    .add(P.cyl, '#ffffff', [0, 0.36, 0], [0.34, 0.07, 0.34], [0, 0, 0], 2)
    .build();
}

function limbCap(): THREE.BufferGeometry { return new THREE.CapsuleGeometry(0.5, 2.1, 2, 6).scale(1, 1 / 3.1, 1); }

export function upperLimbGeo(): THREE.BufferGeometry {
  return new GB().add(limbCap(), '#ffffff', [0, 0, 0], 1, [0, 0, 0], 1).build();
}
export function foreArmGeo(): THREE.BufferGeometry {
  return new GB()
    .add(limbCap(), '#ffffff', [0, 0, 0], 1, [0, 0, 0], 1)
    .add(P.sphereLo, '#ffffff', [0, -0.5, 0.05], [0.6, 0.2, 0.62], [0, 0, 0], 2)
    .build();
}
export function shinGeo(): THREE.BufferGeometry {
  return new GB()
    .add(limbCap(), '#ffffff', [0, 0.02, 0], 1, [0, 0, 0], 1)
    .add(P.sphereLo, '#ffffff', [0, -0.48, 0.22], [0.5, 0.13, 0.78], [0, 0, 0], 2)
    .add(P.cylLo, '#ffffff', [0, -0.3, 0], [0.54, 0.12, 0.54], [0, 0, 0], 2)
    .build();
}
export function headGeo(): THREE.BufferGeometry {
  return new GB()
    .add(P.sphereHi, '#ffffff', [0, 0, 0], [1, 1.02, 0.98], [0, 0, 0], 1)
    .add(P.cylLo, '#ffffff', [0, -0.95, 0], [0.38, 0.55, 0.38], [0, 0, 0], 1)
    .build();
}

/** Face decal cap (front spherical cap with planar UVs), same as the character rig's. */
export function faceGeo(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 10, 7, Math.PI * 0.5 - 1.05, 2.1, Math.PI * 0.5 - 0.95, 1.9);
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) * 0.62 + 0.5, pos.getY(i) * 0.62 + 0.5);
  uv.needsUpdate = true;
  g.scale(1.02, 1.02, 1.02);
  return g;
}

// ───────────────────────────── hair (head space, tint 1 = hair) ─────────────────────────────

export const HAIR_KINDS = ['short', 'spiky', 'long', 'bun', 'crest'] as const;
export type HairKind = (typeof HAIR_KINDS)[number];

function fringe(b: GB, n: number, spread: number): void {
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) - 0.5;
    b.add(P.cone, '#ffffff', [t * spread, 0.66, 0.7], [0.22, 0.62, 0.15], [Math.PI * 0.62, 0, t * 0.9], 1);
  }
}
export function hairGeo(kind: HairKind): THREE.BufferGeometry {
  const b = new GB();
  if (kind !== 'crest') b.add(P.sphere, '#ffffff', [0, 0.14, -0.08], [1.08, 0.98, 1.06], [0, 0, 0], 1);
  switch (kind) {
    case 'short':
      fringe(b, 4, 1.25);
      b.add(P.sphere, '#ffffff', [0, -0.08, -0.42], [0.95, 0.82, 0.72], [0, 0, 0], 1);
      break;
    case 'spiky':
      fringe(b, 5, 1.3);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2, up = 0.35 + ((i * 37) % 10) / 16;
        b.add(P.cone, '#ffffff', [Math.sin(a) * 0.7, 0.6 + up * 0.3, Math.cos(a) * 0.55 - 0.2], [0.22, 0.65 + up * 0.4, 0.22], [Math.cos(a) * -0.9 - 0.3, 0, Math.sin(a) * 0.9], 1);
      }
      break;
    case 'long':
      fringe(b, 4, 1.2);
      b.add(new THREE.CapsuleGeometry(1, 1, 3, 8), '#ffffff', [0, -0.5, -0.55], [0.92, 0.72, 0.55], [0, 0, 0], 1);
      b.add(P.cone, '#ffffff', [-0.85, -0.25, 0.1], [0.26, 1.3, 0.18], [0.1, 0, -0.12], 1);
      b.add(P.cone, '#ffffff', [0.85, -0.25, 0.1], [0.26, 1.3, 0.18], [0.1, 0, 0.12], 1);
      break;
    case 'bun':
      fringe(b, 4, 1.2);
      b.add(P.sphere, '#ffffff', [0, 0.85, -0.55], [0.46, 0.46, 0.46], [0, 0, 0], 1);
      break;
    case 'crest':
      for (let i = 0; i < 5; i++) b.add(P.cone, '#ffffff', [0, 0.95 - i * 0.03, 0.42 - i * 0.3], [0.15, 0.95, 0.26], [-0.5 - i * 0.2, 0, 0], 1);
      break;
  }
  return b.build();
}

// ───────────────────────────── headgear (head space; 1 = outfit, 2 = outfit2) ─────────────────────────────

export const HEADGEAR_KINDS = ['casco', 'sombrero_alto', 'sombrero_pico', 'capucha', 'corona', 'mitra', 'velo', 'tricornio', 'copa', 'visera', 'turbante'] as const;
export type HeadgearKind = (typeof HEADGEAR_KINDS)[number];

export function headgearGeo(kind: HeadgearKind): THREE.BufferGeometry {
  const b = new GB();
  switch (kind) {
    case 'casco':
      b.add(P.sphere, '#b9b8c2', [0, 0.36, -0.1], [1.12, 0.84, 1.12]);
      b.add(P.cylLo, '#8a8a96', [0, 0.18, -0.06], [1.1, 0.12, 1.1]);
      b.add(P.box, '#8a8a96', [0, 0.05, 1.02], [0.12, 0.55, 0.1]);
      b.add(P.coneLo, '#ffffff', [0, 1.3, -0.1], [0.14, 0.55, 0.14], [0, 0, 0], 2);
      b.add(P.sphereLo, '#ffffff', [0, 1.05, -0.4], [0.16, 0.4, 0.5], [0.6, 0, 0], 2);
      break;
    case 'sombrero_alto':
      b.add(P.cyl, '#ffffff', [0, 0.92, 0], [1.55, 0.06, 1.55], [0, 0, 0], 1);
      b.add(P.cone, '#ffffff', [0, 1.72, -0.06], [0.86, 1.7, 0.86], [-0.14, 0, 0], 1);
      b.add(P.cyl, '#ffffff', [0, 1.05, 0], [0.87, 0.15, 0.87], [0, 0, 0], 2);
      b.add(P.octa, '#ffe8a0', [0, 1.05, 0.86], 0.1, [0, 0, 0], 0, 2.2);
      break;
    case 'sombrero_pico':
      b.add(P.cyl, DARK, [0, 0.92, 0], [1.8, 0.05, 1.8]);
      b.add(P.cone, DARK, [0, 1.68, -0.22], [0.86, 1.75, 0.86], [-0.38, 0, 0.22]);
      b.add(P.cyl, '#6a3a8a', [0, 1.06, 0], [0.88, 0.14, 0.88], [0, 0, 0], 2);
      break;
    case 'capucha':
      b.add(P.sphereHi, '#ffffff', [0, 0.14, -0.32], [1.14, 1.12, 1.05], [0, 0, 0], 1);
      b.add(P.cone, '#ffffff', [0, 0.1, -1.25], [0.5, 0.85, 0.32], [-Math.PI / 2 - 0.4, 0, 0], 1);
      b.add(P.cyl, '#ffffff', [0, -0.72, -0.1], [0.72, 0.18, 0.62], [0, 0, 0], 1);
      break;
    case 'corona':
      b.add(P.cyl, '#e8c04a', [0, 0.98, 0], [0.74, 0.22, 0.74]);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.add(P.cone, '#f5d56a', [Math.sin(a) * 0.68, 1.22, Math.cos(a) * 0.68], [0.1, 0.32, 0.1]); }
      b.add(P.sphere, '#e2455b', [0, 1.0, 0.74], [0.1, 0.1, 0.06], [0, 0, 0], 0, 1.6);
      break;
    case 'mitra':
      b.add(P.cone, '#f4f0e6', [0, 1.45, 0], [0.72, 1.25, 0.56]);
      b.add(P.box, '#ffffff', [0, 1.35, 0.42], [0.12, 0.9, 0.03], [0.3, 0, 0], 2);
      b.add(P.cyl, '#ffffff', [0, 0.88, 0], [0.8, 0.12, 0.7], [0, 0, 0], 2);
      break;
    case 'velo':
      b.add(P.sphereHi, '#ffffff', [0, 0.25, -0.28], [1.1, 1.0, 1.02], [0, 0, 0], 1);
      b.add(P.cyl, '#ffffff', [0, 0.5, -0.05], [1.03, 0.08, 1.03], [0, 0, 0], 2);
      b.add(P.box, '#ffffff', [0, -0.38, 0.93], [1.02, 0.55, 0.03], [0, 0, 0], 1);
      b.add(P.sphere, GOLD, [0, 0.52, 1.0], 0.08);
      break;
    case 'tricornio':
      b.add(P.cyl, DARK, [0, 0.95, 0], [1.45, 0.08, 1.45]);
      b.add(P.cyl, DARK, [0, 1.2, 0], [0.76, 0.45, 0.76]);
      b.add(P.box, GOLD, [0, 0.99, 1.03], [0.95, 0.06, 0.06]);
      b.add(P.sphere, '#ffffff', [0.55, 1.2, 0.2], [0.1, 0.35, 0.1], [0, 0, -0.5], 2);
      break;
    case 'copa':
      b.add(P.cyl, '#16121c', [0, 0.97, 0], [1.28, 0.05, 1.28]);
      b.add(P.cyl, '#16121c', [0, 1.55, 0], [0.74, 1.12, 0.74]);
      b.add(P.cyl, '#ffffff', [0, 1.12, 0], [0.75, 0.17, 0.75], [0, 0, 0], 2);
      break;
    case 'visera':
      b.add(P.cyl, '#1a1420', [0, 0.72, 0], [1.03, 0.15, 1.03]);
      b.add(P.box, '#ffffff', [0, 0.72, 0.95], [0.95, 0.04, 0.62], [0.18, 0, 0], 2);
      break;
    case 'turbante':
      b.add(P.sphere, '#ffffff', [0, 0.85, -0.05], [1.17, 0.68, 1.17], [0, 0, 0], 2);
      b.add(P.sphere, '#ffffff', [0, 1.15, -0.05], [0.8, 0.45, 0.8], [0, 0, 0], 2);
      b.add(P.octa, '#e2455b', [0, 0.95, 1.08], 0.13, [0, 0, 0], 0, 1.5);
      break;
  }
  return b.build();
}

// ───────────────────────────── race extras (head space; 1 = skin, 2 = hair) ─────────────────────────────

export const EXTRA_KINDS = ['ears_round', 'ears_elf', 'ears_goblin', 'ears_fin', 'troll', 'ogre', 'dwarf', 'giant', 'dragon'] as const;
export type ExtraKind = (typeof EXTRA_KINDS)[number];

export function extraGeo(kind: ExtraKind): THREE.BufferGeometry {
  const b = new GB();
  const roundEars = () => {
    b.add(P.sphere, '#ffffff', [-0.98, 0, 0], [0.16, 0.27, 0.2], [0, 0, 0], 1);
    b.add(P.sphere, '#ffffff', [0.98, 0, 0], [0.16, 0.27, 0.2], [0, 0, 0], 1);
  };
  switch (kind) {
    case 'ears_round': roundEars(); break;
    case 'ears_elf':
      b.add(P.cone, '#ffffff', [-1.1, 0.16, -0.08], [0.2, 1.25, 0.12], [0, 0, Math.PI / 2 + 0.35], 1);
      b.add(P.cone, '#ffffff', [1.1, 0.16, -0.08], [0.2, 1.25, 0.12], [0, 0, -Math.PI / 2 - 0.35], 1);
      break;
    case 'ears_goblin':
      b.add(P.cone, '#ffffff', [-1.3, 0.08, 0], [0.5, 1.6, 0.2], [0, 0, Math.PI / 2 + 0.15], 1);
      b.add(P.cone, '#ffffff', [1.3, 0.08, 0], [0.5, 1.6, 0.2], [0, 0, -Math.PI / 2 - 0.15], 1);
      b.add(P.sphere, '#ffffff', [0, -0.05, 1.02], [0.2, 0.24, 0.22], [0, 0, 0], 1);
      break;
    case 'ears_fin':
      b.add(P.cone, '#5ab0c8', [-1.0, 0.02, -0.08], [0.34, 0.75, 0.08], [0, 0, Math.PI / 2 + 0.6]);
      b.add(P.cone, '#5ab0c8', [1.0, 0.02, -0.08], [0.34, 0.75, 0.08], [0, 0, -Math.PI / 2 - 0.6]);
      break;
    case 'troll':
      b.add(P.cone, '#ffffff', [-1.08, 0.22, 0], [0.3, 0.95, 0.12], [0, 0, Math.PI / 2 + 0.6], 1);
      b.add(P.cone, '#ffffff', [1.08, 0.22, 0], [0.3, 0.95, 0.12], [0, 0, -Math.PI / 2 - 0.6], 1);
      b.add(P.cone, BONE, [-0.36, -0.48, 0.84], [0.14, 0.58, 0.14], [-0.3, 0, 0.15]);
      b.add(P.cone, BONE, [0.36, -0.48, 0.84], [0.14, 0.58, 0.14], [-0.3, 0, -0.15]);
      b.add(P.sphere, '#ffffff', [0, -0.05, 1.05], [0.26, 0.2, 0.3], [0, 0, 0], 1);
      break;
    case 'ogre':
      roundEars();
      b.add(P.cone, BONE, [-0.36, -0.5, 0.84], [0.15, 0.38, 0.15], [-0.3, 0, 0.15]);
      b.add(P.cone, BONE, [0.36, -0.5, 0.84], [0.15, 0.38, 0.15], [-0.3, 0, -0.15]);
      b.add(P.sphere, '#ffffff', [0, 0.3, 0.72], [0.75, 0.16, 0.3], [0, 0, 0], 1);
      break;
    case 'dwarf':
      roundEars();
      b.add(P.cone, '#ffffff', [0, -0.78, 0.66], [0.78, 1.25, 0.48], [Math.PI + 0.25, 0, 0], 2);
      b.add(P.sphere, '#ffffff', [0, -0.3, 0.9], [0.55, 0.14, 0.2], [0, 0, 0], 2);
      break;
    case 'giant':
      roundEars();
      b.add(P.sphere, '#ffffff', [0, 0.32, 0.58], [0.82, 0.2, 0.32], [0, 0, 0], 1);
      b.add(P.sphere, '#ffffff', [0, -0.55, 0.62], [0.55, 0.25, 0.35], [0, 0, 0], 1);
      break;
    case 'dragon':
      b.add(P.cone, '#e8dcc0', [-0.5, 0.95, -0.3], [0.24, 0.85, 0.24], [-0.6, 0, 0.3]);
      b.add(P.cone, '#e8dcc0', [0.5, 0.95, -0.3], [0.24, 0.85, 0.24], [-0.6, 0, -0.3]);
      b.add(P.cone, '#ffffff', [0, 0.55, -0.85], [0.18, 0.5, 0.18], [-1.6, 0, 0], 2);
      b.add(P.sphere, '#ffffff', [0, -0.2, 0.85], [0.42, 0.3, 0.4], [0, 0, 0], 1);
      break;
  }
  return b.build();
}

// ───────────────────────────── weapons (hand space) ─────────────────────────────

export const WEAPON_KINDS = ['espada', 'hacha', 'lanza', 'arco', 'ballesta', 'baston', 'daga', 'martillo', 'maza', 'garrote', 'abanico', 'escoba', 'trabuco', 'libro', 'hoz'] as const;
export type WeaponMeshKind = (typeof WEAPON_KINDS)[number];

export function weaponGeo(kind: WeaponMeshKind): THREE.BufferGeometry {
  const b = new GB();
  switch (kind) {
    case 'espada':
      b.add(P.box, STEEL, [0, 0.52, 0], [0.075, 0.82, 0.022]);
      b.add(P.cone, STEEL, [0, 0.98, 0], [0.038, 0.12, 0.012]);
      b.add(P.box, GOLD, [0, 0.1, 0], [0.26, 0.05, 0.07]);
      b.add(P.cylLo, LEATHER, [0, -0.02, 0], [0.03, 0.2, 0.03]);
      b.add(P.sphere, GOLD, [0, -0.13, 0], 0.05);
      break;
    case 'hacha':
      b.add(P.cylLo, WOOD, [0, 0.32, 0], [0.032, 0.95, 0.032]);
      b.add(P.box, STEEL, [0.14, 0.66, 0], [0.26, 0.26, 0.035]);
      b.add(P.cylLo, '#c8ccd6', [0.27, 0.66, 0], [0.13, 0.036, 0.13], [Math.PI / 2, 0, 0]);
      break;
    case 'lanza':
      b.add(P.cylLo, WOOD, [0, 0.5, 0], [0.026, 1.9, 0.026]);
      b.add(P.cone, STEEL, [0, 1.56, 0], [0.065, 0.3, 0.065]);
      b.add(P.box, '#ffffff', [0.06, 1.3, 0], [0.12, 0.2, 0.01], [0, 0, 0.2], 2);
      break;
    case 'arco': {
      const arc = new THREE.TorusGeometry(0.58, 0.032, 5, 14, Math.PI * 0.86).rotateZ(-Math.PI * 0.43).rotateY(-Math.PI / 2).translate(0, 0, -0.58);
      b.raw(arc, WOOD);
      b.add(P.box, '#f0ead8', [0, 0, -0.5], [0.008, 1.12, 0.008]);
      b.add(P.cylLo, LEATHER, [0, 0, 0.0], [0.045, 0.16, 0.045]);
      break;
    }
    case 'ballesta':
      b.add(P.box, WOOD, [0, 0.2, 0], [0.07, 0.55, 0.09]);
      b.add(P.box, '#5a5a66', [0, 0.46, 0], [0.56, 0.045, 0.045]);
      b.add(P.box, '#f0ead8', [0, 0.36, 0], [0.5, 0.01, 0.01]);
      break;
    case 'baston':
      b.add(P.cylLo, WOOD, [0, 0.4, 0], [0.028, 1.55, 0.028]);
      b.add(P.sphere, '#c7a2ff', [0, 1.2, 0], 0.09, [0, 0, 0], 0, 3.2);
      b.add(P.cone, WOOD, [0, 1.1, 0], [0.07, 0.14, 0.07], [Math.PI, 0, 0]);
      break;
    case 'daga':
      b.add(P.box, STEEL, [0, 0.22, 0], [0.045, 0.32, 0.016]);
      b.add(P.box, GOLD, [0, 0.05, 0], [0.12, 0.03, 0.04]);
      b.add(P.cylLo, LEATHER, [0, -0.04, 0], [0.025, 0.12, 0.025]);
      break;
    case 'martillo':
      b.add(P.cylLo, WOOD, [0, 0.3, 0], [0.033, 0.85, 0.033]);
      b.add(P.box, IRON, [0, 0.72, 0], [0.34, 0.2, 0.2]);
      b.add(P.box, '#a8a8b4', [0, 0.72, 0], [0.36, 0.08, 0.21]);
      break;
    case 'maza':
      b.add(P.cylLo, WOOD, [0, 0.28, 0], [0.03, 0.75, 0.03]);
      b.add(P.ico, IRON, [0, 0.66, 0], 0.13);
      break;
    case 'garrote':
      b.add(P.cone, WOOD, [0, 0.46, 0], [0.15, 1.0, 0.15], [Math.PI, 0, 0]);
      b.add(P.sphere, '#6a4a30', [0, 0.92, 0], 0.15);
      break;
    case 'abanico':
      b.add(new THREE.CircleGeometry(0.26, 10, 0, Math.PI), '#ffffff', [0, 0.06, 0], 1, [0, 0, 0], 1);
      b.add(new THREE.CircleGeometry(0.26, 10, 0, Math.PI), '#ffffff', [0, 0.06, -0.005], 1, [0, Math.PI, 0], 1);
      b.add(P.cylLo, GOLD, [0, -0.02, 0], [0.018, 0.14, 0.018]);
      break;
    case 'escoba':
      b.add(P.cylLo, WOOD, [0, 0.28, 0], [0.024, 1.35, 0.024]);
      b.add(P.cone, '#c8a84a', [0, -0.52, 0], [0.14, 0.42, 0.14]);
      break;
    case 'trabuco':
      b.add(P.box, WOOD, [0, 0.12, 0], [0.07, 0.42, 0.09]);
      b.add(P.cylLo, '#5a5a66', [0, 0.46, 0.02], [0.038, 0.42, 0.038]);
      b.add(P.cone, '#5a5a66', [0, 0.7, 0.02], [0.07, 0.1, 0.07], [Math.PI, 0, 0]);
      break;
    case 'libro':
      b.add(P.box, '#6a2a3a', [0, 0.14, 0.04], [0.24, 0.3, 0.06]);
      b.add(P.box, '#f3ead8', [0, 0.14, 0.04], [0.21, 0.28, 0.065]);
      b.add(P.octa, '#c7a2ff', [0, 0.16, 0.08], 0.05, [0, 0, 0], 0, 2.5);
      break;
    case 'hoz':
      b.add(P.cylLo, WOOD, [0, 0.12, 0], [0.022, 0.38, 0.022]);
      b.raw(new THREE.TorusGeometry(0.17, 0.02, 4, 10, Math.PI * 1.1).rotateZ(-0.2).translate(0.12, 0.32, 0), STEEL);
      break;
  }
  return b.build();
}

// ───────────────────────────── accessories & status models ─────────────────────────────

/** Shield in forearm space: faces +Z, 1 = face color, 2 = rim. */
export function shieldGeo(): THREE.BufferGeometry {
  return new GB()
    .add(P.cyl, '#ffffff', [0, 0, 0.1], [0.25, 0.045, 0.3], [Math.PI / 2, 0, 0], 2)
    .add(P.cyl, '#ffffff', [0, 0, 0.12], [0.21, 0.045, 0.26], [Math.PI / 2, 0, 0], 1)
    .add(P.sphere, GOLD, [0, 0, 0.16], [0.06, 0.06, 0.04])
    .build();
}

/** Robe skirt in pelvis space: y in leg-lengths (0 pelvis → −1 feet), x/z in meters (human). */
export function robeGeo(): THREE.BufferGeometry {
  return new GB()
    .add(new THREE.CylinderGeometry(0.2, 0.34, 0.9, 12, 1, true), '#ffffff', [0, -0.47, 0], 1, [0, 0, 0], 1)
    .add(P.cyl, '#ffffff', [0, -0.9, 0], [0.345, 0.06, 0.345], [0, 0, 0], 2)
    .add(P.cyl, '#ffffff', [0, -0.03, 0], [0.21, 0.08, 0.21], [0, 0, 0], 1)
    .build();
}

/** Captain war banner on the back (torso space, meters for a human). 1 = flag (team color). */
export function bannerGeo(): THREE.BufferGeometry {
  return new GB()
    .add(P.cylLo, WOOD, [0, 1.0, -0.2], [0.025, 2.2, 0.025])
    .add(P.box, '#ffffff', [-0.27, 1.8, -0.2], [0.5, 0.36, 0.02], [0, 0, 0], 1)
    .add(P.cone, '#ffffff', [-0.27, 1.52, -0.2], [0.25, 0.2, 0.02], [Math.PI, 0, 0], 1)
    .add(P.sphere, GOLD, [0, 2.12, -0.2], 0.055, [0, 0, 0], 0, 1.4)
    .build();
}

export function toadGeo(): THREE.BufferGeometry {
  const green = '#5aa04a', light = '#c8e08a';
  return new GB()
    .add(P.sphereHi, green, [0, 0.3, 0], [0.46, 0.32, 0.5])
    .add(P.sphere, light, [0, 0.23, 0.12], [0.36, 0.22, 0.42])
    .add(P.sphere, green, [-0.2, 0.55, 0.26], 0.14).add(P.sphere, green, [0.2, 0.55, 0.26], 0.14)
    .add(P.sphere, '#fffaf2', [-0.2, 0.58, 0.34], 0.085).add(P.sphere, '#fffaf2', [0.2, 0.58, 0.34], 0.085)
    .add(P.sphere, '#150b1f', [-0.2, 0.59, 0.4], 0.05).add(P.sphere, '#150b1f', [0.2, 0.59, 0.4], 0.05)
    .add(P.sphere, green, [-0.36, 0.12, -0.14], [0.18, 0.12, 0.3]).add(P.sphere, green, [0.36, 0.12, -0.14], [0.18, 0.12, 0.3])
    .add(P.sphere, green, [-0.26, 0.08, 0.34], [0.1, 0.07, 0.14]).add(P.sphere, green, [0.26, 0.08, 0.34], [0.1, 0.07, 0.14])
    .add(P.box, '#3a2a24', [0, 0.33, 0.47], [0.44, 0.02, 0.02])
    .add(P.sphere, '#ff9ab0', [-0.3, 0.38, 0.4], [0.06, 0.04, 0.02]).add(P.sphere, '#ff9ab0', [0.3, 0.38, 0.4], [0.06, 0.04, 0.02])
    .build();
}

export function iceGeo(): THREE.BufferGeometry {
  return new GB()
    .add(P.box, '#bfefff', [0, 0.5, 0], [1, 1, 1], [0, 0.3, 0])
    .add(P.box, '#dff8ff', [0.18, 0.72, 0.1], [0.55, 0.5, 0.6], [0.2, 0.8, 0.1])
    .build();
}

export function markerGeo(): THREE.BufferGeometry {
  return new GB().add(P.octa, '#ff4a5a', [0, 0, 0], [0.16, 0.26, 0.16], [0, 0, 0], 0, 2.6).build();
}
