/**
 * Projectiles: SoA pool, ballistic or straight flight, grid-based hit tests against unit capsules,
 * instanced meshes per kind. Arrows that miss stick in the ground for a while (permanence).
 */
import * as THREE from 'three';
import type { Units } from './units';
import type { Grid } from './grid';
import { PartMesh } from './crowd';
import { crowdMaterial } from './crowdmat';
import { GB, PRIM } from './geo';
import { GRAVITY, P_ARROW, P_AXE, P_BOMB, P_BULLET, P_HAMMER, P_ORB, P_ROCK, P_SPEAR, S_DEAD } from './const';
import { hexLinear, launchAngle, writeBasis } from './mathx';
import { specAt } from './defs';

const MAXP = 700;
const MAXSTUCK = 220;

export interface ProjSpawn {
  kind: number;
  x: number; y: number; z: number;
  tx: number; ty: number; tz: number;
  speed: number;
  owner: number;
  side: number;
  dmg: number;
  knock?: number;
  radius?: number;          // AoE on impact
  ability?: number;         // AbilityRT index
  homing?: number;          // unit index
  arc?: 'low' | 'high' | 'none';
  color?: string;
  scale?: number;
  pierce?: number;
  life?: number;
  crit?: boolean;
  thrown?: number;          // unit index being thrown (ogre) — handled by the caller
}

export type ProjHit = (p: number, unit: number, x: number, y: number, z: number) => void;

const _c = [0, 0, 0];

function arrowGeo(): THREE.BufferGeometry {
  return new GB()
    .add(PRIM.cylLo, '#8a6a44', [0, 0, 0], [0.018, 0.9, 0.018])
    .add(PRIM.cone, '#dfe3ea', [0, 0.5, 0], [0.04, 0.12, 0.04])
    .add(PRIM.box, '#f0ead8', [0, -0.38, 0], [0.1, 0.16, 0.005])
    .add(PRIM.box, '#e2455b', [0, -0.38, 0], [0.005, 0.16, 0.1])
    .build();
}
function spearGeo(): THREE.BufferGeometry {
  return new GB().add(PRIM.cylLo, '#7a5436', [0, 0, 0], [0.03, 1.8, 0.03]).add(PRIM.cone, '#dfe3ea', [0, 0.95, 0], [0.07, 0.3, 0.07]).build();
}
function rockGeo(): THREE.BufferGeometry { return new GB().add(PRIM.dodeca, '#8a8078', [0, 0, 0], [0.5, 0.42, 0.46]).build(); }
function bulletGeo(): THREE.BufferGeometry { return new GB().add(PRIM.sphere, '#2a2430', [0, 0, 0], 0.07).build(); }
function bombGeo(): THREE.BufferGeometry {
  return new GB().add(PRIM.sphereHi, '#1a1420', [0, 0, 0], 0.22).add(PRIM.cylLo, '#6a5a4a', [0, 0.24, 0], [0.03, 0.1, 0.03])
    .add(PRIM.sphere, '#ffcf5a', [0, 0.31, 0], 0.05, [0, 0, 0], 0, 3).add(PRIM.box, '#ff4fa3', [0, 0, 0.2], [0.26, 0.05, 0.02]).build();
}
function axeGeo(): THREE.BufferGeometry {
  return new GB().add(PRIM.cylLo, '#7a5436', [0, 0, 0], [0.03, 0.8, 0.03]).add(PRIM.box, '#dfe3ea', [0.12, 0.3, 0], [0.24, 0.24, 0.03]).build();
}
function hammerGeo(): THREE.BufferGeometry {
  return new GB().add(PRIM.cylLo, '#7a5436', [0, 0, 0], [0.03, 0.8, 0.03]).add(PRIM.box, '#8a8a96', [0, 0.36, 0], [0.34, 0.2, 0.2]).build();
}

export class Projectiles {
  n = 0;
  readonly kind = new Uint8Array(MAXP);
  readonly x = new Float32Array(MAXP); readonly y = new Float32Array(MAXP); readonly z = new Float32Array(MAXP);
  readonly vx = new Float32Array(MAXP); readonly vy = new Float32Array(MAXP); readonly vz = new Float32Array(MAXP);
  readonly life = new Float32Array(MAXP);
  readonly owner = new Int16Array(MAXP);
  readonly side = new Uint8Array(MAXP);
  readonly dmg = new Float32Array(MAXP);
  readonly knock = new Float32Array(MAXP);
  readonly radius = new Float32Array(MAXP);
  readonly ab = new Int16Array(MAXP);
  readonly home = new Int16Array(MAXP);
  readonly grav = new Uint8Array(MAXP);
  readonly spin = new Float32Array(MAXP);
  readonly scale = new Float32Array(MAXP);
  readonly pierce = new Uint8Array(MAXP);
  readonly crit = new Uint8Array(MAXP);
  readonly col = new Float32Array(MAXP * 3);
  readonly lastHit = new Int16Array(MAXP);
  /** Unit carried by this projectile (thrown allies): moved along and released on impact. */
  readonly carry = new Int16Array(MAXP);

  private stuck = new Float32Array(MAXSTUCK * 8); // x,y,z, dx,dy,dz, life, kind
  private nStuck = 0;
  private meshes: PartMesh[] = [];
  private orbMesh: PartMesh;
  readonly root = new THREE.Group();
  private mats: THREE.Material[] = [];
  onHit: ProjHit = () => {};
  /** Called every frame for glowing projectiles (trail particles). */
  onTrail: ((p: number) => void) | null = null;

  constructor(scene: THREE.Scene, private u: Units, private grid: Grid, private groundAt: (x: number, z: number) => number) {
    scene.add(this.root);
    const mat = crowdMaterial({ rim: 0.2 });
    this.mats.push(mat);
    const geos: Record<number, THREE.BufferGeometry> = {
      [P_ARROW]: arrowGeo(), [P_BULLET]: bulletGeo(), [P_ROCK]: rockGeo(), [P_SPEAR]: spearGeo(), [P_BOMB]: bombGeo(), [P_AXE]: axeGeo(), [P_HAMMER]: hammerGeo(),
    };
    for (let k = 0; k <= P_HAMMER; k++) {
      if (k === P_ORB) { this.meshes.push(null as unknown as PartMesh); continue; }
      const cap = k === P_ARROW ? MAXP + MAXSTUCK : 200;
      this.meshes.push(new PartMesh(this.root, geos[k], mat, cap, { outline: k !== P_BULLET }));
    }
    const orbMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.mats.push(orbMat);
    const og = new THREE.IcosahedronGeometry(1, 2);
    this.orbMesh = new PartMesh(this.root, og, orbMat, 300, {});
    this.meshes[P_ORB] = this.orbMesh;
  }

  spawn(o: ProjSpawn): number {
    if (this.n >= MAXP) return -1;
    const i = this.n++;
    const g = o.kind !== P_ORB && o.kind !== P_BULLET && o.arc !== 'none';
    this.kind[i] = o.kind;
    this.x[i] = o.x; this.y[i] = o.y; this.z[i] = o.z;
    let dx = o.tx - o.x, dz = o.tz - o.z;
    const dy = o.ty - o.y;
    const dh = Math.hypot(dx, dz) || 1e-3;
    dx /= dh; dz /= dh;
    let sp = o.speed;
    if (g) {
      const high = o.arc === 'high';
      let th = launchAngle(sp, dh, dy, GRAVITY, high);
      if (th === null) { sp = Math.sqrt(GRAVITY * dh) * 1.05 + 1; th = launchAngle(sp, dh, dy, GRAVITY, high) ?? Math.PI / 4; }
      const c = Math.cos(th), s = Math.sin(th);
      this.vx[i] = dx * sp * c; this.vz[i] = dz * sp * c; this.vy[i] = sp * s;
    } else {
      const l = Math.hypot(dh, dy) || 1;
      this.vx[i] = (dx * dh / l) * sp; this.vz[i] = (dz * dh / l) * sp; this.vy[i] = (dy / l) * sp;
    }
    this.grav[i] = g ? 1 : 0;
    this.life[i] = o.life ?? 6;
    this.owner[i] = o.owner; this.side[i] = o.side;
    this.dmg[i] = o.dmg; this.knock[i] = o.knock ?? 0; this.radius[i] = o.radius ?? 0;
    this.ab[i] = o.ability ?? -1; this.home[i] = o.homing ?? -1;
    this.spin[i] = Math.random() * 6; this.scale[i] = o.scale ?? 1; this.pierce[i] = o.pierce ?? 0; this.crit[i] = o.crit ? 1 : 0;
    this.lastHit[i] = -1; this.carry[i] = o.thrown ?? -1;
    hexLinear(o.color ?? '#c7a2ff', _c); this.col[i * 3] = _c[0] * 2.4; this.col[i * 3 + 1] = _c[1] * 2.4; this.col[i * 3 + 2] = _c[2] * 2.4;
    return i;
  }

  private remove(i: number): void {
    const last = --this.n;
    if (i === last) return;
    this.kind[i] = this.kind[last]; this.x[i] = this.x[last]; this.y[i] = this.y[last]; this.z[i] = this.z[last];
    this.vx[i] = this.vx[last]; this.vy[i] = this.vy[last]; this.vz[i] = this.vz[last]; this.life[i] = this.life[last];
    this.owner[i] = this.owner[last]; this.side[i] = this.side[last]; this.dmg[i] = this.dmg[last]; this.knock[i] = this.knock[last];
    this.radius[i] = this.radius[last]; this.ab[i] = this.ab[last]; this.home[i] = this.home[last]; this.grav[i] = this.grav[last];
    this.spin[i] = this.spin[last]; this.scale[i] = this.scale[last]; this.pierce[i] = this.pierce[last]; this.crit[i] = this.crit[last];
    this.lastHit[i] = this.lastHit[last]; this.carry[i] = this.carry[last];
    this.col[i * 3] = this.col[last * 3]; this.col[i * 3 + 1] = this.col[last * 3 + 1]; this.col[i * 3 + 2] = this.col[last * 3 + 2];
  }

  /** Removes projectile i and returns true (used by hit callbacks via `consume`). */
  kill(i: number): void { this.life[i] = -1; }

  private stick(i: number): void {
    if (this.kind[i] !== P_ARROW && this.kind[i] !== P_SPEAR) return;
    let k = this.nStuck;
    if (k >= MAXSTUCK) { k = Math.floor(Math.random() * MAXSTUCK); } else this.nStuck++;
    const l = Math.hypot(this.vx[i], this.vy[i], this.vz[i]) || 1;
    const s = this.stuck, o = k * 8;
    s[o] = this.x[i]; s[o + 1] = this.y[i]; s[o + 2] = this.z[i];
    s[o + 3] = this.vx[i] / l; s[o + 4] = this.vy[i] / l; s[o + 5] = this.vz[i] / l;
    s[o + 6] = 14; s[o + 7] = this.kind[i];
  }

  update(dt: number): void {
    if (dt <= 0) return;
    const u = this.u;
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.remove(i); continue; }
      // homing (magic orbs)
      const h = this.home[i];
      if (h >= 0 && u.active[h] && u.state[h] !== S_DEAD) {
        const sp = Math.hypot(this.vx[i], this.vy[i], this.vz[i]);
        const tx = u.x[h] - this.x[i], ty = u.y[h] + 1 - this.y[i], tz = u.z[h] - this.z[i];
        const tl = Math.hypot(tx, ty, tz) || 1;
        const k = Math.min(1, dt * 5);
        this.vx[i] += ((tx / tl) * sp - this.vx[i]) * k; this.vy[i] += ((ty / tl) * sp - this.vy[i]) * k; this.vz[i] += ((tz / tl) * sp - this.vz[i]) * k;
      }
      if (this.grav[i]) this.vy[i] -= GRAVITY * dt;
      const px = this.x[i], py = this.y[i], pz = this.z[i];
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt; this.z[i] += this.vz[i] * dt;
      this.spin[i] += dt * 14;
      const c = this.carry[i];
      if (c >= 0 && u.active[c]) { u.x[c] = this.x[i]; u.y[c] = this.y[i] - 0.8; u.z[c] = this.z[i]; u.vx[c] = this.vx[i]; u.vy[c] = this.vy[i]; u.vz[c] = this.vz[i]; }
      if (this.onTrail && (this.kind[i] === P_ORB || this.kind[i] === P_BOMB)) this.onTrail(i);
      // unit hits (midpoint + end of the segment)
      let hitUnit = -1;
      const side = this.side[i];
      for (let pass = 0; pass < 2 && hitUnit < 0; pass++) {
        const qx = pass === 0 ? (px + this.x[i]) * 0.5 : this.x[i], qy = pass === 0 ? (py + this.y[i]) * 0.5 : this.y[i], qz = pass === 0 ? (pz + this.z[i]) * 0.5 : this.z[i];
        const g = this.grid;
        const c0 = g.cx(qx - 2.5), c1 = g.cx(qx + 2.5), r0 = g.cz(qz - 2.5), r1 = g.cz(qz + 2.5);
        for (let rz = r0; rz <= r1 && hitUnit < 0; rz++) for (let cx = c0; cx <= c1 && hitUnit < 0; cx++) {
          const cell = rz * g.cols + cx;
          for (let k = g.start[cell], e = g.start[cell + 1]; k < e; k++) {
            const j = g.items[k];
            if (j === this.owner[i] || j === this.lastHit[i] || u.side[j] === side || j === c) continue;
            const dx = u.x[j] - qx, dz = u.z[j] - qz, r = u.radius[j] + 0.22 * this.scale[i];
            if (dx * dx + dz * dz > r * r) continue;
            const hgt = specAt(u.spec[j]).height * (u.scale[j] / specAt(u.spec[j]).scale);
            if (qy < u.y[j] - 0.2 || qy > u.y[j] + hgt + 0.2) continue;
            hitUnit = j; break;
          }
        }
      }
      if (hitUnit >= 0) {
        this.lastHit[i] = hitUnit;
        this.onHit(i, hitUnit, this.x[i], this.y[i], this.z[i]);
        if (this.pierce[i] > 0) { this.pierce[i]--; continue; }
        this.remove(i);
        continue;
      }
      const gy = this.groundAt(this.x[i], this.z[i]);
      if (this.y[i] <= gy) {
        this.y[i] = gy;
        this.onHit(i, -1, this.x[i], gy, this.z[i]);
        this.stick(i);
        this.remove(i);
      }
    }
    // stuck arrows fade
    const s = this.stuck;
    for (let k = this.nStuck - 1; k >= 0; k--) {
      s[k * 8 + 6] -= dt;
      if (s[k * 8 + 6] <= 0) { const last = --this.nStuck; if (k !== last) for (let q = 0; q < 8; q++) s[k * 8 + q] = s[last * 8 + q]; }
    }
  }

  render(): void {
    for (const m of this.meshes) m.begin();
    for (let i = 0; i < this.n; i++) {
      const kind = this.kind[i], m = this.meshes[kind], k = m.next();
      if (k < 0) continue;
      const sc = this.scale[i];
      if (kind === P_ARROW || kind === P_SPEAR || kind === P_BULLET) {
        writeBasis(m.m, k * 16, this.x[i], this.y[i], this.z[i], this.vx[i], this.vy[i], this.vz[i], 0, 1, 0, sc, sc, sc);
      } else if (kind === P_ORB) {
        const r = 0.28 * sc * (1 + Math.sin(this.spin[i] * 3) * 0.12);
        writeBasis(m.m, k * 16, this.x[i], this.y[i], this.z[i], 0, 1, 0, 0, 0, 1, r, r, r);
        m.setRGB(k, this.col[i * 3], this.col[i * 3 + 1], this.col[i * 3 + 2]);
      } else {
        const a = this.spin[i];
        writeBasis(m.m, k * 16, this.x[i], this.y[i], this.z[i], Math.cos(a), Math.sin(a), 0.2, this.vx[i], 0, this.vz[i], sc, sc, sc);
      }
      m.setFx(k, 0, 0);
    }
    const am = this.meshes[P_ARROW], s = this.stuck;
    for (let q = 0; q < this.nStuck; q++) {
      const o = q * 8;
      const m = this.meshes[s[o + 7]] ?? am, k = m.next();
      if (k < 0) continue;
      const sink = 0.25;
      writeBasis(m.m, k * 16, s[o] - s[o + 3] * sink, s[o + 1] - s[o + 4] * sink, s[o + 2] - s[o + 5] * sink, s[o + 3], s[o + 4], s[o + 5], 0, 1, 0, 1, 1, 1);
      m.setFx(k, 0, 0);
    }
    for (const m of this.meshes) m.end();
  }

  clear(): void { this.n = 0; this.nStuck = 0; }

  dispose(): void {
    for (const m of this.meshes) m.dispose();
    for (const m of this.mats) m.dispose();
    this.root.removeFromParent();
  }
}
