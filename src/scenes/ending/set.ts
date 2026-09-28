/**
 * The ending set: Concordia in ruins at the edge of the void. Broken white marble, floating debris, ash rising,
 * an eclipse in the sky. Old Aurel kneels; Bruma sits beside him, calm. Elias stands.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, outlineMaterial } from '../../render/toon';
import { buildCharacter, type CharacterRig } from '../../characters/rig';
import { Eclipse, driftPoints } from '../title/eclipse';
import { Dog } from '../prologue/dog';

function colored(g: THREE.BufferGeometry, color: string, m: THREE.Matrix4): THREE.BufferGeometry {
  const c = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m);
  const col = new THREE.Color(color);
  const n = c.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
  c.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (c.getAttribute('uv')) c.deleteAttribute('uv');
  return c;
}
const M = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

interface Floater { mesh: THREE.Mesh; base: THREE.Vector3; spin: THREE.Vector3; ph: number; rise: number }

export class EndingSet {
  readonly group = new THREE.Group();
  readonly aurel: CharacterRig;
  readonly dog: Dog;
  elias: CharacterRig;
  readonly eclipse: Eclipse;
  readonly aurelPos = new THREE.Vector3(0, 0, 0);
  readonly eliasStart = new THREE.Vector3(0, 0, 9);
  private ash: ReturnType<typeof driftPoints>;
  private motes: ReturnType<typeof driftPoints>;
  private floaters: Floater[] = [];
  private disposables: Array<{ dispose(): void }> = [];
  private t = 0;

  constructor(private scene: THREE.Scene) {
    scene.add(this.group);
    this.buildPlaza();
    this.eclipse = new Eclipse({ radius: 2.6, intensity: 1.1 });
    this.eclipse.group.position.set(-40, 44, -120);
    this.eclipse.group.scale.setScalar(6.5);
    this.eclipse.group.lookAt(0, 4, 10);
    this.group.add(this.eclipse.group);
    this.ash = driftPoints(520, 'ash', new THREE.Vector3(60, 26, 60), 0.6, 1.8);
    this.ash.points.position.set(0, 10, 0);
    this.motes = driftPoints(160, 'motes', new THREE.Vector3(50, 22, 50), 0.35, 1.0, ['#e9dcff', '#9b5cff']);
    this.motes.points.position.set(0, 9, 0);
    this.group.add(this.ash.points, this.motes.points);

    this.aurel = buildCharacter({ seed: 'aurel_old', race: 'humano', special: 'aurel_old', age: 'old' });
    this.aurel.root.position.copy(this.aurelPos);
    this.aurel.root.rotation.y = 0;          // faces +z, toward where Elias arrives
    this.aurel.pose = 'kneel';
    this.aurel.setExpression('sleep');
    this.group.add(this.aurel.root);
    this.dog = new Dog(0.92);
    this.dog.root.position.set(-1.0, 0, 0.35);
    this.dog.root.rotation.y = 0.35;
    this.dog.pose = 'sit';
    this.dog.wag = 0.35;
    this.group.add(this.dog.root);
    this.elias = buildCharacter({ seed: 'elias', race: 'excepcion', special: 'elias' });
    this.elias.root.position.copy(this.eliasStart);
    this.elias.root.rotation.y = Math.PI;
    this.group.add(this.elias.root);
    // a pale light over the hero: the only warm thing left in Concordia
    this.spot = new THREE.PointLight('#f3e6ff', 10, 14, 1.2);
    this.spot.position.set(0, 5, 1.2);
    this.group.add(this.spot);
  }

  private spot: THREE.PointLight;
  /** 0..1 of the light over the hero (dimmed when Elias turns to the player). */
  dimSpot(k: number): void { this.spot.intensity = 10 * Math.max(0, Math.min(1, k)); }

  private buildPlaza(): void {
    // the plaza: a cracked white disc, its edge crumbling into the void
    const parts: THREE.BufferGeometry[] = [];
    const disc = colored(new THREE.CylinderGeometry(18, 16, 1.2, 48, 1), '#d8d2c6', M(0, -0.6, 0, 1, 1, 1));
    // a pool of light around the kneeling hero, the plaza fading into the void at the edge
    {
      const pos = disc.getAttribute('position'), col = disc.getAttribute('color');
      const bright = new THREE.Color('#efe9dd'), dark = new THREE.Color('#5e566e');
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const r = Math.hypot(pos.getX(i), pos.getZ(i));
        c.copy(bright).lerp(dark, Math.min(1, Math.pow(r / 18, 1.6)));
        if (pos.getY(i) < -0.5) c.copy(dark).multiplyScalar(0.6);
        col.setXYZ(i, c.r, c.g, c.b);
      }
    }
    parts.push(disc);
    parts.push(colored(new THREE.RingGeometry(5.2, 5.8, 40).rotateX(-Math.PI / 2), '#b7ae9e', M(0, 0.02, 0, 1, 1, 1)));
    parts.push(colored(new THREE.RingGeometry(11.5, 12.1, 48).rotateX(-Math.PI / 2), '#b7ae9e', M(0, 0.02, 0, 1, 1, 1)));
    let seed = 21;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    // cracks
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, r = 2 + rnd() * 14, len = 1.5 + rnd() * 4;
      parts.push(colored(new THREE.BoxGeometry(0.07, 0.02, len), '#3a3140', M(Math.cos(a) * r, 0.015, Math.sin(a) * r, 1, 1, 1, 0, a + (rnd() - 0.5), 0)));
    }
    // broken columns in a ring
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.2;
      const r = 14;
      const hgt = 1.5 + rnd() * 7;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (z > 6 && Math.abs(x) < 6) continue; // keep the camera side open
      parts.push(colored(new THREE.CylinderGeometry(0.75, 0.85, hgt, 12), '#e4dfd4', M(x, hgt / 2, z, 1, 1, 1)));
      parts.push(colored(new THREE.CylinderGeometry(1.05, 1.05, 0.5, 12), '#cfc8ba', M(x, 0.25, z, 1, 1, 1)));
      for (let k = 0; k < 3; k++) parts.push(colored(new THREE.ConeGeometry(0.35, 0.8, 5), '#e4dfd4', M(x + (rnd() - 0.5) * 0.8, hgt + 0.2, z + (rnd() - 0.5) * 0.8, 1, 1, 1, (rnd() - 0.5) * 0.6, 0, (rnd() - 0.5) * 0.6)));
      if (rnd() < 0.6) parts.push(colored(new THREE.CylinderGeometry(0.7, 0.7, 3 + rnd() * 3, 12), '#d8d2c6', M(x * 0.8 + (rnd() - 0.5) * 3, 0.6, z * 0.8 + (rnd() - 0.5) * 3, 1, 1, 1, Math.PI / 2, rnd() * 3, 0)));
    }
    // the Concilio's round table, split in two
    parts.push(colored(new THREE.CylinderGeometry(2.2, 2.2, 0.25, 24, 1, false, 0, Math.PI * 0.9), '#bfa77a', M(4.5, 0.9, -5, 1, 1, 1, 0.2, 0.6, 0.1)));
    parts.push(colored(new THREE.CylinderGeometry(2.2, 2.2, 0.25, 24, 1, false, Math.PI, Math.PI * 0.8), '#bfa77a', M(5.6, 0.35, -4.2, 1, 1, 1, -0.5, 0.9, 0.3)));
    const geo = mergeGeometries(parts, false)!;
    const mat = toon('#ffffff', { vertexColors: true, bands: [0.45, 0.78, 1.0], rim: 0.2, rimColor: '#c9b8ff', unique: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true; mesh.castShadow = true;
    const out = new THREE.Mesh(geo, outlineMaterial(0.04, '#140e1c'));
    out.userData.isOutline = true;
    mesh.add(out);
    this.group.add(mesh);
    this.disposables.push(geo, mat);
    // floating debris, rising slowly out of time
    const debrisGeo = [new THREE.BoxGeometry(1, 0.5, 0.8), new THREE.DodecahedronGeometry(0.6, 0), new THREE.CylinderGeometry(0.5, 0.6, 1.4, 8)];
    const dmat = toon('#d9d3c7', { rim: 0.25, rimColor: '#c9b8ff', unique: true });
    for (let i = 0; i < 28; i++) {
      const g = debrisGeo[i % debrisGeo.length];
      const m = new THREE.Mesh(g, dmat);
      const a = rnd() * Math.PI * 2, r = 9 + rnd() * 22;
      const base = new THREE.Vector3(Math.cos(a) * r, 1 + rnd() * 14, Math.sin(a) * r - 4);
      if (base.z > 4 && Math.abs(base.x) < 5) base.x += 8;
      m.position.copy(base);
      m.scale.setScalar(0.5 + rnd() * 1.6);
      const o = new THREE.Mesh(g, outlineMaterial(0.04, '#140e1c'));
      o.userData.isOutline = true;
      m.add(o);
      this.group.add(m);
      this.floaters.push({ mesh: m, base, spin: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.4), ph: rnd() * 6, rise: 0.05 + rnd() * 0.2 });
    }
    this.disposables.push(...debrisGeo, dmat);
  }

  /** Replace Elias's rig (e.g. with the 'elias_god' special) keeping transform and pose. */
  swapElias(special: 'elias' | 'elias_god'): void {
    const old = this.elias;
    const e = buildCharacter({ seed: 'elias', race: 'excepcion', special });
    e.root.position.copy(old.root.position);
    e.root.rotation.copy(old.root.rotation);
    e.pose = old.pose;
    this.group.add(e.root);
    old.dispose();
    this.elias = e;
  }

  update(dt: number, time: number): void {
    this.t += dt;
    this.eclipse.update(dt, time);
    this.ash.update(dt);
    this.motes.update(dt);
    for (const f of this.floaters) {
      f.mesh.position.set(f.base.x, f.base.y + Math.sin(this.t * 0.4 + f.ph) * 0.6 + this.t * f.rise * 0.2, f.base.z);
      f.mesh.rotation.x += f.spin.x * dt; f.mesh.rotation.y += f.spin.y * dt; f.mesh.rotation.z += f.spin.z * dt;
    }
    this.aurel.update(dt, { speed: 0 });
    this.dog.update(dt, { speed: 0 });
  }

  dispose(): void {
    this.aurel.dispose(); this.elias.dispose(); this.dog.dispose();
    this.eclipse.dispose(); this.ash.dispose(); this.motes.dispose();
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose();
    void this.scene;
  }
}
