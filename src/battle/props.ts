/**
 * Environment prop geometries (merged, vertex-colored; aTint 1 = per-instance color variation).
 * Built at ~1 m ≈ 1 unit, origin at the base, +Y up.
 */
import * as THREE from 'three';
import { GB, PRIM as P } from './geo';

export type PropKind =
  | 'tree' | 'pine' | 'palm' | 'deadtree' | 'colossal' | 'rock' | 'boulders' | 'crystal' | 'mushroom' | 'column' | 'brokencolumn'
  | 'arch' | 'statue' | 'banner' | 'torch' | 'reeds' | 'bush' | 'wheat' | 'fence' | 'tower' | 'spectator' | 'grass' | 'flower'
  | 'floatrock' | 'windmill' | 'tent' | 'crate';

const WOOD = '#6a4a30', DWOOD = '#4a3424', STONE = '#9a948a', MARBLE = '#ece6d8', GOLD = '#d9b36c';

export function propGeo(kind: PropKind): THREE.BufferGeometry {
  const b = new GB();
  switch (kind) {
    case 'tree':
      b.add(P.cylLo, WOOD, [0, 1.1, 0], [0.28, 2.2, 0.28]);
      b.add(P.ico1, '#ffffff', [0, 3.2, 0], [1.9, 1.7, 1.9], [0, 0, 0], 1);
      b.add(P.ico1, '#ffffff', [0.9, 2.6, 0.4], [1.2, 1.1, 1.2], [0, 0, 0], 1);
      b.add(P.ico1, '#ffffff', [-0.8, 2.8, -0.5], [1.3, 1.2, 1.3], [0, 0, 0], 1);
      break;
    case 'pine':
      b.add(P.cylLo, DWOOD, [0, 0.8, 0], [0.22, 1.6, 0.22]);
      b.add(P.cone, '#ffffff', [0, 2.2, 0], [1.6, 2.2, 1.6], [0, 0, 0], 1);
      b.add(P.cone, '#ffffff', [0, 3.3, 0], [1.25, 1.9, 1.25], [0, 0, 0], 1);
      b.add(P.cone, '#ffffff', [0, 4.3, 0], [0.85, 1.6, 0.85], [0, 0, 0], 1);
      break;
    case 'palm': {
      let x = 0, y = 0;
      for (let i = 0; i < 5; i++) { const nx = x + 0.18 * i * 0.3, ny = y + 1.0; b.add(P.cylLo, '#8a6a44', [(x + nx) / 2, (y + ny) / 2, 0], [0.2 - i * 0.02, 1.05, 0.2 - i * 0.02], [0, 0, -0.06 * i]); x = nx; y = ny; }
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; b.add(P.cone, '#ffffff', [x + Math.cos(a) * 1.1, y - 0.15, Math.sin(a) * 1.1], [0.5, 2.4, 0.12], [Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25], 1); }
      b.add(P.sphere, '#6a4a2a', [x, y - 0.25, 0.2], 0.2);
      break;
    }
    case 'deadtree':
      b.add(P.cylLo, '#3a3034', [0, 1.4, 0], [0.26, 2.8, 0.26], [0, 0, 0.08]);
      b.add(P.cylLo, '#3a3034', [0.5, 2.4, 0], [0.1, 1.4, 0.1], [0, 0, -0.9]);
      b.add(P.cylLo, '#3a3034', [-0.4, 2.1, 0.2], [0.09, 1.1, 0.09], [0.3, 0, 0.9]);
      b.add(P.cylLo, '#3a3034', [0.1, 3.0, -0.3], [0.07, 1.0, 0.07], [-0.7, 0, 0.2]);
      break;
    case 'colossal':
      b.add(P.cyl, '#5a3f2a', [0, 7, 0], [2.2, 14, 2.2]);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; b.add(P.cone, '#5a3f2a', [Math.cos(a) * 2.2, 0.8, Math.sin(a) * 2.2], [0.9, 3, 0.9], [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9]); }
      b.add(P.ico1, '#ffffff', [0, 16, 0], [7, 4.5, 7], [0, 0, 0], 1);
      b.add(P.ico1, '#ffffff', [4, 14, 2], [4.5, 3.2, 4.5], [0, 0, 0], 1);
      b.add(P.ico1, '#ffffff', [-4, 14.5, -2], [4.8, 3.5, 4.8], [0, 0, 0], 1);
      break;
    case 'rock':
      b.add(P.dodeca, '#ffffff', [0, 0.35, 0], [1.1, 0.75, 0.95], [0.2, 0.5, 0.1], 1);
      break;
    case 'boulders':
      b.add(P.dodeca, '#ffffff', [0, 0.6, 0], [1.4, 1.1, 1.2], [0.3, 0.2, 0], 1);
      b.add(P.dodeca, '#ffffff', [1.4, 0.35, 0.4], [0.8, 0.6, 0.7], [0.5, 1, 0.2], 1);
      b.add(P.dodeca, '#ffffff', [-1.1, 0.3, 0.6], [0.6, 0.5, 0.6], [0.1, 2, 0.3], 1);
      break;
    case 'crystal':
      b.add(P.octa, '#ffffff', [0, 1.0, 0], [0.45, 1.3, 0.45], [0, 0, 0.1], 1, 2.4);
      b.add(P.octa, '#ffffff', [0.45, 0.6, 0.2], [0.28, 0.8, 0.28], [0.2, 0, -0.5], 1, 2.4);
      b.add(P.octa, '#ffffff', [-0.35, 0.5, -0.2], [0.25, 0.65, 0.25], [-0.2, 0, 0.6], 1, 2.4);
      b.add(P.dodeca, '#5a5060', [0, 0.1, 0], [0.8, 0.3, 0.7]);
      break;
    case 'mushroom':
      b.add(P.cyl, '#efe6d0', [0, 0.6, 0], [0.18, 1.2, 0.18]);
      b.add(P.sphereHi, '#ffffff', [0, 1.25, 0], [0.9, 0.45, 0.9], [0, 0, 0], 1);
      for (let i = 0; i < 5; i++) { const a = i * 1.3; b.add(P.sphere, '#fff7e8', [Math.cos(a) * 0.5, 1.45, Math.sin(a) * 0.5], [0.12, 0.06, 0.12]); }
      break;
    case 'column':
      b.add(P.box, MARBLE, [0, 0.2, 0], [1.2, 0.4, 1.2]);
      b.add(P.cyl, MARBLE, [0, 3.2, 0], [0.42, 5.6, 0.42]);
      b.add(P.box, MARBLE, [0, 6.1, 0], [1.1, 0.35, 1.1]);
      b.add(P.cyl, GOLD, [0, 5.85, 0], [0.46, 0.12, 0.46]);
      break;
    case 'brokencolumn':
      b.add(P.box, STONE, [0, 0.2, 0], [1.2, 0.4, 1.2], [0, 0.3, 0], 1);
      b.add(P.cyl, '#ffffff', [0, 1.5, 0], [0.42, 2.4, 0.42], [0.05, 0, 0.08], 1);
      b.add(P.cyl, '#ffffff', [1.6, 0.35, 0.4], [0.42, 1.6, 0.42], [0, 0.4, Math.PI / 2], 1);
      break;
    case 'arch':
      b.add(P.box, '#ffffff', [-2, 2.2, 0], [0.9, 4.4, 0.9], [0, 0, 0], 1);
      b.add(P.box, '#ffffff', [2, 2.2, 0], [0.9, 4.4, 0.9], [0, 0, 0], 1);
      b.add(P.box, '#ffffff', [0, 4.7, 0], [5, 0.7, 1], [0, 0, 0.03], 1);
      break;
    case 'statue':
      b.add(P.box, MARBLE, [0, 0.6, 0], [1.4, 1.2, 1.4]);
      b.add(P.capsule, MARBLE, [0, 2.3, 0], [0.45, 0.9, 0.35]);
      b.add(P.sphere, MARBLE, [0, 3.35, 0], 0.32);
      b.add(P.cyl, MARBLE, [0.45, 3.1, 0], [0.05, 1.8, 0.05], [0, 0, -0.3]);
      b.add(P.octa, GOLD, [0.72, 4.0, 0], 0.18, [0, 0, 0], 0, 1.6);
      break;
    case 'banner':
      b.add(P.cylLo, DWOOD, [0, 2.2, 0], [0.07, 4.4, 0.07]);
      b.add(P.box, '#ffffff', [0.55, 3.6, 0], [1.0, 1.4, 0.04], [0, 0, 0], 1);
      b.add(P.cone, '#ffffff', [0.55, 2.7, 0], [0.5, 0.45, 0.04], [Math.PI, 0, 0], 1);
      b.add(P.sphere, GOLD, [0, 4.45, 0], 0.1);
      break;
    case 'torch':
      b.add(P.cylLo, DWOOD, [0, 1.0, 0], [0.07, 2.0, 0.07]);
      b.add(P.cyl, '#3a3034', [0, 2.05, 0], [0.16, 0.18, 0.16]);
      b.add(P.cone, '#ffcf5a', [0, 2.42, 0], [0.16, 0.5, 0.16], [0, 0, 0], 0, 3);
      b.add(P.cone, '#ff6a2a', [0, 2.32, 0], [0.12, 0.34, 0.12], [0, 0, 0], 0, 2.4);
      break;
    case 'reeds':
      for (let i = 0; i < 6; i++) { const a = i * 1.1; b.add(P.coneLo, '#ffffff', [Math.cos(a) * 0.25, 0.7, Math.sin(a) * 0.25], [0.04, 1.4 + (i % 3) * 0.3, 0.04], [Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12], 1); }
      b.add(P.capsule, '#6a4a2a', [0.1, 1.5, 0], [0.05, 0.18, 0.05]);
      break;
    case 'bush':
      b.add(P.ico1, '#ffffff', [0, 0.55, 0], [0.9, 0.7, 0.9], [0, 0, 0], 1);
      b.add(P.ico1, '#ffffff', [0.6, 0.4, 0.2], [0.6, 0.5, 0.6], [0, 0, 0], 1);
      b.add(P.ico1, '#ffffff', [-0.5, 0.38, -0.2], [0.55, 0.45, 0.55], [0, 0, 0], 1);
      break;
    case 'wheat':
      for (let i = 0; i < 9; i++) { const a = i * 2.4, r = 0.2 + (i % 3) * 0.25; b.add(P.coneLo, '#ffffff', [Math.cos(a) * r, 0.5, Math.sin(a) * r], [0.07, 1.0 + (i % 2) * 0.2, 0.07], [0, a, 0], 1); }
      break;
    case 'fence':
      b.add(P.box, WOOD, [-1.2, 0.5, 0], [0.12, 1.0, 0.12]);
      b.add(P.box, WOOD, [1.2, 0.5, 0], [0.12, 1.0, 0.12]);
      b.add(P.box, '#8a6a44', [0, 0.72, 0], [2.6, 0.1, 0.06]);
      b.add(P.box, '#8a6a44', [0, 0.38, 0], [2.6, 0.1, 0.06]);
      break;
    case 'tower':
      b.add(P.cyl, STONE, [0, 4, 0], [2.2, 8, 2.2]);
      b.add(P.cyl, '#8a847a', [0, 8.2, 0], [2.5, 0.5, 2.5]);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.add(P.box, '#8a847a', [Math.cos(a) * 2.3, 8.8, Math.sin(a) * 2.3], [0.7, 0.8, 0.6], [0, -a, 0]); }
      b.add(P.box, '#2a2024', [0, 1.3, 2.18], [1.2, 2.4, 0.1]);
      break;
    case 'spectator':
      b.add(P.cylLo, '#ffffff', [0, 0.5, 0], [0.24, 0.72, 0.2], [0, 0, 0], 1);
      b.add(P.sphereLo, '#86c250', [0, 1.12, 0], 0.3);
      b.add(P.coneLo, '#86c250', [-0.38, 1.16, 0], [0.12, 0.5, 0.06], [0, 0, Math.PI / 2 + 0.2]);
      b.add(P.coneLo, '#86c250', [0.38, 1.16, 0], [0.12, 0.5, 0.06], [0, 0, -Math.PI / 2 - 0.2]);
      b.add(P.octa, '#fffaf2', [-0.1, 1.18, 0.25], 0.07).add(P.octa, '#fffaf2', [0.1, 1.18, 0.25], 0.07);
      b.add(P.box, '#6a1f30', [0, 1.0, 0.27], [0.16, 0.05, 0.02]);
      break;
    case 'grass':
      b.add(P.coneLo, '#ffffff', [0, 0.22, 0], [0.08, 0.44, 0.08], [0.15, 0, 0.1], 1);
      b.add(P.coneLo, '#ffffff', [0.1, 0.18, 0.05], [0.07, 0.36, 0.07], [-0.2, 0.7, -0.2], 1);
      b.add(P.coneLo, '#ffffff', [-0.08, 0.16, -0.06], [0.07, 0.32, 0.07], [0.1, 1.4, 0.3], 1);
      break;
    case 'flower':
      b.add(P.coneLo, '#4a7a3a', [0, 0.15, 0], [0.02, 0.3, 0.02]);
      b.add(P.octa, '#ffffff', [0, 0.32, 0], [0.1, 0.05, 0.1], [0, 0, 0], 1, 1.2);
      b.add(P.octa, '#ffe066', [0, 0.35, 0], 0.035);
      break;
    case 'floatrock':
      b.add(P.dodeca, '#ffffff', [0, 0, 0], [1.6, 0.9, 1.4], [0.2, 0.5, 0.1], 1);
      b.add(P.cone, '#ffffff', [0, -1.2, 0], [1.1, 1.8, 1.0], [Math.PI, 0, 0], 1);
      b.add(P.octa, '#c77dff', [0.4, 0.8, 0.2], [0.2, 0.5, 0.2], [0, 0, 0.2], 0, 2.6);
      break;
    case 'windmill':
      b.add(P.cyl, '#e8e2d0', [0, 3, 0], [1.6, 6, 1.6]);
      b.add(P.cone, '#8a3a2a', [0, 7, 0], [2.0, 2.2, 2.0]);
      for (let i = 0; i < 4; i++) b.add(P.box, '#e8d8b8', [0, 5.6, 1.9], [0.5, 5.2, 0.08], [0, 0, (i * Math.PI) / 2 + 0.3]);
      b.add(P.box, '#2a2024', [0, 1, 1.58], [1, 2, 0.1]);
      break;
    case 'tent':
      b.add(P.cone, '#ffffff', [0, 1.3, 0], [2.2, 2.6, 2.2], [0, Math.PI / 4, 0], 1);
      b.add(P.cylLo, DWOOD, [0, 2.8, 0], [0.05, 0.6, 0.05]);
      b.add(P.box, '#ffffff', [0.3, 3.0, 0], [0.5, 0.3, 0.02], [0, 0, 0], 1);
      break;
    case 'crate':
      b.add(P.box, '#8a6a44', [0, 0.4, 0], [0.8, 0.8, 0.8]);
      b.add(P.box, WOOD, [0, 0.4, 0], [0.84, 0.12, 0.84]);
      break;
  }
  return b.build();
}

/** Props that block movement (collision radius factor × instance scale). */
export const PROP_COLLIDE: Partial<Record<PropKind, number>> = {
  tree: 0.5, pine: 0.45, palm: 0.35, deadtree: 0.4, colossal: 2.6, rock: 0.9, boulders: 1.6, crystal: 0.6, mushroom: 0.35,
  column: 0.65, brokencolumn: 0.7, statue: 0.8, tower: 2.4, windmill: 1.8, tent: 1.8, crate: 0.5,
};
/** Props without outlines (tiny or foliage-like). */
export const PROP_NO_OUTLINE = new Set<PropKind>(['grass', 'flower', 'wheat', 'reeds']);
