/**
 * Instanced little TABS-like figures for map parties and Elias's escort (body + head + weapon + one outline hull),
 * plus instanced boats for anything at sea. Rebuilt every frame from simulation state (cheap: < 150 instances).
 */
import * as THREE from 'three';
import type { RaceId } from '../../data/types';
import { toon, outlineMaterial } from '../../render/toon';
import { ModelBuilder, hullGeometry, mergeColored } from './modelKit';
import { tintBrightOnly } from './shaders';

export const RACE_SKIN: Record<RaceId, string> = {
  humano: '#e8bf9c', caballero: '#e0b08a', elfo: '#f6e4d6', enano: '#d99a7a', gigante: '#9a938c', ogro: '#8f9f6a', duende: '#86c250',
  mago: '#e8bf9c', bruja: '#d9e6c8', trol: '#4fa3a0', clerigo: '#f2d3b8', picaro: '#d8a882', sirena: '#bfe8e0', draconido: '#a9483a', excepcion: '#f1e6e0',
};
export const RACE_SCALE: Partial<Record<RaceId, number>> = { gigante: 1.9, ogro: 1.45, duende: 0.72, enano: 0.85, trol: 1.2, elfo: 1.05 };

function bodyGeo(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.cyl('#ffffff', [-0.09, 0, 0], 0.06, 0.07, 0.42, 6);
  b.cyl('#ffffff', [0.09, 0, 0], 0.06, 0.07, 0.42, 6);
  b.cyl('#ffffff', [0, 0.38, 0], 0.2, 0.25, 0.46, 8);
  b.cyl('#ffffff', [-0.26, 0.5, 0], 0.05, 0.06, 0.34, 5, [0, 0, 0.25]);
  b.cyl('#ffffff', [0.26, 0.5, 0], 0.05, 0.06, 0.34, 5, [0, 0, -0.25]);
  b.box('#b0b0b0', [0, 0.47, 0], [0.44, 0.07, 0.3]);
  return mergeColored(b.solid)!;
}
function headGeo(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.sphere('#ffffff', [0, 1.02, 0], 0.2, true);
  return mergeColored(b.solid)!;
}
function gearGeo(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.cyl('#5a4030', [0.3, 0.2, 0.08], 0.02, 0.025, 1.15, 4);
  b.cone('#c9c9d9', [0.3, 1.33, 0.08], 0.05, 0.16, 4);
  return mergeColored(b.solid)!;
}
function boatGeo(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.box('#8a5a32', [0, 0.1, 0], [0.7, 0.3, 1.8]);
  b.box('#8a5a32', [0, 0.14, 0.98], [0.46, 0.26, 0.4], [0, Math.PI / 4, 0]);
  b.box('#c9a878', [0, 0.26, 0], [0.58, 0.04, 1.6]);
  b.cyl('#5a4030', [0, 0.26, -0.1], 0.03, 0.04, 1.7, 5);
  b.box('#ffffff', [0, 1.1, -0.05], [0.04, 1.1, 0.95]);
  return mergeColored(b.solid)!;
}

class Layer {
  readonly mesh: THREE.InstancedMesh;
  count = 0;
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, color = true) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (color) { this.mesh.setColorAt(0, new THREE.Color(1, 1, 1)); this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage); }
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.count = 0;
  }
}

export class FigureField {
  readonly group = new THREE.Group();
  private body: Layer; private head: Layer; private gear: Layer; private hull: Layer;
  private boat: Layer; private boatHull: Layer;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler();
  private v = new THREE.Vector3(); private s = new THREE.Vector3(); private c = new THREE.Color();

  constructor(readonly capacity = 220) {
    const mat = tintBrightOnly(toon('#ffffff', { vertexColors: true, bands: [0.5, 0.8, 1.0], unique: true }));
    const bg = bodyGeo(), hg = headGeo();
    this.body = new Layer(bg, mat, capacity);
    this.head = new Layer(hg, mat, capacity);
    this.gear = new Layer(gearGeo(), toon('#ffffff', { vertexColors: true }), capacity, false);
    const hullSrc = mergeColored([bg.clone(), hg.clone()])!;
    this.hull = new Layer(hullGeometry(hullSrc), outlineMaterial(0.028), capacity, false);
    this.hull.mesh.castShadow = false;
    const boat = boatGeo();
    this.boat = new Layer(boat, mat, 64);
    this.boatHull = new Layer(hullGeometry(boat), outlineMaterial(0.035), 64, false);
    this.boatHull.mesh.castShadow = false;
    for (const l of [this.body, this.head, this.gear, this.hull, this.boat, this.boatHull]) this.group.add(l.mesh);
  }

  begin(): void { this.body.count = this.head.count = this.gear.count = this.hull.count = this.boat.count = this.boatHull.count = 0; }

  /** One little figure. `walk` 0..1 drives the TABS wobble; `phase` desyncs figures. */
  add(x: number, y: number, z: number, yaw: number, scale: number, tunic: string, skin: string, walk: number, phase: number, armed = true): void {
    if (this.body.count >= this.capacity) return;
    const bob = Math.abs(Math.sin(phase)) * 0.12 * walk;
    const tilt = Math.sin(phase) * 0.16 * walk;
    this.e.set(walk * 0.08, yaw, tilt, 'YXZ');
    this.q.setFromEuler(this.e);
    this.m.compose(this.v.set(x, y + bob * scale, z), this.q, this.s.setScalar(scale));
    const i = this.body.count++;
    this.body.mesh.setMatrixAt(i, this.m); this.body.mesh.setColorAt(i, this.c.set(tunic));
    this.head.mesh.setMatrixAt(i, this.m); this.head.mesh.setColorAt(i, this.c.set(skin));
    this.hull.mesh.setMatrixAt(i, this.m);
    this.head.count = this.hull.count = this.body.count;
    if (armed) this.gear.mesh.setMatrixAt(this.gear.count++, this.m);
  }

  addBoat(x: number, y: number, z: number, yaw: number, scale: number, sail: string, t: number): void {
    if (this.boat.count >= 64) return;
    this.e.set(Math.sin(t * 1.7) * 0.06, yaw, Math.sin(t * 1.3 + 1) * 0.08, 'YXZ');
    this.q.setFromEuler(this.e);
    this.m.compose(this.v.set(x, y + Math.sin(t * 2.1) * 0.06, z), this.q, this.s.setScalar(scale));
    const i = this.boat.count++;
    this.boat.mesh.setMatrixAt(i, this.m); this.boat.mesh.setColorAt(i, this.c.set(sail));
    this.boatHull.mesh.setMatrixAt(this.boatHull.count++, this.m);
  }

  end(): void {
    for (const l of [this.body, this.head, this.gear, this.hull, this.boat, this.boatHull]) {
      l.mesh.count = l.count;
      l.mesh.instanceMatrix.needsUpdate = true;
      if (l.mesh.instanceColor) l.mesh.instanceColor.needsUpdate = true;
    }
  }
}
