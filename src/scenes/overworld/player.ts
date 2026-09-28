/**
 * Elias on the map: the anime rig (scaled for the diorama), a rowboat or — embarking near a port — a ship
 * with an eclipse sail (Mount & Blade style), straight-line travel to clicks, WASD relative to the camera.
 */
import * as THREE from 'three';
import { buildCharacter, type CharacterRig } from '../../characters/rig';
import { LOCATION_LIST } from '../../data/world';
import { heightAt, slopeAt, MAP_MAX, MAP_MIN } from '../../systems/world/geo';
import { toon, outlineMaterial } from '../../render/toon';
import { ModelBuilder, mergeColored, hullGeometry } from './modelKit';

export const ELIAS_SPEED = 5.6;
export const TOKEN_SCALE = 1.15;

function buildBoat(ship: boolean): THREE.Group {
  const b = new ModelBuilder();
  if (ship) {
    b.box('#2a1c24', [0, 0.14, 0], [1.1, 0.4, 2.8]);
    b.box('#2a1c24', [0, 0.2, 1.5], [0.7, 0.36, 0.6], [0, Math.PI / 4, 0]);
    b.box('#3a2a30', [0, 0.45, -1.15], [1.05, 0.4, 0.6]);
    b.box('#c9a878', [0, 0.36, 0.1], [0.95, 0.04, 2.3]);
    b.cyl('#3a2a24', [0, 0.36, 0.2], 0.05, 0.06, 2.9, 6);
    b.box('#1a1024', [0, 1.9, 0.25], [0.05, 1.8, 1.5]);
    b.box('#4b2a86', [0, 1.9, 0.26], [0.07, 0.12, 1.52]);
    b.glowSphere('#b27dff', [0.05, 2.0, 0.25], 0.32);
    b.sphere('#150b1f', [0.08, 2.0, 0.25], 0.27);
  } else {
    b.box('#6a4a30', [0, 0.1, 0], [0.8, 0.26, 1.7]);
    b.box('#6a4a30', [0, 0.14, 0.9], [0.5, 0.22, 0.36], [0, Math.PI / 4, 0]);
    b.box('#c9a878', [0, 0.22, 0], [0.66, 0.04, 1.5]);
    b.box('#5a4030', [0.55, 0.28, -0.1], [0.9, 0.04, 0.08], [0, 0.3, -0.35]);
  }
  const g = new THREE.Group();
  const solid = mergeColored(b.solid);
  if (solid) {
    const m = new THREE.Mesh(solid, toon('#ffffff', { vertexColors: true, bands: [0.55, 0.8, 1.0] }));
    m.castShadow = true;
    const o = new THREE.Mesh(hullGeometry(solid), outlineMaterial(0.04));
    o.userData.isOutline = true;
    m.add(o);
    g.add(m);
  }
  const glow = mergeColored(b.glow);
  if (glow) g.add(new THREE.Mesh(glow, new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.2, 2.2, 2.2) })));
  return g;
}

export class PlayerToken {
  readonly root = new THREE.Group();
  readonly rig: CharacterRig;
  private rowboat = buildBoat(false);
  private ship = buildBoat(true);
  readonly pos = new THREE.Vector3();
  vx = 0; vz = 0;
  yaw = 0;
  speed = 0;                    // current map speed (u/s, world time)
  target: { x: number; z: number } | null = null;
  targetLoc: string | null = null;
  targetParty: string | null = null;
  boat: 0 | 1 | 2 = 0;
  private t = 0;
  hidden = false;

  constructor() {
    this.rig = buildCharacter({ seed: 'elias', race: 'excepcion', special: 'elias' });
    this.rig.root.scale.setScalar(TOKEN_SCALE);
    this.root.add(this.rig.root, this.rowboat, this.ship);
    this.rowboat.visible = false; this.ship.visible = false;
    this.rig.root.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.userData.isOutline) o.castShadow = true; });
  }

  place(x: number, z: number): void {
    this.pos.set(x, Math.max(0, heightAt(x, z)), z);
    this.root.position.copy(this.pos);
    this.target = null; this.targetLoc = null; this.targetParty = null;
    this.boat = heightAt(x, z) < 0.08 ? 1 : 0;
  }

  get onWater(): boolean { return heightAt(this.pos.x, this.pos.z) < 0.08; }

  setTarget(x: number, z: number): void { this.target = { x, z }; this.targetLoc = null; this.targetParty = null; }
  stop(): void { this.target = null; this.targetLoc = null; this.targetParty = null; }

  /**
   * Moves with world dt (already scaled by map speed). `wish` is a camera-relative direction (x,z) or null.
   * Returns true when it stepped from land to water (embark) or back (disembark) this frame.
   */
  step(dt: number, wish: { x: number; z: number } | null, speedMult = 1): 'embark' | 'land' | null {
    this.t += dt;
    let dx = 0, dz = 0;
    if (wish && (wish.x || wish.z)) { dx = wish.x; dz = wish.z; this.target = null; this.targetLoc = null; this.targetParty = null; }
    else if (this.target) {
      dx = this.target.x - this.pos.x; dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.25) { this.target = null; dx = dz = 0; }
    }
    const len = Math.hypot(dx, dz);
    const wasWater = this.boat > 0;
    let event: 'embark' | 'land' | null = null;
    if (len > 1e-4 && dt > 0) {
      const water = this.onWater;
      let sp = ELIAS_SPEED * speedMult;
      if (water) sp *= this.boat === 2 ? 1.4 : 0.85;
      else sp *= 1 - Math.min(0.45, slopeAt(this.pos.x, this.pos.z) * 0.22);
      const step = Math.min(sp * dt, this.target ? Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) : Infinity);
      this.vx = (dx / len) * sp; this.vz = (dz / len) * sp;
      this.pos.x = Math.max(MAP_MIN + 3, Math.min(MAP_MAX - 3, this.pos.x + (dx / len) * step));
      this.pos.z = Math.max(MAP_MIN + 3, Math.min(MAP_MAX - 3, this.pos.z + (dz / len) * step));
      this.speed = sp;
      const targetYaw = Math.atan2(dx, dz);
      let dy = targetYaw - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * Math.min(1, dt * 10);
    } else { this.vx = this.vz = 0; this.speed = 0; }
    const nowWater = this.onWater;
    if (nowWater && !wasWater) {
      const port = LOCATION_LIST.some((l) => (l.services.includes('puerto') || l.kind === 'puerto' || l.kind === 'casino') && Math.hypot(l.pos.x - this.pos.x, l.pos.z - this.pos.z) < 13);
      this.boat = port ? 2 : 1;
      event = 'embark';
    } else if (!nowWater && wasWater) { this.boat = 0; event = 'land'; }
    return event;
  }

  /** Visual update with real dt (smooth even when the world is paused). `visualSpeed` = real u/s on screen. */
  animate(realDt: number, visualSpeed: number, time: number): void {
    const ground = heightAt(this.pos.x, this.pos.z);
    const water = ground < 0.08;
    const bob = water ? Math.sin(time * 2.2) * 0.08 : 0;
    this.root.position.set(this.pos.x, water ? bob : ground, this.pos.z);
    this.root.rotation.y = this.yaw;
    this.rowboat.visible = water && this.boat !== 2;
    this.ship.visible = water && this.boat === 2;
    if (water) {
      this.rig.pose = 'sit';
      this.rig.root.position.set(0, this.boat === 2 ? 0.28 : 0.12, this.boat === 2 ? -0.7 : -0.1);
      const tilt = Math.sin(time * 1.6) * 0.05;
      this.rowboat.rotation.z = tilt; this.ship.rotation.z = tilt;
    } else {
      this.rig.pose = 'idle';
      this.rig.root.position.set(0, 0, 0);
    }
    const rigSpeed = !water ? Math.min(7.5, visualSpeed / TOKEN_SCALE) : 0;
    this.rig.update(realDt, { speed: rigSpeed });
    this.rig.setOpacity(this.hidden ? 0.3 : 1);
  }
}

// ───────────────────────── aura ring (hugs the terrain) ─────────────────────────

const AURA_SEG = 48;
export function auraGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((AURA_SEG + 1) * 2 * 3), 3));
  const idx: number[] = [];
  for (let i = 0; i < AURA_SEG; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  g.setIndex(idx);
  return g;
}
/** Rewrites the ring so it hugs the terrain (never clipped by slopes). Dashed look via alternating width. */
export function conformRing(g: THREE.BufferGeometry, cx: number, cz: number, r0: number, r1: number, spin: number): void {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const arr = pos.array as Float32Array;
  for (let i = 0; i <= AURA_SEG; i++) {
    const a = (i / AURA_SEG) * Math.PI * 2 + spin;
    const dash = i % 6 < 4 ? 1 : 0.35;
    const c = Math.cos(a), s = Math.sin(a);
    const rin = r1 - (r1 - r0) * dash;
    const xi = cx + c * rin, zi = cz + s * rin, xo = cx + c * r1, zo = cz + s * r1;
    arr.set([xi, Math.max(0, heightAt(xi, zi)) + 0.16, zi, xo, Math.max(0, heightAt(xo, zo)) + 0.16, zo], i * 6);
  }
  pos.needsUpdate = true;
}

