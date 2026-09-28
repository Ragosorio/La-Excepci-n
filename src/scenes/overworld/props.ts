/**
 * Instanced vegetation & rocks scattered by biome (one draw call per type). Trees sway with the wind and
 * wither violet when their continent is corrupted (shared world shader injection).
 */
import * as THREE from 'three';
import { LOCATION_LIST } from '../../data/world';
import { CONT_ORDER, MAP_MAX, MAP_MIN, getGeo, heightAt, roadSegments, segDist, slopeAt, GRID_N } from '../../systems/world/geo';
import { fbm, hash2 } from '../../systems/world/noise';
import { toon } from '../../render/toon';
import { ModelBuilder, mergeColored } from './modelKit';
import { injectWorld } from './shaders';

type Kind = 'round' | 'pine' | 'colossal' | 'palm' | 'dead' | 'rock' | 'bush' | 'reeds' | 'cypress' | 'shroom' | 'crystal';

function kindGeometry(k: Kind): THREE.BufferGeometry {
  const b = new ModelBuilder();
  switch (k) {
    case 'round':
      b.cyl('#6a4a30', [0, 0, 0], 0.09, 0.14, 0.7, 6);
      b.sphere('#ffffff', [0, 1.05, 0], [0.62, 0.55, 0.62]); b.sphere('#f2f2f2', [0.3, 0.8, 0.12], 0.36); b.sphere('#e8e8e8', [-0.24, 0.86, -0.18], 0.34);
      break;
    case 'pine':
      b.cyl('#5a3f2a', [0, 0, 0], 0.08, 0.12, 0.5, 6);
      b.cone('#ffffff', [0, 0.35, 0], 0.62, 1.0, 7); b.cone('#f0f0f0', [0, 0.95, 0], 0.46, 0.85, 7); b.cone('#e6e6e6', [0, 1.5, 0], 0.3, 0.65, 7);
      break;
    case 'colossal':
      b.cyl('#7a5a3a', [0, 0, 0], 0.32, 0.55, 3.8, 8);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; b.cyl('#6a4a30', [Math.sin(a) * 0.45, 0, Math.cos(a) * 0.45], 0.06, 0.2, 0.7, 5, [Math.cos(a) * 0.6, 0, -Math.sin(a) * 0.6]); }
      b.sphere('#ffffff', [0, 4.4, 0], [1.9, 1.35, 1.9]); b.sphere('#f0f0f0', [1.1, 3.9, 0.5], 1.1); b.sphere('#e8e8e8', [-1.0, 4.0, -0.5], 1.15); b.sphere('#f6f6f6', [0.2, 5.2, -0.3], 1.0);
      break;
    case 'palm':
      b.cyl('#9a7a4a', [0, 0, 0], 0.07, 0.11, 1.6, 6, [0.15, 0, 0.08]);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.box('#ffffff', [Math.sin(a) * 0.42 + 0.22, 1.58, Math.cos(a) * 0.42 + 0.12], [0.16, 0.04, 0.9], [0.4, a, 0]); }
      b.sphere('#6a4a30', [0.22, 1.5, 0.12], 0.1);
      break;
    case 'dead':
      b.cyl('#ffffff', [0, 0, 0], 0.06, 0.13, 1.3, 5, [0.12, 0, -0.1]);
      b.box('#f0f0f0', [0.22, 0.95, 0], [0.5, 0.06, 0.06], [0, 0, 0.7]);
      b.box('#ececec', [-0.18, 0.7, 0.06], [0.4, 0.05, 0.05], [0, 0.5, -0.8]);
      b.box('#e6e6e6', [0.02, 1.25, -0.12], [0.3, 0.04, 0.04], [0.6, 1.2, 0.5]);
      break;
    case 'rock':
      b.sphere('#ffffff', [0, 0.12, 0], [0.55, 0.42, 0.48]); b.sphere('#e8e8e8', [0.35, 0.05, 0.2], [0.3, 0.25, 0.28]);
      break;
    case 'bush':
      b.sphere('#ffffff', [0, 0.22, 0], [0.42, 0.32, 0.42]); b.sphere('#f0f0f0', [0.26, 0.16, 0.1], 0.25);
      break;
    case 'reeds':
      for (let i = 0; i < 5; i++) { const a = i * 1.3; b.cone('#ffffff', [Math.sin(a) * 0.15, 0, Math.cos(a) * 0.15], 0.04, 0.7 + (i % 2) * 0.3, 4, [Math.sin(a) * 0.15, 0, Math.cos(a) * 0.15]); }
      break;
    case 'cypress':
      b.cyl('#6a4a30', [0, 0, 0], 0.06, 0.08, 0.3, 5);
      b.sphere('#ffffff', [0, 1.1, 0], [0.32, 1.0, 0.32]);
      break;
    case 'shroom':
      b.cyl('#efe6d8', [0, 0, 0], 0.07, 0.1, 0.35, 6);
      b.sphere('#ffffff', [0, 0.38, 0], [0.3, 0.16, 0.3]);
      break;
    case 'crystal':
      b.crystal('#ffffff', [0, 0.3, 0], 0.16, 0.45, [0.2, 0, 0.15]);
      b.crystal('#ffffff', [0.18, 0.18, 0.08], 0.1, 0.28, [-0.3, 1, 0.3]);
      break;
  }
  const list = k === 'crystal' ? b.glow : b.solid;
  return mergeColored(list)!;
}

interface Inst { x: number; y: number; z: number; s: number; r: number; c: THREE.Color; ci: number }

const TINTS: Record<Kind, string[]> = {
  round: ['#6f9a42', '#7fa84a', '#5f8a3a', '#9aa84a', '#c9a24a'],
  pine: ['#2f6a3a', '#3f7a42', '#35603a'],
  colossal: ['#8ac25a', '#b9c85a', '#e0c85a', '#6fb54a'],
  palm: ['#3fae5a', '#4fbf62', '#2f9a4a'],
  dead: ['#4a3f44', '#3f3438', '#5a4a52'],
  rock: ['#8a8378', '#7a746a', '#9a948a', '#6a625a'],
  bush: ['#5f9a42', '#6fae4a', '#4f8a3a'],
  reeds: ['#8a9a5a', '#7a8a4a', '#a0a060'],
  cypress: ['#2f5a3a', '#3a6a42'],
  shroom: ['#9b5cff', '#c77dff', '#7fe3ff'],
  crystal: ['#ffb070', '#ff9a50', '#ffd0a0'],
};

export class PropField {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];

  /** Whole map by default; with `region`, only a window re-centered and scaled (location backdrops). */
  constructor(region?: { cx: number; cz: number; half: number; scale: number; clearRadius?: number }) {
    const byKind = new Map<Kind, Inst[]>();
    const S = region?.scale ?? 1, CX = region?.cx ?? 0, CZ = region?.cz ?? 0;
    const add = (k: Kind, x: number, z: number, s: number, ci: number, tintSeed: number) => {
      const t = TINTS[k];
      const c = new THREE.Color(t[Math.floor(tintSeed * t.length) % t.length]);
      let arr = byKind.get(k);
      if (!arr) { arr = []; byKind.set(k, arr); }
      arr.push({ x: (x - CX) * S, y: (heightAt(x, z) - 0.05) * S, z: (z - CZ) * S, s: s * S, r: tintSeed * 12.7, c, ci });
    };
    const roads = roadSegments();
    const geo = getGeo();
    const step = region ? 1.3 : 1.9;
    const x0 = region ? CX - region.half : MAP_MIN + 2, x1 = region ? CX + region.half : MAP_MAX - 2;
    const z0 = region ? CZ - region.half : MAP_MIN + 2, z1 = region ? CZ + region.half : MAP_MAX - 2;
    const clear = region?.clearRadius ?? 7;
    for (let gz = z0; gz < z1; gz += step) {
      for (let gx = x0; gx < x1; gx += step) {
        const hx = hash2(gx * 13, gz * 7), hz = hash2(gx * 5 + 3, gz * 11 - 1), hp = hash2(gx * 3 - 9, gz * 17 + 4);
        const x = gx + (hx - 0.5) * step * 0.9, z = gz + (hz - 0.5) * step * 0.9;
        const h = heightAt(x, z);
        if (h < 0.3) continue;
        const i = Math.round(x - MAP_MIN), j = Math.round(z - MAP_MIN);
        const ci = geo.conts[Math.max(0, Math.min(GRID_N - 1, j)) * GRID_N + Math.max(0, Math.min(GRID_N - 1, i))];
        if (geo.glow[Math.max(0, Math.min(GRID_N - 1, j)) * GRID_N + Math.max(0, Math.min(GRID_N - 1, i))] > 0.05) continue;
        let near = false;
        for (const l of LOCATION_LIST) if (Math.abs(l.pos.x - x) < clear + 0.5 && Math.abs(l.pos.z - z) < clear + 0.5 && Math.hypot(l.pos.x - x, l.pos.z - z) < clear) { near = true; break; }
        if (near) continue;
        let onRoad = false;
        for (const s of roads) if (segDist(x, z, s[0], s[1], s[2], s[3]) < 1.5) { onRoad = true; break; }
        if (onRoad) continue;
        const slope = slopeAt(x, z);
        const f = fbm(x * 0.05 + 11, z * 0.05 - 5, 2);
        const cont = CONT_ORDER[ci];
        const size = 0.8 + hp * 0.6;
        switch (cont) {
          case 'valdoria':
            if (f > 0.6) { if (hp < 0.75) add('round', x, z, size * 1.1, ci, hx); }
            else if (hp < 0.035) add('round', x, z, size, ci, hz);
            else if (hp < 0.07) add('bush', x, z, size, ci, hx);
            else if (slope > 0.6 && hp < 0.3) add('rock', x, z, size * 0.8, ci, hz);
            break;
          case 'sylvaria':
            if (f < 0.34 && hp < 0.85) break;   // glades
            if (hp < 0.12) add('colossal', x, z, 0.55 + hx * 0.35, ci, hz);
            else if (hp < 0.55) add('round', x, z, size * 1.2, ci, hx);
            else if (hp < 0.85) add('pine', x, z, size * 1.25, ci, hz);
            break;
          case 'kharaz':
            if (h > 15) break;
            if (h < 8 && hp < 0.3 && slope < 1.2) add('pine', x, z, size * 1.1, ci, hx);
            else if (hp < 0.5) add('rock', x, z, size * (1 + slope * 0.4), ci, hz);
            else if (hp < 0.53) add('crystal', x, z, size, ci, hx);
            break;
          case 'morvenna':
            if (h < 0.95 && hp < 0.4) add('reeds', x, z, size, ci, hx);
            else if (hp < 0.22) add('dead', x, z, size * 1.2, ci, hz);
            else if (hp < 0.29) add('shroom', x, z, size * 0.9, ci, hx);
            else if (hp < 0.34) add('rock', x, z, size * 0.7, ci, hz);
            break;
          case 'islas':
            if (h < 2.2 && hp < 0.3) add('palm', x, z, size, ci, hx);
            else if (h >= 2.2 && h < 5.5 && hp < 0.42) add(hp < 0.2 ? 'round' : 'bush', x, z, size * 1.05, ci, hz);
            else if (h >= 5.5 && hp < 0.3) add('rock', x, z, size, ci, hx);
            break;
          default:
            if (hp < 0.06) add('cypress', x, z, size, ci, hx);
            else if (hp < 0.11) add('round', x, z, size * 0.8, ci, hz);
            break;
        }
      }
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    for (const [k, list] of byKind) {
      if (!list.length) continue;
      const g = kindGeometry(k);
      const cont = new Float32Array(list.length);
      list.forEach((it, i) => { cont[i] = it.ci; });
      g.setAttribute('aCont', new THREE.InstancedBufferAttribute(cont, 1));
      let mat: THREE.Material;
      if (k === 'crystal') {
        mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 1.7, 1.7), vertexColors: true });
      } else {
        const tm = toon('#ffffff', { vertexColors: true, bands: [0.5, 0.78, 1.0], unique: true, emissive: k === 'shroom' ? '#4a1a7a' : undefined, emissiveIntensity: k === 'shroom' ? 0.7 : 0 });
        const wind = k === 'rock' ? 0 : k === 'colossal' ? 0.35 : k === 'reeds' ? 1.6 : k === 'palm' ? 1.0 : 0.8;
        mat = injectWorld(tm, { cont: true, wind, corrStrength: k === 'rock' ? 0.6 : 1, canopyTint: true });
      }
      const mesh = new THREE.InstancedMesh(g, mat, list.length);
      list.forEach((it, i) => {
        e.set(0, it.r, 0); q.setFromEuler(e);
        m4.compose(v.set(it.x, it.y, it.z), q, sc.setScalar(it.s));
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, it.c);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = k !== 'reeds' && k !== 'crystal';
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      mesh.name = `props:${k}`;
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
  }

  get count(): number { return this.meshes.reduce((s, m) => s + m.count, 0); }
}
